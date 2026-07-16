export interface Env {
  USER_SESSIONS_KV?: KVNamespace;
  DB: D1Database;
  SITE_SEARCH?: any;
  AI: any;
  API_SECRET?: string;
  TAVILY_API_KEY?: string;
  FMP_API_KEY?: string;
}

export interface Message {
  role: string;
  content: any;
  tool_calls?: any[];
}

export interface SECCompanyTicker {
  cik_str: number;
  ticker: string;
  title: string;
}
