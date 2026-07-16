import { Env } from "./types";
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

    // ROUTE 1.5: Fetches conversation history
    if (url.pathname === "/api/history" && request.method === "GET") {
      return handleHistoryRoute(request, env, userHistoryKey, userId);
    }

    // ROUTE 2: Processes incoming chat/image requests
    if (url.pathname === "/api/chat" && request.method === "POST") {
      return handleChatRoute(request, env, ctx, userHistoryKey, userId);
    }

    // ROUTE 3: OpenAI-Compatible completions
    if (url.pathname === "/v1/chat/completions" && request.method === "POST") {
      return handleCompletionsRoute(request, env);
    }

    // NEW ROUTE 4: GET /api/synthesize?tickers=AAPL,MSFT,NVDA
    if (url.pathname === "/api/synthesize" && request.method === "GET") {
      return handleSynthesizeRoute(request, env, url);
    }

    return new Response("Not Found", { status: 404 });
  }
};
