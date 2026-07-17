import { Env } from "./types";
import { synthesizeSingleTicker, runComparativeReduce } from "./financials";
import {
  handleFrontendRoute,
  handleHistoryRoute,
  handleChatRoute,
  handleCompletionsRoute,
  handleSynthesizeRoute
} from "./routes";

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // Dynamic session handling
    const cookieHeader = request.headers.get("Cookie") || "";
    let userId: string | null = null;

    const cookies = cookieHeader.split(";");
    for (let cookie of cookies) {
      const [name, value] = cookie.trim().split("=");
      if (name === "session_id" && value) {
        userId = value;
        break;
      }
    }

    if (!userId) {
      userId = crypto.randomUUID();
    }

    const userHistoryKey = `user_history:${userId}`;

    // ROUTE 1: Serves the Web UI Layout
    if (url.pathname === "/" && request.method === "GET") {
      return handleFrontendRoute(request, env, userId);
    }

    // ROUTE 2: Fetches conversation history
    if (url.pathname === "/api/history" && request.method === "GET") {
      return handleHistoryRoute(request, env, userHistoryKey, userId);
    }

    // ROUTE 3: Processes incoming chat/image requests
    if (url.pathname === "/api/chat" && request.method === "POST") {
      return handleChatRoute(request, env, ctx, userHistoryKey, userId);
    }

    // ROUTE 4: OpenAI-Compatible completions
    if (url.pathname === "/v1/chat/completions" && request.method === "POST") {
      return handleCompletionsRoute(request, env);
    }

    // ROUTE 5: GET /api/synthesize?tickers=AAPL,MSFT,NVDA
    if (url.pathname === "/api/synthesize" && request.method === "GET") {
      return handleSynthesizeRoute(request, env, url);
    }

    return new Response("Not Found", { status: 404 });
  },

  async queue(batch: any, env: Env): Promise<void> {
    for (const message of batch.messages) {
      const body = message.body;
      if (body.type === "synthesis") {
        const { tickers, results } = body;
        const sortedResults = [...results].sort((a, b) => a.ticker.localeCompare(b.ticker));
        const tickersKey = "SYNTHESIS:" + sortedResults.map(r => r.ticker).join(",");
        const accessionsKey = sortedResults.map(r => r.accessionNumber || "").join(",");
        try {
          console.log(`Queue Synthesis: Processing synthesis for ${tickers.join(", ")}`);
          const synthesis = await runComparativeReduce(results, env);
          
          const maxFilingDate = sortedResults.reduce((max, r) => {
            return (r.filingDate && r.filingDate > max) ? r.filingDate : max;
          }, "1970-01-01");

          await env.DB.prepare(
            "INSERT OR REPLACE INTO earnings_cache (ticker, accession_number, filing_date, summary) VALUES (?1, ?2, ?3, ?4)"
          )
            .bind(tickersKey, accessionsKey, maxFilingDate, synthesis)
            .run();
        } catch (err: any) {
          console.error(`Queue synthesis failed:`, err.message);
          try {
            await env.DB.prepare(
              "DELETE FROM earnings_cache WHERE ticker = ?1 AND summary = 'PENDING'"
            )
              .bind(tickersKey)
              .run();
          } catch (dbErr) {
            console.error(`Failed to delete PENDING synthesis lock:`, dbErr);
          }
        }
      } else {
        const { ticker } = body;
        try {
          console.log(`Queue Ingestion: Processing ${ticker}`);
          const res = await synthesizeSingleTicker(ticker, env);
          if (res.error) {
            throw new Error(res.error);
          }
        } catch (err: any) {
          console.error(`Queue consumer failed for ${ticker}:`, err.message);
          try {
            await env.DB.prepare(
              "DELETE FROM earnings_cache WHERE ticker = ?1 AND summary = 'PENDING'"
            )
              .bind(ticker)
              .run();
          } catch (dbErr) {
            console.error(`Failed to delete PENDING lock for ${ticker}:`, dbErr);
          }
        }
      }
      message.ack();
    }
  }
};
