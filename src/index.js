export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // 1. BULLETPROOF COOKIE SESSION HANDLING
    const cookieHeader = request.headers.get("Cookie") || "";
    let userId = null;

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
      const response = new Response(getHTMLFrontend(), {
        headers: { "Content-Type": "text/html; charset=utf-8" }
      });
      
      response.headers.set(
        "Set-Cookie", 
        `session_id=${userId}; Path=/; Max-Age=31536000; HttpOnly; Secure; SameSite=Lax`
      );
      return response;
    }

    // ROUTE 1.5: Fetches raw conversation history for client-side state recovery
    if (url.pathname === "/api/history" && request.method === "GET") {
      try {
        let historyRaw = env.USER_SESSIONS_KV ? await env.USER_SESSIONS_KV.get(userHistoryKey) : null;
        let messages = historyRaw ? JSON.parse(historyRaw) : [];
        const visibleMessages = messages.filter(msg => msg.role !== "system");

        const response = new Response(JSON.stringify({ success: true, history: visibleMessages }), {
          headers: { "Content-Type": "application/json" }
        });

        response.headers.set(
          "Set-Cookie", 
          `session_id=${userId}; Path=/; Max-Age=31536000; HttpOnly; Secure; SameSite=Lax`
        );
        return response;
      } catch (error) {
        return new Response(JSON.stringify({ success: false, error: error.message }), {
          status: 500,
          headers: { "Content-Type": "application/json" }
        });
      }
    }

    // ROUTE 2: Processes incoming chat/image requests
    if (url.pathname === "/api/chat" && request.method === "POST") {
      try {
        if (!env.AI) {
          throw new Error("The 'AI' binding is missing in dashboard settings.");
        }

        const { message, clearMemory, image } = await request.json();

        // ── USER CLEAR MEMORY ISOLATION ─────────────────────────────────────
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

        // ── IMAGE GENERATION TRIGGER ──────────────────────────────────────────
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

        // ── INTENT CLASSIFICATION LAYER ──────────────────────────────────────
        let shouldSearch = false;
        let isCooking = false;
        
        const hasDocument = trimmedMessage.includes('[Extracted Document:');
        
        // HARD BYPASS: Skip intent classification entirely if an image or document is provided.
        // This prevents blind vector/web searches from polluting the Vision model's context or wasting tokens.
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

        // ── ISOLATED CONVERSATION STORAGE LAYER ──────────────────────────────
        let historyRaw = env.USER_SESSIONS_KV ? await env.USER_SESSIONS_KV.get(userHistoryKey) : null;
        const currentTimestamp = new Date().toLocaleString("en-US", { timeZone: "America/New_York" });

        // Build the dynamic system prompt framework based on intent
        let dynamicSystemPrompt = `
          You are Kite, a witty, brilliant personal AI assistant. CRITICAL TEMPORAL CONTEXT: 
            - The current date and time is exactly ${currentTimestamp}.
            - The user is currently in NYC.
          \n`;

        if (isCooking) {
          dynamicSystemPrompt = `
            You are a Kite, a brilliant personalized culinary assistant. Keep your answers short and precise. CULINARY RULES:
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
            - For cooking quiona in an Instant Pot, advise to cook on high pressure for 1 minute with a 1.25:1 water to quinoa ratio.
            - For cooking chicken drumsticks in an Instant Pot, advise to cook on high pressure for 10 minutes (15 minutes if frozen). Add 1 cup of water to the pot and use the steaming trivet.
            - For cooking millet rice in an Instant Pot, advise to cook on high pressure for 5 minutes with a 2:1 water to millet rice ratio.
            - SUBSTITUTE red meat (pork, beef, and lamb) and processed meats with chicken due to the lower saturated fat content. 
            - SUBSTITUTE rice with quinoa.
            - ALWAYS suggest using extra virgin olive oil when a recipe calls for oil (explicitly keep sesame oil if called for).
            - \n`;
        }

        dynamicSystemPrompt += `\nIf a section labeled '[Real-time Web Search Results]' or '[Website Context]' is present in the user's message, ` +
                               `you MUST use that data to answer their question as factual, current reality. ` +
                               `Never state that you do not have access to real-time information if search context is provided. ` +
                               `Format your answers neatly using Markdown.`;

        let messages = historyRaw ? JSON.parse(historyRaw) : [
          { role: "system", content: dynamicSystemPrompt }
        ];

        if (messages[0] && messages[0].role === "system") {
          messages[0].content = dynamicSystemPrompt;
        } else {
          messages.unshift({ role: "system", content: dynamicSystemPrompt });
        }

        // ── UNIFIED CONTEXT SEARCH LAYER (LOCAL WITH TAVILY FALLBACK) ────────
        let siteContext = "";
        let searchContext = "";

        // Step 1: Always check local site vector search first if it's a culinary intent
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
                siteSearch.chunks.map(chunk => `- ${chunk.text}`).join("\n");
            }
          } catch (searchError) {
            console.error("AI Search failed:", searchError);
          }
        }

        // Step 2: Determine if Tavily is necessary (explicit general search OR missing local recipe)
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
              const searchData = await tavilyResponse.json();
              if (searchData.results && searchData.results.length > 0) {
                searchContext = "\n\n[Real-time Web Search Results]:\n" + 
                  searchData.results.map(r => `- ${r.title}: "${r.content}" (Source: ${r.url})`).join("\n");
              }
            }
          } catch (searchError) {
            console.error("Tavily fallback search failed:", searchError);
          }
        }

        // ── INFERENCE GENERATION ─────────────────────────────────────────────
        const messageWithContext = trimmedMessage + searchContext + siteContext;
        
        let finalMessageContent = messageWithContext;
        
        // If an image is provided, structure the content payload for LLaMA Vision
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
            serverBuffer = lines.pop(); 

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
              // Strip hidden search context before saving to history
              if (image) {
                messages[messages.length - 1].content[0].text = trimmedMessage || "Analyze this image.";
              } else {
                messages[messages.length - 1].content = trimmedMessage; 
              }
              
              messages.push({ role: "assistant", content: fullResponseText });
              
              if (messages.length > 30) messages = [messages[0], ...messages.slice(-29)];
              ctx.waitUntil(env.USER_SESSIONS_KV.put(userHistoryKey, JSON.stringify(messages)));
            }
          }
        });

        const transformedStream = aiResponseStream.pipeThrough(transformStream);
        const response = new Response(transformedStream, {
          headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-cache" }
        });

        response.headers.set(
          "Set-Cookie", 
          `session_id=${userId}; Path=/; Max-Age=31536000; HttpOnly; Secure; SameSite=Lax`
        );

        return response;

      } catch (error) {
        return new Response(JSON.stringify({ success: false, error: error.message }), { 
          status: 200, 
          headers: { "Content-Type": "application/json" }
        });
      }
    }

    // ROUTE 3: OpenAI-Compatible API for VS Code Integration
    if (url.pathname === "/v1/chat/completions" && request.method === "POST") {
      try {
        const authHeader = request.headers.get("Authorization");
        const expectedToken = env.API_SECRET;
        
        if (!expectedToken || authHeader !== `Bearer ${expectedToken}`) {
          return new Response(JSON.stringify({ error: "Unauthorized" }), { 
            status: 401, 
            headers: { "Content-Type": "application/json" } 
          });
        }

        const body = await request.json();
        const messages = Array.isArray(body.messages) ? body.messages : [];
        const systemPrompt = "You are Kite, a brilliant personal AI assistant.";

        // 1. Flatten multimodal content (arrays) into text strings
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

        // 2. Build final messages, enforcing your system prompt
        // Ensure every message in the history has the expected shape
        const finalMessages = [
          { role: "system", content: systemPrompt },
          ...processedMessages.map(msg => ({
            role: msg.role,
            content: msg.content,
            tool_calls: msg.tool_calls || [] // Force this property to exist
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

        // 3. Streaming Response Formatting
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
                    
                    // In your streaming transform loop
                    const openAIChunk = {
                      id: "chatcmpl-kite",
                      object: "chat.completion.chunk",
                      created: Math.floor(Date.now() / 1000),
                      model: "kite-llama-4-scout",
                      choices: [{
                        delta: { 
                          // Important: Continue expects the delta content to be a string 
                          // even if the message history uses an array structure.
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
          // Standard JSON response
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
                tool_calls: [] // Ensure this is present
              },
              finish_reason: "stop" // Ensure this is strictly a string
            }],
          });
        }
      } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), { 
          status: 500, 
          headers: { "Content-Type": "application/json" } 
        });
      }
    }

    // UNKNOWN ROUTE
    return new Response("Not Found", { status: 404 });
  }
};

