export interface Env {
  AI: any;
  API_SECRET: string;
  CF_CLIENT_ID?: string;
  CF_CLIENT_SECRET?: string;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    // Define CORS headers
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
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

    // Only allow POST requests at "/", "/api", or "/api/"
    const url = new URL(request.url);
    if (url.pathname !== "/" && url.pathname !== "/api" && url.pathname !== "/api/") {
      return new Response(
        JSON.stringify({ error: "Not Found" }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (request.method !== "POST") {
      return new Response(
        JSON.stringify({ error: `Method Not Allowed. Expected POST, received ${request.method}.` }),
        {
          status: 405,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    try {
      // 2. Extract the file from FormData
      const formData = await request.formData();
      let fileEntry: File | null = null;

      // Find the first File object in the form data
      for (const [key, value] of formData.entries()) {
        if (value instanceof File) {
          fileEntry = value;
          break;
        }
      }

      if (!fileEntry) {
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
        return new Response(
          JSON.stringify({ error: "Only PDF files are supported." }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      // 3. Convert to an ArrayBuffer and then create a clean Blob with explicit type
      const pdfBuffer = await fileEntry.arrayBuffer();
      const pdfBlob = new Blob([pdfBuffer], { type: 'application/pdf' });

      // 4. Call env.AI.toMarkdown with the exact array-of-objects signature
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
        return new Response(
          JSON.stringify({ error: `Failed to extract text from PDF natively: ${convErr.message || convErr}` }),
          {
            status: 422,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      if (!resumeMarkdown || resumeMarkdown.trim().length === 0) {
        return new Response(
          JSON.stringify({ error: "Failed to extract legible text using native parser." }),
          {
            status: 422,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      // 5. Build the CS-specialized prompt
      const systemPrompt = `You are an elite technical recruiter and Principal Systems Engineer specializing in evaluating candidates for highly competitive, deep-tech engineering roles (e.g., Systems Engineering, Distributed Systems, Kernel Development, Compilers, High-Performance Computing, and Infrastructure Engineering).

Analyze the candidate's resume text and provide a rigorous, objective, and highly constructive critique tailored to Computer Science standards. Evaluate the resume strictly on:

1. **Technical Skill Matrix & Logical Grouping**:
   - Are languages, tools, databases, and frameworks categorized logically?
   - Ensure low-level or systems languages/tools (e.g., C, C++, Rust, Assembly, CUDA, kernel spaces) are distinct from high-level web frameworks (e.g., React, Vue, Next.js) and infrastructure/cloud platforms (e.g., AWS, Kubernetes, Docker).
   - Point out buzzword clutter or inclusion of basic tools (like Git, VS Code, Slack, or macOS) that dilute professional credibility.

2. **Bullet Point Impact & Technical Metrics**:
   - Are achievements quantified using specific systems-level or business-level metrics (e.g., latency reduced by 40%, throughput scaled to 10k RPS, RAM usage halved, or lines of code refactored)?
   - Are the action verbs strong and technically descriptive (e.g., "architected", "profiled", "optimized", "refactored") instead of generic (e.g., "helped", "assisted", "worked on")?
   - Do the bullet points explain *how* things were built, not just *what* was built?

3. **Noise Reduction & Layout Whitespace**:
   - Suggest removing or heavily condensing non-technical or unrelated experiences (e.g., cashier roles, unrelated student societies, basic tutoring) that waste valuable vertical whitespace.
   - Advise on focusing formatting and structure to maximize layout efficiency.

Return your critique in clean, beautifully structured Markdown (with proper headings, lists, and bold text). Be direct, professional, and actionable. Do not output conversational preamble or postamble; start directly with the Markdown report.`;

      // 6. Request evaluation from the AGY bridge server
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
          body: JSON.stringify({
            systemPrompt,
            userPrompt: `Here is my resume text parsed from PDF:\n\n${resumeMarkdown}`
          })
        });

        if (!bridgeResponse.ok) {
          const errText = await bridgeResponse.text();
          throw new Error(`Bridge returned status ${bridgeResponse.status}: ${errText}`);
        }

        critique = await bridgeResponse.text();
      } catch (aiErr: any) {
        console.error("AGY Bridge error:", aiErr);
        return new Response(
          JSON.stringify({ error: `AGY Bridge execution failed: ${aiErr.message || aiErr}` }),
          {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      if (!critique) {
        return new Response(
          JSON.stringify({ error: "Empty response returned from AGY Bridge." }),
          {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      // 7. Return the completed critique
      return new Response(
        JSON.stringify({
          critique,
          extractedTextLength: resumeMarkdown.length
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
