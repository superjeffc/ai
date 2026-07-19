import { extractTextFromPDFBuffer } from "./pdf-helper";



export interface Env {
  AI: any;
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

    // CORS preflight handling
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


    // Process multipart/form-data
    try {
      const contentType = request.headers.get("content-type") || "";
      if (!contentType.includes("multipart/form-data")) {
        return new Response(
          JSON.stringify({ error: "Content-Type must be multipart/form-data" }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

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
          JSON.stringify({ error: "No PDF file found in the multipart/form-data payload under any field name." }),
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

      // Extract ArrayBuffer and call the edge-safe helper
      const arrayBuffer = await fileEntry.arrayBuffer();

      let resumeText = "";
      try {
        resumeText = await extractTextFromPDFBuffer(arrayBuffer);
      } catch (pdfErr: any) {
        console.error("PDF Parsing error:", pdfErr);
        return new Response(
          JSON.stringify({ error: `Failed to parse PDF document: ${pdfErr.message || pdfErr}` }),
          {
            status: 422,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      if (!resumeText || resumeText.trim().length === 0) {
        return new Response(
          JSON.stringify({ error: "Could not extract any text from the PDF. Ensure it contains text selectable elements (not scanned images)." }),
          {
            status: 422,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      // Construct prompts for Llama 3.1
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

      const userPrompt = `Here is the candidate's resume content extracted from the PDF:

---
${resumeText}
---

Provide the computer science resume critique.`;

      // Call Cloudflare Workers AI with Llama 3.1
      let aiResult;
      try {
        aiResult = await env.AI.run("@cf/meta/llama-3.1-8b-instruct-fp8", {
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt }
          ]
        });
      } catch (aiErr: any) {
        console.error("Workers AI error:", aiErr);
        return new Response(
          JSON.stringify({ error: `Workers AI execution failed: ${aiErr.message || aiErr}` }),
          {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      const critique = aiResult?.response || aiResult?.text || "";
      if (!critique) {
        return new Response(
          JSON.stringify({ error: "Empty response returned from Cloudflare Workers AI model." }),
          {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      // Return critique in JSON response format
      return new Response(
        JSON.stringify({
          critique,
          extractedTextLength: resumeText.length
        }),
        {
          status: 200,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json"
          }
        }
      );

    } catch (err: any) {
      console.error("Request handling error:", err);
      return new Response(
        JSON.stringify({ error: `Internal Server Error: ${err.message || err}` }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }
  }
};