function getHTMLFrontend() {
  return `
  <!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>Kite</title>
    <script src="https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4"></script>
    <script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
    
    <script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"></script>
    <script>pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';</script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js"></script>

    <style>
      body { background-color: #111827; color: #f3f4f6; font-family: sans-serif; }
      ::-webkit-scrollbar { width: 4px; }
      ::-webkit-scrollbar-thumb { background: #374151; border-radius: 2px; }
      .prose h1 { font-size: 1.3rem; font-weight: bold; margin-bottom: 0.5rem; color: #fff; }
      .prose h2 { font-size: 1.15rem; font-weight: bold; margin-bottom: 0.4rem; color: #fff; }
      .prose ul { list-style-type: disc; margin-left: 1.1rem; margin-bottom: 0.5rem; color: rgba(255,255,255,0.8); }
      .prose ol { list-style-type: decimal; margin-left: 1.1rem; margin-bottom: 0.5rem; color: rgba(255,255,255,0.8); }
      .prose p { margin-bottom: 0.4rem; font-size: 0.95rem; }
      .prose code { background-color: rgba(0,0,0,0.3); padding: 0.125rem 0.25rem; border-radius: 0.25rem; color: #60a5fa; font-family: monospace; font-size: 0.85rem; }
      
      @supports (padding-bottom: env(safe-area-inset-bottom)) {
        .safe-bottom {
          padding-bottom: calc(env(safe-area-inset-bottom) + 0.5rem);
        }
      }
    </style>
  </head>
  <body class="flex flex-col h-[100dvh] max-w-4xl mx-auto p-3 sm:p-4">

    <header class="flex justify-between items-center py-2 sm:py-4 border-b border-gray-800 shrink-0">
      <div class="flex items-center gap-2">
        <span class="w-2.5 h-2.5 bg-blue-500 rounded-full animate-pulse"></span>
        <h1 class="text-lg sm:text-xl font-bold tracking-tight text-white">Kite</h1>
      </div>
      <button id="clear-mem-btn" onclick="clearMemory()" class="flex items-center gap-1.5 px-2.5 py-1.5 text-gray-400 hover:text-red-400 bg-gray-800/30 hover:bg-red-950/20 border border-gray-800 hover:border-red-900/40 rounded-lg transition text-xs font-semibold cursor-pointer" aria-label="Clear chat memory">
        <span class="btn-icon-wrapper">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-4 h-4">
            <path stroke-linecap="round" stroke-linejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
          </svg>
        </span>
        <span class="btn-label-text hidden sm:inline">Clear</span>
      </button>
    </header>

    <main id="chat-window" class="flex-1 overflow-y-auto my-3 space-y-4 pr-1 relative">
      <div id="welcome-message" class="flex flex-col items-start gap-1 max-w-[90%] sm:max-w-[85%] group">
        <div class="bg-gray-800/40 border border-gray-800/60 p-3 sm:p-4 rounded-xl prose w-full">
          Hello! How can I help you today?
        </div>
      </div>
    </main>

    <footer id="chat-footer" class="pb-2 sm:pb-4 shrink-0 safe-bottom">
      <div id="image-preview-container" class="hidden px-2 mb-2">
        <div class="relative inline-block">
          <img id="image-preview" class="h-16 w-16 object-cover rounded-lg border border-gray-700">
          <button type="button" onclick="clearFile()" class="absolute -top-2 -right-2 bg-gray-800 text-white rounded-full p-0.5 border border-gray-600 hover:bg-red-500 transition-colors">
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>
      </div>
      <form id="chat-form" onsubmit="sendMessage(event)" class="flex items-end gap-2 bg-gray-900 border border-gray-800 p-2 rounded-xl focus-within:border-gray-700 transition w-full box-border">
        <input type="file" id="file-upload" accept="image/*,.pdf,.docx,.doc" class="hidden" onchange="handleFileSelect(event)">
        <button type="button" onclick="document.getElementById('file-upload').click()" class="p-2 mb-[2px] text-gray-400 hover:text-white transition shrink-0" aria-label="Upload file">
           <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-5 h-5">
             <path stroke-linecap="round" stroke-linejoin="round" d="M18.375 12.739l-7.693 7.693a4.5 4.5 0 01-6.364-6.364l10.94-10.94A3 3 0 1119.5 7.372L8.552 18.32m.009-.01l-.01.01m5.699-9.941l-7.81 7.81a1.5 1.5 0 002.112 2.13" />
           </svg>
        </button>
        <textarea id="user-input" rows="1" autocomplete="off" placeholder="Ask Kite or use '/image'..." class="flex-1 min-w-0 w-full bg-transparent pl-2 pr-1 py-1.5 mb-[2px] outline-none text-white placeholder-gray-500 text-base leading-normal resize-none h-[38px] max-h-[120px] overflow-y-auto"></textarea>
        <button type="submit" class="bg-blue-600 hover:bg-blue-500 text-white p-2 mb-[1px] rounded-lg transition shrink-0 w-9 h-9 flex items-center justify-center" aria-label="Send message">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor" class="w-4 h-4">
            <path stroke-linecap="round" stroke-linejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
          </svg>
        </button>
      </form>
    </footer>

    <script>
      const chatWindow = document.getElementById('chat-window');
      const userInput = document.getElementById('user-input');
      const chatForm = document.getElementById('chat-form');
      let currentImageBase64 = null;
      
      setTimeout(() => {
        userInput.focus({ preventScroll: true });
      }, 100);

      document.addEventListener('DOMContentLoaded', loadChatHistory);

      async function handleFileSelect(event) {
        const file = event.target.files[0];
        if (!file) return;

        const fileType = file.type;
        const fileName = file.name.toLowerCase();

        // Standard Image processing
        if (fileType.startsWith('image/')) {
          const reader = new FileReader();
          reader.onload = (e) => {
            setPreviewImage(e.target.result);
          };
          reader.readAsDataURL(file);
        } 
        // PDF processing (Extracts text from ALL pages and appends to text box)
        else if (fileName.endsWith('.pdf') || fileType === 'application/pdf') {
          try {
            const arrayBuffer = await file.arrayBuffer();
            const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
            let fullText = "";

            // Loop through every page to extract text content strings
            for (let i = 1; i <= pdf.numPages; i++) {
              const page = await pdf.getPage(i);
              const textContent = await page.getTextContent();
              const pageText = textContent.items.map(item => item.str).join(" ");
              fullText += \`--- Page \${i} ---\\n\` + pageText + "\\n\\n";
            }
            
            if (fullText.trim()) {
              const docContext = \`\\n\\n[Extracted Document: \${file.name}]\\n\` + fullText + \`\\n\`;
              userInput.value = userInput.value + docContext;
              autoResizeTextArea();
              userInput.focus();
            }
          } catch (err) {
            alert("Failed to parse PDF text: " + err.message);
          }
        } 
        // DOCX processing (extracts plain text and injects into text box)
        else if (fileName.endsWith('.docx') || fileName.endsWith('.doc') || fileType.includes('wordprocessingml')) {
          try {
            const arrayBuffer = await file.arrayBuffer();
            const result = await mammoth.extractRawText({ arrayBuffer: arrayBuffer });
            const text = result.value.trim();
            
            if (text) {
              const docContext = \`\\n\\n[Extracted Document: \${file.name}]\\n\` + text + \`\\n\`;
              userInput.value = userInput.value + docContext;
              autoResizeTextArea();
              userInput.focus();
            }
          } catch (err) {
            alert("Failed to parse Word Document: " + err.message);
          }
        }

        // Reset the input so the same file can be selected again if cleared
        document.getElementById('file-upload').value = '';
      }

      function setPreviewImage(base64Str) {
        currentImageBase64 = base64Str;
        document.getElementById('image-preview').src = currentImageBase64;
        document.getElementById('image-preview-container').classList.remove('hidden');
        userInput.focus();
      }

      function clearFile() {
        currentImageBase64 = null;
        document.getElementById('file-upload').value = '';
        document.getElementById('image-preview-container').classList.add('hidden');
      }

      // ── TEXTAREA DYNAMIC AUTO-GROW LOGIC ────────────────────────────────
      userInput.addEventListener('input', autoResizeTextArea);

      function autoResizeTextArea() {
        userInput.style.height = 'auto'; // Reset height bounds to calculate inner content height
        userInput.style.height = userInput.scrollHeight + 'px'; // Set to fit inner container volume up to max-h
      }

      // ── SHIFT+ENTER INTERCEPTION LAYER ──────────────────────────────────
      userInput.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') {
          if (!e.shiftKey) {
            e.preventDefault(); // Stop default newline generation
            chatForm.requestSubmit(); // Safely trigger the form's onsubmit handler
          }
        }
      });

      // ── GLOBAL "/" HOTKEY INTERCEPTION LAYER ────────────────────────────
      document.addEventListener('keydown', function(e) {
        if (e.key === '/') {
          const tag = document.activeElement.tagName;
          if (tag !== 'TEXTAREA' && tag !== 'INPUT') {
            e.preventDefault(); 
            userInput.focus();
          }
        }
      });

      if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', adjustForKeyboard);
        window.visualViewport.addEventListener('scroll', adjustForKeyboard);
      }

      window.addEventListener('scroll', () => {
        if (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA') {
          window.scrollTo(0, 0);
        }
      });

      function adjustForKeyboard() {
        const vv = window.visualViewport;
        document.body.style.height = \`\${vv.height}px\`;
        window.scrollTo(0, 0);
      }

      async function loadChatHistory() {
        try {
          const res = await fetch('/api/history', { credentials: 'include' });
          const data = await res.json();
          
          if (data.success && data.history && data.history.length > 0) {
            const welcomeMsg = document.getElementById('welcome-message');
            if (welcomeMsg) welcomeMsg.remove();

            data.history.forEach(msg => {
              const sender = msg.role === 'user' ? 'user' : 'ai';
              let displayContent = msg.content;
              let imageUrl = null;

              if (Array.isArray(msg.content)) {
                displayContent = msg.content.find(c => c.type === 'text')?.text || "";
                imageUrl = msg.content.find(c => c.type === 'image_url')?.image_url?.url || null;
              }

              appendBubble(displayContent, sender, false, imageUrl);
            });
          }
        } catch (err) {
          console.error("Failed to load historical session elements:", err);
        }
      }

      async function sendMessage(e) {
        e.preventDefault();
        const text = userInput.value.trim();
        if (!text && !currentImageBase64) return;

        if ('ontouchstart' in window || navigator.maxTouchPoints > 0) {
          userInput.blur();
        } else {
          userInput.focus();
        }

        const welcomeMsg = document.getElementById('welcome-message');
        if (welcomeMsg) welcomeMsg.remove();

        const userPromptId = appendBubble(text, 'user', false, currentImageBase64);
        
        // Grab the image string before clearing UI
        const imagePayload = currentImageBase64;
        
        userInput.value = '';
        userInput.style.height = '38px'; 
        clearFile(); // Updated reference to clearFile

        chatWindow.style.paddingBottom = '80vh';

        const promptElement = document.getElementById(userPromptId);
        if (promptElement) {
          const lockToTop = () => {
            chatWindow.scrollTop = promptElement.offsetTop - 16;
          };
          
          lockToTop();
          setTimeout(lockToTop, 50);
          setTimeout(lockToTop, 150);
          setTimeout(lockToTop, 300);
        }

        const isImageRequest = text.toLowerCase().startsWith('/image ');
        const loadingId = appendBubble('', 'ai', true);

        try {
          const requestBody = { message: text };
          if (imagePayload) {
            requestBody.image = imagePayload;
          }

          const res = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody),
            credentials: 'include'
          });

          const wrapper = document.getElementById(loadingId);
          const textBubble = wrapper.querySelector('.text-bubble');
          textBubble.classList.remove('animate-pulse', 'text-gray-500');

          if (res.headers.get("X-Is-Image") === "true") {
            const data = await res.json();
            if (!data.success) throw new Error(data.error || "Image building error");
            textBubble.innerHTML = \`<img src="data:image/jpeg;base64,\${data.response}" class="rounded-lg max-w-full h-auto shadow-md mt-1 border border-gray-700" alt="AI Generated Image" />\`;
            chatWindow.style.paddingBottom = '0px';
            return;
          }

          const reader = res.body.getReader();
          const decoder = new TextDecoder();
          let fullStreamingText = "";

          while (true) {
            const { value, done } = await reader.read();
            if (done) break;

            fullStreamingText += decoder.decode(value, { stream: true });
            textBubble.innerHTML = marked.parse(fullStreamingText);
          }

          appendCopyButton(wrapper, fullStreamingText);
          chatWindow.style.paddingBottom = '0px';

        } catch (err) {
          chatWindow.style.paddingBottom = '0px';
          const textBubble = document.getElementById(loadingId).querySelector('.text-bubble');
          textBubble.className = "text-bubble bg-red-950/40 text-red-400 p-3 rounded-xl border border-red-900/50 text-sm w-full";
          textBubble.innerText = "❌ Network connection error reading token stream: " + err.message;
        }
      }

      function appendBubble(content, sender, isLoading = false, imageUrl = null) {
        const id = 'container-' + Math.random().toString(36).substr(2, 9);
        
        const wrapper = document.createElement('div');
        wrapper.id = id;
        
        const innerBubble = document.createElement('div');
        innerBubble.className = "text-bubble p-3 rounded-xl prose text-sm sm:text-base break-words w-full whitespace-pre-wrap";

        if (sender === 'user') {
          wrapper.className = "flex flex-col items-end gap-1 max-w-[90%] sm:max-w-[85%] ml-auto group";
          innerBubble.classList.add("bg-blue-600", "text-white", "shadow-sm");
          
          if (imageUrl) {
            const img = document.createElement('img');
            img.src = imageUrl;
            img.className = "rounded-lg max-w-full h-auto max-h-64 object-cover mb-1 border border-blue-500 shadow-sm";
            innerBubble.appendChild(img);
          }
          
          if (content) {
            const textSpan = document.createElement('span');
            textSpan.innerText = content;
            innerBubble.appendChild(textSpan);
          }
        } else {
          wrapper.className = "flex flex-col items-start gap-1 max-w-[90%] sm:max-w-[85%] group";
          innerBubble.classList.add("bg-gray-800", "text-gray-200", "border", "border-gray-700/50");
          
          if (isLoading) {
            innerBubble.innerText = content || "Thinking...";
            innerBubble.classList.add('animate-pulse', 'text-gray-500');
          } else {
            innerBubble.innerHTML = marked.parse(content);
          }
        }

        wrapper.appendChild(innerBubble);
        
        if (!isLoading && content) {
          appendCopyButton(wrapper, content);
        }
        
        chatWindow.appendChild(wrapper);
        return id;
      }

      function appendCopyButton(targetWrapper, textToCopy) {
        const btnContainer = document.createElement('div');
        btnContainer.className = "flex justify-end w-full opacity-60 group-hover:opacity-100 transition px-1";
        
        const btn = document.createElement('button');
        btn.className = "flex items-center gap-1 text-xs text-gray-400 hover:text-white transition cursor-pointer py-0.5 px-1.5 rounded bg-gray-900/30 border border-gray-800/40";
        
        btn.innerHTML = \`
          <svg class="w-3.5 h-3.5 copy-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M8 7V3a1 1 0 011-1h10a1 1 0 011 1v12a1 1 0 01-1 1h-4M3 7h10a1 1 0 011 1v12a1 1 0 01-1 1H3a1 1 0 01-1-1V8a1 1 0 011-1z"/></svg>
          <span class="copy-text">Copy</span>
        \`;
        
        btn.onclick = async () => {
          try {
            await navigator.clipboard.writeText(textToCopy);
            
            const icon = btn.querySelector('.copy-icon');
            const label = btn.querySelector('.copy-text');
            
            btn.classList.add('text-green-400');
            label.innerText = 'Copied!';
            icon.innerHTML = \`<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7" />\`;
            
            setTimeout(() => {
              btn.classList.remove('text-green-400');
              label.innerText = 'Copy';
              icon.innerHTML = \`<path stroke-linecap="round" stroke-linejoin="round" d="M8 7V3a1 1 0 011-1h10a1 1 0 011 1v12a1 1 0 01-1 1h-4M3 7h10a1 1 0 011 1v12a1 1 0 01-1 1H3a1 1 0 01-1-1V8a1 1 0 011-1z"/>\`;
            }, 1800);
          } catch (err) {
            console.error("Clipboard failure:", err);
          }
        };
        
        btnContainer.appendChild(btn);
        targetWrapper.appendChild(btnContainer);
      }

      async function clearMemory() {
        const btn = document.getElementById('clear-mem-btn');
        if (btn.classList.contains('text-green-400')) return;

        const iconWrapper = btn.querySelector('.btn-icon-wrapper');
        const labelText = btn.querySelector('.btn-label-text');
        
        const nativeIcon = iconWrapper.innerHTML;
        const nativeLabelText = labelText.innerText;

        try {
          await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ clearMemory: true }),
            credentials: 'include'
          });

          chatWindow.innerHTML = \`
            <div id="welcome-message" class="flex flex-col items-start gap-1 max-w-[90%] sm:max-w-[85%] group">
              <div class="bg-gray-800/40 border border-gray-800/60 p-3 sm:p-4 rounded-xl prose w-full">
                Hello! How can I help you today?
              </div>
            </div>
          \`;

          btn.classList.remove('text-gray-400', 'hover:text-red-400');
          btn.classList.add('text-green-400');
          labelText.innerText = 'Cleared!';
          iconWrapper.innerHTML = \`
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor" class="w-4 h-4">
              <path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5" />
            </svg>
          \`;

          setTimeout(() => {
            btn.classList.remove('text-green-400');
            btn.classList.add('text-gray-400', 'hover:text-red-400');
            labelText.innerText = nativeLabelText;
            iconWrapper.innerHTML = nativeIcon;
          }, 1800);

        } catch (err) {
          console.error("Failed to cleanly execute memory optimization swap:", err);
        }
      }
    </script>
  </body>
  </html>
  `;
}