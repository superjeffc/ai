import { Env } from "./types";
import { getHTMLFrontend, getJSFrontend } from "./frontend";
import { synthesizeSingleTicker, runComparativeReduce, getCikForTicker, getRecentFilingInfo } from "./financials";

/**
 * ROUTE 1: Serves the Web UI Layout
 */
export async function handleFrontendRoute(request: Request, env: Env, userId: string): Promise<Response> {
  const response = new Response(getHTMLFrontend(), {
    headers: { "Content-Type": "text/html; charset=utf-8" }
  });
  response.headers.set(
    "Set-Cookie",
    `session_id=${userId}; Path=/; Max-Age=31536000; HttpOnly; Secure; SameSite=Lax`
  );
  return response;
}

/**
 * ROUTE 5: Comparative analysis synthesizer
 */
export async function handleSynthesizeRoute(request: Request, env: Env, url: URL): Promise<Response> {
  try {
    if (url.searchParams.get("clear_cache") === "true") {
      try {
        await env.DB.prepare("DELETE FROM earnings_cache").run();
      } catch (dbErr) {
        console.error("Failed to purge earnings cache:", dbErr);
      }
    }

    const tickersParam = url.searchParams.get("tickers");
    if (!tickersParam) {
      return new Response(JSON.stringify({ success: false, error: "Query parameter 'tickers' is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    const rawTickers = tickersParam
      .split(",")
      .map(t => t.trim().toUpperCase())
      .filter(Boolean);

    // Validate ticker formats to prevent malicious or malformed inputs
    const TICKER_REGEX = /^[A-Z]{1,5}(?:[.-][A-Z]{1,2})?$/;
    for (const ticker of rawTickers) {
      if (!TICKER_REGEX.test(ticker)) {
        return new Response(
          JSON.stringify({
            success: false,
            error: `Invalid ticker format: "${ticker}". Tickers must be 1-8 alphabetic characters, optionally containing a single dot or hyphen (e.g. AAPL, BRK.B).`
          }),
          {
            status: 400,
            headers: { "Content-Type": "application/json" }
          }
        );
      }
    }

    if (rawTickers.length > 4) {
      return new Response(JSON.stringify({ success: false, error: "Maximum of 4 tickers can be analyzed at a time." }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    const tickers = rawTickers;

    if (tickers.length === 0) {
      return new Response(JSON.stringify({ success: false, error: "No valid tickers provided" }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    const results: any[] = [];
    const missingTickers: any[] = [];

    // Parallel extraction of CIK and cached filings verification
    await Promise.all(
      tickers.map(async (ticker) => {
        try {
          const cik = await getCikForTicker(ticker, env);
          
          let info: { accessionNumber: string; filingDate: string; form: string } | null = null;

          // 1. Check local D1 latest_filings cache first (unless clear_cache is requested)
          const useCache = url.searchParams.get("clear_cache") !== "true";
          if (useCache) {
            const cachedFiling = await env.DB.prepare(
              "SELECT accession_number, filing_date, form, updated_at FROM latest_filings WHERE ticker = ?1"
            )
              .bind(ticker)
              .first<{ accession_number: string; filing_date: string; form: string; updated_at: string }>();

            if (cachedFiling) {
              const updatedAtMs = new Date(cachedFiling.updated_at).getTime();
              const ageInMs = Date.now() - (isNaN(updatedAtMs) ? 0 : updatedAtMs);
              const oneDayMs = 24 * 60 * 60 * 1000;

              if (ageInMs < oneDayMs) {
                info = {
                  accessionNumber: cachedFiling.accession_number,
                  filingDate: cachedFiling.filing_date,
                  form: cachedFiling.form
                };
              }
            }
          }

          // 2. Fetch from SEC if not found in D1 latest_filings or if it has expired
          if (!info) {
            const secInfo = await getRecentFilingInfo(cik);
            info = {
              accessionNumber: secInfo.accessionNumber,
              filingDate: secInfo.filingDate,
              form: secInfo.form
            };

            // Save to D1 latest_filings for future requests
            try {
              await env.DB.prepare(
                "INSERT OR REPLACE INTO latest_filings (ticker, cik, accession_number, filing_date, form, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, CURRENT_TIMESTAMP)"
              )
                .bind(ticker, cik, info.accessionNumber, info.filingDate, info.form)
                .run();
            } catch (dbErr) {
              console.error(`Failed to update latest_filings for ${ticker}:`, dbErr);
            }
          }

          // 3. Check if we already have the summary for this specific accession
          const cachedSummary = await env.DB.prepare(
            "SELECT summary FROM earnings_cache WHERE ticker = ?1 AND accession_number = ?2"
          )
            .bind(ticker, info.accessionNumber)
            .first<{ summary: string }>();

          if (cachedSummary && cachedSummary.summary) {
            if (cachedSummary.summary === "PENDING") {
              results.push({ ticker, error: "Ingesting..." });
            } else {
              results.push({
                ticker,
                cik,
                accessionNumber: info.accessionNumber,
                filingDate: info.filingDate,
                summary: cachedSummary.summary,
                cached: true
              });
            }
          } else {
            // Write PENDING lock record so we don't duplicate enqueue
            try {
              await env.DB.prepare(
                "INSERT INTO earnings_cache (ticker, accession_number, filing_date, summary) VALUES (?1, ?2, ?3, ?4)"
              )
                .bind(ticker, info.accessionNumber, info.filingDate, "PENDING")
                .run();
              
              missingTickers.push({ ticker, cik, accessionNumber: info.accessionNumber });
            } catch (dbLockErr) {
              // If write fails (conflict), another isolate wrote it first. Treat as pending.
            }
            results.push({ ticker, error: "Ingesting..." });
          }
        } catch (err: any) {
          results.push({ ticker, error: err.message || "Failed to retrieve filing metadata" });
        }
      })
    );

    // If there are missing reports or any are still ingesting, return processing
    const isAnyIngesting = results.some(r => r.error === "Ingesting..." || r.summary === "PENDING");

    if (missingTickers.length > 0 || isAnyIngesting) {
      if (env.SEC_QUEUE && missingTickers.length > 0) {
        for (const m of missingTickers) {
          await env.SEC_QUEUE.send({ ticker: m.ticker });
        }
      } else if (!env.SEC_QUEUE && missingTickers.length > 0) {
        console.warn("SEC_QUEUE binding is missing; cannot queue ingestion job.");
      }

      return new Response(
        JSON.stringify({
          success: true,
          status: "processing",
          data: {
            summaries: results.reduce((acc, curr) => {
              acc[curr.ticker] = curr;
              return acc;
            }, {} as Record<string, any>),
            synthesis: null
          }
        }),
        {
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*"
          }
        }
      );
    }

    // Execute Reduce Phase (with caching)
    const validResults = results.filter(r => r.summary && r.summary !== "PENDING" && !r.error);
    let synthesis = "";

    if (validResults.length > 0) {
      const sortedResults = [...validResults].sort((a, b) => a.ticker.localeCompare(b.ticker));
      const tickersKey = "SYNTHESIS:" + sortedResults.map(r => r.ticker).join(",");
      const accessionsKey = sortedResults.map(r => r.accessionNumber || "").join(",");

      try {
        const cachedSynth = await env.DB.prepare(
          "SELECT summary FROM earnings_cache WHERE ticker = ?1 AND accession_number = ?2"
        )
          .bind(tickersKey, accessionsKey)
          .first<{ summary: string }>();

        if (cachedSynth && cachedSynth.summary) {
          synthesis = cachedSynth.summary;
        }
      } catch (cacheErr) {
        console.error("Failed to query synthesis cache:", cacheErr);
      }

      if (!synthesis) {
        // Write PENDING synthesis lock to prevent duplicate enqueuing
        try {
          const maxFilingDate = sortedResults.reduce((max, r) => {
            return (r.filingDate && r.filingDate > max) ? r.filingDate : max;
          }, "1970-01-01");

          await env.DB.prepare(
            "INSERT OR REPLACE INTO earnings_cache (ticker, accession_number, filing_date, summary) VALUES (?1, ?2, ?3, ?4)"
          )
            .bind(tickersKey, accessionsKey, maxFilingDate, "PENDING")
            .run();

          if (env.SEC_QUEUE) {
            await env.SEC_QUEUE.send({
              type: "synthesis",
              tickers: sortedResults.map(r => r.ticker),
              results: validResults
            });
          }
        } catch (dbLockErr) {
          // If conflict occurs, it's already pending
        }

        synthesis = "PENDING";
      }

      if (synthesis === "PENDING") {
        return new Response(
          JSON.stringify({
            success: true,
            status: "synthesizing",
            data: {
              summaries: results.reduce((acc, curr) => {
                acc[curr.ticker] = curr;
                return acc;
              }, {} as Record<string, any>),
              synthesis: null
            }
          }),
          {
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*"
            }
          }
        );
      }
    } else {
      synthesis = "No valid ticker summaries were generated to perform comparative synthesis.";
    }

    const responsePayload = {
      success: true,
      status: "completed",
      data: {
        summaries: results.reduce((acc, curr) => {
          acc[curr.ticker] = curr;
          return acc;
        }, {} as Record<string, typeof results[0]>),
        synthesis
      }
    };

    return new Response(JSON.stringify(responsePayload), {
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      }
    });

  } catch (err: any) {
    console.error("Synthesizer pipeline failed:", err);
    return new Response(JSON.stringify({ success: false, error: err.message || "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}

/**
 * ROUTE 1.5: Serves the JS code for local development
 */
export async function handleJSRoute(request: Request, env: Env): Promise<Response> {
  return new Response(getJSFrontend(), {
    headers: { "Content-Type": "application/javascript; charset=utf-8" }
  });
}
