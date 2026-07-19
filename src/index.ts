import {
  getCritiqueSystemPrompt,
  getCritiqueUserPrompt
} from "./prompts";

export interface Env {
  AI: any;
  API_SECRET: string;
  CF_CLIENT_ID?: string;
  CF_CLIENT_SECRET?: string;
  RESUME_CRITIQUE_KV: KVNamespace;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    // Define CORS headers
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400",
    };

    // 1. Handle CORS Preflight
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders,
      });
    }

    // Support GET/POST at "/", "/api", "/api/", "/api/stats"
    const url = new URL(request.url);
    const validPaths = ["/", "/api", "/api/", "/api/stats"];
    if (!validPaths.includes(url.pathname)) {
      return new Response(
        JSON.stringify({ error: "Not Found" }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Handle stats query
    if (request.method === "GET") {
      let countVal = await env.RESUME_CRITIQUE_KV.get("upload_count");
      let currentCount = countVal ? parseInt(countVal, 10) : 0;
      return new Response(
        JSON.stringify({ count: currentCount }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (request.method !== "POST") {
      return new Response(
        JSON.stringify({ error: `Method Not Allowed. Expected GET or POST, received ${request.method}.` }),
        {
          status: 405,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Extract client IP for rate limiting
    const clientIP = request.headers.get("CF-Connecting-IP") || "anonymous";

    // 2. Enforce rate limiting: 1 request per minute per IP (Immediate lock)
    try {
      const isLimited = await env.RESUME_CRITIQUE_KV.get(`rate_limit:${clientIP}`);
      if (isLimited) {
        return new Response(
          JSON.stringify({ error: "Too Many Requests. You can only evaluate one resume per minute." }),
          {
            status: 429,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
      
      // Acquire lock immediately before starting any processing
      if (clientIP !== "anonymous") {
        await env.RESUME_CRITIQUE_KV.put(`rate_limit:${clientIP}`, "1", { expirationTtl: 60 });
      }
    } catch (kvErr) {
      console.error("KV rate limit lock error:", kvErr);
    }

    try {
      // 3. Extract the file and optional parameters from FormData
      const formData = await request.formData();
      const jobDescription = (formData.get("jobDescription") as string || "").trim();
      
      if (jobDescription.length > 5000) {
        // Clear lock on validation failure
        if (clientIP !== "anonymous") {
          await env.RESUME_CRITIQUE_KV.delete(`rate_limit:${clientIP}`).catch(() => {});
        }
        return new Response(
          JSON.stringify({ error: "Job description exceeds the maximum limit of 5000 characters." }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
      
      let fileEntry: File | null = null;

      // Find the first File object in the form data
      for (const [key, value] of formData.entries()) {
        if (value instanceof File) {
          fileEntry = value;
          break;
        }
      }

      if (!fileEntry) {
        // Clear lock on validation failure
        if (clientIP !== "anonymous") {
          await env.RESUME_CRITIQUE_KV.delete(`rate_limit:${clientIP}`).catch(() => {});
        }
        return new Response(
          JSON.stringify({ error: "No PDF file found in the multipart/form-data payload." }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      // Check if file is PDF (by mime type or extension)
      const isPdf = fileEntry.type === "application/pdf" || fileEntry.name.endsWith(".pdf");
      if (!isPdf) {
        // Clear lock on validation failure
        if (clientIP !== "anonymous") {
          await env.RESUME_CRITIQUE_KV.delete(`rate_limit:${clientIP}`).catch(() => {});
        }
        return new Response(
          JSON.stringify({ error: "Only PDF files are supported." }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      // 4. Convert to an ArrayBuffer and then create a clean Blob with explicit type
      const pdfBuffer = await fileEntry.arrayBuffer();
      const pdfBlob = new Blob([pdfBuffer], { type: 'application/pdf' });

      // Extract page count directly from PDF binary metadata structure
      let targetPageCount = 1;
      try {
        const decoder = new TextDecoder('ascii');
        const view = new Uint8Array(pdfBuffer);
        const text = decoder.decode(view);
        
        const countMatches = [...text.matchAll(/\/Count\s+(\d+)/g)];
        if (countMatches.length > 0) {
          let maxPages = 1;
          for (const match of countMatches) {
            const count = parseInt(match[1], 10);
            if (count > maxPages && count < 20) {
              maxPages = count;
            }
          }
          targetPageCount = maxPages;
        } else {
          const pageMatches = text.match(/\/Type\s*\/Page\b/g);
          if (pageMatches && pageMatches.length > 0 && pageMatches.length < 20) {
            targetPageCount = pageMatches.length;
          }
        }
        console.log(`Parsed actual PDF page count from binary metadata: ${targetPageCount}`);
      } catch (pdfErr) {
        console.warn("Failed to parse PDF binary page count:", pdfErr);
      }

      // 5. Call env.AI.toMarkdown with the exact array-of-objects signature
      let resumeMarkdown = "";
      try {
        const conversionResult = await env.AI.toMarkdown([
          {
            name: fileEntry.name || 'resume.pdf',
            blob: pdfBlob
          }
        ]);
        resumeMarkdown = conversionResult?.[0]?.data || "";
      } catch (convErr: any) {
        console.error("Native document conversion error:", convErr);
        // Clear lock on system failure
        if (clientIP !== "anonymous") {
          await env.RESUME_CRITIQUE_KV.delete(`rate_limit:${clientIP}`).catch(() => {});
        }
        return new Response(
          JSON.stringify({ error: `Failed to extract text from PDF natively: ${convErr.message || convErr}` }),
          {
            status: 422,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      if (!resumeMarkdown || resumeMarkdown.trim().length === 0) {
        // Clear lock on failure
        if (clientIP !== "anonymous") {
          await env.RESUME_CRITIQUE_KV.delete(`rate_limit:${clientIP}`).catch(() => {});
        }
        return new Response(
          JSON.stringify({ error: "Failed to extract legible text using native parser." }),
          {
            status: 422,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      // Fallback: If binary parsing resulted in 1 but the text volume is extremely large, adjust target
      if (targetPageCount === 1) {
        const charCount = resumeMarkdown.length;
        if (charCount > 4200) {
          targetPageCount = 2;
        }
        if (charCount > 8500) {
          targetPageCount = 3;
        }
      }
      const pageLabel = targetPageCount === 1 ? "SINGLE PAGE" : `${targetPageCount} PAGES`;

      // 6. Build the CS-specialized prompt with Prompt Injection defense
      const systemPrompt = getCritiqueSystemPrompt(pageLabel, !!jobDescription);
      const userPrompt = getCritiqueUserPrompt(resumeMarkdown, jobDescription);

      // 7. Request evaluation from the AGY bridge server
      let critique = "";
      try {
        const bridgeResponse = await fetch("https://agy.superjeffc.com/execute", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${env.API_SECRET || ""}`,
            "CF-Access-Client-Id": env.CF_CLIENT_ID || "",
            "CF-Access-Client-Secret": env.CF_CLIENT_SECRET || ""
          },
          body: JSON.stringify({ systemPrompt, userPrompt })
        });

        if (!bridgeResponse.ok) {
          const errText = await bridgeResponse.text();
          throw new Error(`Bridge returned status ${bridgeResponse.status}: ${errText}`);
        }

        critique = await bridgeResponse.text();
      } catch (aiErr: any) {
        console.error("AGY Bridge error:", aiErr);
        // Clear lock on failure
        if (clientIP !== "anonymous") {
          await env.RESUME_CRITIQUE_KV.delete(`rate_limit:${clientIP}`).catch(() => {});
        }
        return new Response(
          JSON.stringify({ error: `AGY Bridge execution failed: ${aiErr.message || aiErr}` }),
          {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      if (!critique) {
        // Clear lock on failure
        if (clientIP !== "anonymous") {
          await env.RESUME_CRITIQUE_KV.delete(`rate_limit:${clientIP}`).catch(() => {});
        }
        return new Response(
          JSON.stringify({ error: "Empty response returned from AGY Bridge." }),
          {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      // 8. Increment the upload counter in KV
      let countVal = await env.RESUME_CRITIQUE_KV.get("upload_count");
      let currentCount = countVal ? parseInt(countVal, 10) : 0;
      currentCount++;
      await env.RESUME_CRITIQUE_KV.put("upload_count", currentCount.toString());

      // 9. Return the completed critique
      return new Response(
        JSON.stringify({
          critique,
          extractedTextLength: resumeMarkdown.length,
          targetPageCount,
          count: currentCount
        }),
        {
          status: 200,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json"
          }
        }
      );

    } catch (error: any) {
      console.error("Unhandled error:", error);
      // Clear lock on unhandled failure
      if (clientIP !== "anonymous") {
        await env.RESUME_CRITIQUE_KV.delete(`rate_limit:${clientIP}`).catch(() => {});
      }
      return new Response(
        JSON.stringify({ error: error.message || error }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        }
      );
    }
  }
};
