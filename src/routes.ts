import { Env, Message } from "./types";
import { getHTMLFrontend } from "./frontend";
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
 * ROUTE 2: Fetches conversation history
 */
export async function handleHistoryRoute(request: Request, env: Env, userHistoryKey: string, userId: string): Promise<Response> {
  try {
    let historyRaw = env.USER_SESSIONS_KV ? await env.USER_SESSIONS_KV.get(userHistoryKey) : null;
    let messages = historyRaw ? JSON.parse(historyRaw) : [];
    const visibleMessages = messages.filter((msg: any) => msg.role !== "system");

    const response = new Response(JSON.stringify({ success: true, history: visibleMessages }), {
      headers: { "Content-Type": "application/json" }
    });
    response.headers.set(
      "Set-Cookie",
      `session_id=${userId}; Path=/; Max-Age=31536000; HttpOnly; Secure; SameSite=Lax`
    );
    return response;
  } catch (error: any) {
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}

/**
 * ROUTE 3: Processes incoming chat/image requests
 */
export async function handleChatRoute(request: Request, env: Env, ctx: ExecutionContext, userHistoryKey: string, userId: string): Promise<Response> {
  try {
    if (!env.AI) {
      throw new Error("The 'AI' binding is missing in dashboard settings.");
    }

    const { message, clearMemory, image } = await request.json() as {
      message?: string;
      clearMemory?: boolean;
      image?: string;
    };

    if (clearMemory) {
      if (env.USER_SESSIONS_KV) {
        await env.USER_SESSIONS_KV.delete(userHistoryKey);
      }
      const response = new Response(JSON.stringify({ success: true, response: "Your memory context wiped clean!" }), {
        headers: { "Content-Type": "application/json" }
      });
      response.headers.set(
        "Set-Cookie",
        `session_id=${userId}; Path=/; Max-Age=31536000; HttpOnly; Secure; SameSite=Lax`
      );
      return response;
    }

    const trimmedMessage = message ? message.trim() : "";

    // Image generation
    if (trimmedMessage.toLowerCase().startsWith('/image ')) {
      const imagePrompt = trimmedMessage.substring(7).trim();
      const imageResponse = await env.AI.run(
        '@cf/black-forest-labs/flux-1-schnell',
        { prompt: imagePrompt, seed: Math.floor(Math.random() * 100000) }
      );

      if (!imageResponse || !imageResponse.image) {
        throw new Error("FLUX failed to render image data.");
      }

      const response = new Response(JSON.stringify({ success: true, isImage: true, response: imageResponse.image }), {
        headers: { "Content-Type": "application/json", "X-Is-Image": "true" }
      });
      response.headers.set(
        "Set-Cookie",
        `session_id=${userId}; Path=/; Max-Age=31536000; HttpOnly; Secure; SameSite=Lax`
      );
      return response;
    }

    // Intent check
    let shouldSearch = false;
    let isCooking = false;
    const hasDocument = trimmedMessage.includes('[Extracted Document:');

    if (!image && !hasDocument) {
      try {
        const intentCheck = await env.AI.run(
          '@cf/meta/llama-3.1-8b-instruct-fp8',
          {
            messages: [
              {
                role: "system",
                content: "Classify the user's query into two distinct categories. " +
                         "1. Web Search: Does it need current web info (news, weather, sports, dates, local schedules)? " +
                         "2. Cooking: Is the query related to food, recipes, cooking techniques, or ingredients? " +
                         "Respond ONLY in this exact format: SEARCH=[YES/NO], COOKING=[YES/NO]"
              },
              { role: "user", content: trimmedMessage }
            ],
            max_tokens: 15,
            temperature: 0.0
          }
        );

        const intentResponse = (intentCheck.response || "").trim().toUpperCase();
        shouldSearch = /SEARCH\s*=\s*\[?YES\]?/.test(intentResponse);
        isCooking = /COOKING\s*=\s*\[?YES\]?/.test(intentResponse);
      } catch (intentError) {
        console.error("Intent classification failed, defaulting to generic mode:", intentError);
      }
    }

    let historyRaw = env.USER_SESSIONS_KV ? await env.USER_SESSIONS_KV.get(userHistoryKey) : null;
    const currentTimestamp = new Date().toLocaleString("en-US", { timeZone: "America/New_York" });

    let dynamicSystemPrompt = `You are Kite, a witty, brilliant personal AI assistant. CRITICAL TEMPORAL CONTEXT:
- The current date and time is exactly ${currentTimestamp}.
- The user is currently in NYC.\n`;

    if (isCooking) {
      dynamicSystemPrompt = `You are Kite, a brilliant personalized culinary assistant. Keep your answers short and precise. CULINARY RULES:
- Adhere strictly to a gluten-free diet (avoid gluten). For example, substitute tamari for soy sauce.
- Adhere to a low-sodium framework (be mindful of sodium in sauces).
- Do NOT say the recipe is modified, it adds unnecessary fluff.
- Do NOT say that you are substituting ingredients in the recipe, it adds unnecessary fluff.
- Do NOT suggest any ingredients not explicitly mentioned in the recipe.
- Do NOT suggest processed chicken like chicken sausage, chicken kielbasa, or chicken nuggets.
- AVOID added sugar, including powdered sugar. Honey is okay.
- AVOID dairy products, such as cheese and milk. Suggest dairy-free alternatives if the recipe requires dairy.
- AVOID fried food.
- AVOID spicy food.
- EXCLUDE ingredients including wine or corn starch or oyster sauce.
- For cooking quinoa in an Instant Pot, advise to cook on high pressure for 1 minute with a 1.25:1 water to quinoa ratio.
- For cooking chicken drumsticks in an Instant Pot, advise to cook on high pressure for 10 minutes (15 minutes if frozen). Add 1 cup of water to the pot and use the steaming trivet.
- For cooking millet rice in an Instant Pot, advise to cook on high pressure for 5 minutes with a 2:1 water to millet rice ratio.
- SUBSTITUTE red meat (pork, beef, and lamb) and processed meats with chicken due to the lower saturated fat content.
- SUBSTITUTE rice with quinoa.
- ALWAYS suggest using extra virgin olive oil when a recipe calls for oil (explicitly keep sesame oil if called for).\n`;
    }

    dynamicSystemPrompt += `\nIf a section labeled '[Real-time Web Search Results]' or '[Website Context]' is present in the user's message, ` +
                           `you MUST use that data to answer their question as factual, current reality. ` +
                           `Never state that you do not have access to real-time information if search context is provided. ` +
                           `Format your answers neatly using Markdown.`;

    let messages: Message[] = historyRaw ? JSON.parse(historyRaw) : [
      { role: "system", content: dynamicSystemPrompt }
    ];

    if (messages[0] && messages[0].role === "system") {
      messages[0].content = dynamicSystemPrompt;
    } else {
      messages.unshift({ role: "system", content: dynamicSystemPrompt });
    }

    let siteContext = "";
    let searchContext = "";

    if (isCooking && env.SITE_SEARCH) {
      try {
        const siteSearch = await env.SITE_SEARCH.search({
          messages: [{ role: "user", content: trimmedMessage }],
          ai_search_options: {
            retrieval: { max_num_results: 3 }
          }
        });

        if (siteSearch.chunks && siteSearch.chunks.length > 0) {
          siteContext = "\n\n[Website Context from superjeffc.com]:\n" +
            siteSearch.chunks.map((chunk: any) => `- ${chunk.text}`).join("\n");
        }
      } catch (searchError) {
        console.error("AI Search failed:", searchError);
      }
    }

    const needsWebFallback = isCooking && !siteContext;

    if ((shouldSearch || needsWebFallback) && env.TAVILY_API_KEY) {
      try {
        const todayStr = new Date().toLocaleDateString("en-US", { timeZone: "America/New_York" });
        const searchQuery = needsWebFallback
          ? `${trimmedMessage} recipe ingredients instructions`
          : `${trimmedMessage} current status live updates ${todayStr}`;

        const tavilyResponse = await fetch("https://api.tavily.com/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            api_key: env.TAVILY_API_KEY,
            query: searchQuery,
            search_depth: "advanced",
            include_answer: false,
            max_results: 3
          })
        });

        if (tavilyResponse.ok) {
          const searchData = await tavilyResponse.json() as { results?: Array<{ title: string; content: string; url: string }> };
          if (searchData.results && searchData.results.length > 0) {
            searchContext = "\n\n[Real-time Web Search Results]:\n" +
              searchData.results.map(r => `- ${r.title}: "${r.content}" (Source: ${r.url})`).join("\n");
          }
        }
      } catch (searchError) {
        console.error("Tavily fallback search failed:", searchError);
      }
    }

    const messageWithContext = trimmedMessage + searchContext + siteContext;
    let finalMessageContent: any = messageWithContext;

    if (image) {
      finalMessageContent = [
        { type: "text", text: messageWithContext || "Analyze this image." },
        { type: "image_url", image_url: { url: image } }
      ];
    }

    messages.push({ role: "user", content: finalMessageContent });

    const aiResponseStream = await env.AI.run(
      '@cf/meta/llama-4-scout-17b-16e-instruct',
      {
        messages: messages,
        max_tokens: 1500,
        stream: true
      }
    );

    let fullResponseText = "";
    const decoder = new TextDecoder();
    const encoder = new TextEncoder();
    let serverBuffer = "";

    const transformStream = new TransformStream({
      transform(chunk, controller) {
        serverBuffer += decoder.decode(chunk, { stream: true });
        const lines = serverBuffer.split("\n");
        serverBuffer = lines.pop() || "";

        for (const line of lines) {
          const cleaned = line.trim();
          if (!cleaned || cleaned === "data: [DONE]") continue;

          let token = "";
          if (cleaned.startsWith("data: ")) {
            try {
              const parsed = JSON.parse(cleaned.slice(6).trim());
              token = parsed.response || parsed.choices?.[0]?.delta?.content || "";
            } catch {}
          } else {
            try {
              const parsed = JSON.parse(cleaned);
              token = parsed.response || parsed.choices?.[0]?.delta?.content || "";
            } catch {
              token = cleaned;
            }
          }

          if (token) {
            fullResponseText += token;
            controller.enqueue(encoder.encode(token));
          }
        }
      },
      flush(controller) {
        if (fullResponseText && env.USER_SESSIONS_KV) {
          if (image) {
            const lastMsg = messages[messages.length - 1];
            if (Array.isArray(lastMsg.content) && lastMsg.content[0]) {
              lastMsg.content[0].text = trimmedMessage || "Analyze this image.";
            }
          } else {
            messages[messages.length - 1].content = trimmedMessage;
          }

          messages.push({ role: "assistant", content: fullResponseText });

          let historyToSave = messages;
          if (historyToSave.length > 30) {
            historyToSave = [historyToSave[0], ...historyToSave.slice(-29)];
          }
          ctx.waitUntil(env.USER_SESSIONS_KV.put(userHistoryKey, JSON.stringify(historyToSave)));
        }
      }
    });

    const response = new Response(aiResponseStream.pipeThrough(transformStream), {
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-cache" }
    });

    response.headers.set(
      "Set-Cookie",
      `session_id=${userId}; Path=/; Max-Age=31536000; HttpOnly; Secure; SameSite=Lax`
    );

    return response;

  } catch (error: any) {
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  }
}

