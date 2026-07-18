import { Env } from "./types";

const SEC_HEADERS = {
  "User-Agent": "MultiTickerScreener/1.0 (jeff@superjeffc.com)",
  "Accept-Encoding": "gzip, deflate"
};

/**
 * Fetches the SEC's real-time Atom feed of recent 10-K and 10-Q submissions,
 * parses any new filings, and syncs them into our local D1 database.
 */
export async function syncLatestFilings(env: Env): Promise<void> {
  const url = "https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&type=10-K&type=10-Q&output=atom";

  try {
    const res = await fetch(url, { headers: SEC_HEADERS });
    if (!res.ok) {
      console.error(`Failed to fetch SEC Atom feed: ${res.statusText}`);
      return;
    }

    const xmlText = await res.text();
    const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
    let match;
    let syncCount = 0;

    // Use a regex-based parser to avoid XML parsing dependencies in Cloudflare Worker environment
    while ((match = entryRegex.exec(xmlText)) !== null) {
      const entryContent = match[1];

      const cikMatch = entryContent.match(/\((\d{10})\)/);
      const accMatch = entryContent.match(/accession-number=([\d-]+)/);
      const dateMatch = entryContent.match(/Filed:&lt;\/b&gt;\s*(\d{4}-\d{2}-\d{2})/);
      const formMatch = entryContent.match(/term="([^"]+)"/);

      if (cikMatch && accMatch && dateMatch && formMatch) {
        const cik = cikMatch[1];
        const accessionNumber = accMatch[1];
        const filingDate = dateMatch[1];
        const form = formMatch[1]; // e.g. "10-K", "10-Q", "10-K/A", etc.

        // Only cache base 10-K and 10-Q filings (we want to exclude amendments like /A unless needed)
        if (form === "10-K" || form === "10-Q") {
          // Check if this CIK maps to any ticker we track in the database
          const mapping = await env.DB.prepare("SELECT ticker FROM ticker_cik_mapping WHERE cik = ?1")
            .bind(cik)
            .first<{ ticker: string }>();

          if (mapping && mapping.ticker) {
            // Check if we already have the summary for this specific accession
            const cached = await env.DB.prepare(
              "SELECT summary FROM earnings_cache WHERE ticker = ?1 AND accession_number = ?2"
            )
              .bind(mapping.ticker, accessionNumber)
              .first<{ summary: string }>();

            // Proactively queue ingestion in the background if it is a new filing
            if (!cached) {
              try {
                // Write a PENDING lock record to earnings_cache
                await env.DB.prepare(
                  "INSERT INTO earnings_cache (ticker, accession_number, filing_date, summary) VALUES (?1, ?2, ?3, ?4)"
                )
                  .bind(mapping.ticker, accessionNumber, filingDate, "PENDING")
                  .run();

                // Send the ingestion task to the Cloudflare Queue
                if (env.SEC_QUEUE) {
                  await env.SEC_QUEUE.send({ ticker: mapping.ticker });
                  console.log(`[Proactive Sync] Enqueued background ingestion for ${mapping.ticker} (Accession: ${accessionNumber})`);
                } else {
                  console.warn(`[Proactive Sync] SEC_QUEUE binding is missing; cannot queue ingestion for ${mapping.ticker}`);
                }
              } catch (dbLockErr) {
                // Conflict indicates it was already locked or inserted by another isolate, safe to ignore
              }
            }

            // Update latest_filings with the new metadata
            await env.DB.prepare(
              "INSERT OR REPLACE INTO latest_filings (ticker, cik, accession_number, filing_date, form, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, CURRENT_TIMESTAMP)"
            )
              .bind(mapping.ticker, cik, accessionNumber, filingDate, form)
              .run();

            syncCount++;
          }
        }
      }
    }

    console.log(`Successfully synced ${syncCount} recent filings from SEC Atom feed.`);
  } catch (err: any) {
    console.error("Filing sync failed:", err.message || err);
  }
}