/**
 * ROUTE 4: OpenAI-Compatible completions
 */
export async function handleCompletionsRoute(request: Request, env: Env): Promise<Response> {
  try {
    const authHeader = request.headers.get("Authorization");
    const expectedToken = env.API_SECRET;

    if (!expectedToken || authHeader !== `Bearer ${expectedToken}`) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" }
      });
    }

    const body = await request.json() as {
      messages?: any[];
      stream?: boolean;
      max_tokens?: number;
    };
    const messages = Array.isArray(body.messages) ? body.messages : [];
    const systemPrompt = "You are Kite, a brilliant personal AI assistant.";

    const processedMessages = messages.map(msg => {
      let content = msg.content;
      if (Array.isArray(content)) {
        content = content
          .filter(part => part.type === "text")
          .map(part => part.text)
          .join("\n");
      }
      return { role: msg.role, content: content };
    });

    const finalMessages = [
      { role: "system", content: systemPrompt },
      ...processedMessages.map(msg => ({
        role: msg.role,
        content: msg.content,
        tool_calls: msg.tool_calls || []
      }))
    ];

    const isStream = body.stream || false;

    const aiResponseStream = await env.AI.run(
      '@cf/meta/llama-4-scout-17b-16e-instruct',
      {
        messages: finalMessages,
        max_tokens: body.max_tokens || 2000,
        stream: isStream
      }
    );

    if (isStream) {
      const encoder = new TextEncoder();
      const decoder = new TextDecoder();

      const transformStream = new TransformStream({
        transform(chunk, controller) {
          const text = decoder.decode(chunk, { stream: true });
          const lines = text.split('\n');

          for (const line of lines) {
            if (line.trim().startsWith('data: ')) {
              try {
                const json = JSON.parse(line.trim().slice(6));
                const content = json.response || "";

                const openAIChunk = {
                  id: "chatcmpl-kite",
                  object: "chat.completion.chunk",
                  created: Math.floor(Date.now() / 1000),
                  model: "kite-llama-4-scout",
                  choices: [{
                    delta: {
                      content: content,
                      tool_calls: []
                    },
                    index: 0,
                    finish_reason: null
                  }]
                };
                controller.enqueue(encoder.encode(`data: ${JSON.stringify(openAIChunk)}\n\n`));
              } catch (e) { /* Ignore partials */ }
            }
          }
        },
        flush(controller) {
          const finishChunk = {
            id: "chatcmpl-kite",
            object: "chat.completion.chunk",
            choices: [{ delta: {}, index: 0, finish_reason: "stop" }]
          };
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(finishChunk)}\n\n`));
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        }
      });

      return new Response(aiResponseStream.pipeThrough(transformStream), {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          "Connection": "keep-alive"
        }
      });
    } else {
      return Response.json({
        id: `chatcmpl-${crypto.randomUUID()}`,
        object: "chat.completion",
        created: Math.floor(Date.now() / 1000),
        model: "kite-llama-4-scout",
        choices: [{
          index: 0,
          message: {
            role: "assistant",
            content: [{ type: "text", text: aiResponseStream.response }],
            tool_calls: []
          },
          finish_reason: "stop"
        }],
      });
    }
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
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
          
          // 1. Fast Cache Check: check D1 for any filing within last 80 days
          const recentCached = await env.DB.prepare(
            "SELECT accession_number, filing_date, summary FROM earnings_cache WHERE ticker = ?1 AND summary != 'PENDING' ORDER BY filing_date DESC LIMIT 1"
          )
            .bind(ticker)
            .first<{ accession_number: string; filing_date: string; summary: string }>();

          if (recentCached && recentCached.filing_date) {
            const filingDateMs = new Date(recentCached.filing_date).getTime();
            if (!isNaN(filingDateMs)) {
              const ageInDays = (Date.now() - filingDateMs) / (1000 * 60 * 60 * 24);
              if (ageInDays < 80) {
                results.push({
                  ticker,
                  cik,
                  accessionNumber: recentCached.accession_number,
                  filingDate: recentCached.filing_date,
                  summary: recentCached.summary,
                  cached: true
                });
                return;
              }
            }
          }

          // 2. Fetch Latest Metadata from SEC to verify exact accession alignment
          const info = await getRecentFilingInfo(cik);
          
          // 3. Exact Accession Cache Check
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
