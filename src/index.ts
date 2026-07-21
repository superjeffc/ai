import {
  getAtsSystemPrompt,
  getAtsUserPrompt,
  getGrammarSystemPrompt,
  getGrammarUserPrompt,
  getLayoutSystemPrompt,
  getLayoutUserPrompt,
  getEditorSystemPrompt,
  getEditorUserPrompt,
  getValidatorSystemPrompt,
  getValidatorUserPrompt
} from "./prompts";

export interface Env {
  AI: any;
  API_SECRET: string;
  CF_CLIENT_ID?: string;
  CF_CLIENT_SECRET?: string;
  RESUME_CRITIQUE_KV: KVNamespace;
}

async function callAgyBridge(env: Env, systemPrompt: string, userPrompt: string): Promise<string> {
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

  return await bridgeResponse.text();
}

// Helper to find index of a byte array inside another byte array
function indexOf(arr: Uint8Array, subarr: Uint8Array, start = 0): number {
  const limit = arr.length - subarr.length;
  for (let i = start; i <= limit; i++) {
    let match = true;
    for (let j = 0; j < subarr.length; j++) {
      if (arr[i + j] !== subarr[j]) {
        match = false;
        break;
      }
    }
    if (match) return i;
  }
  return -1;
}

// Extract raw JPEG bytes from PDF /DCTDecode streams for scanned PDF OCR fallback
function extractJpegsFromPdf(pdfBuffer: ArrayBuffer): Uint8Array[] {
  const view = new Uint8Array(pdfBuffer);
  const jpegs: Uint8Array[] = [];
  
  const searchBytes = new TextEncoder().encode("/DCTDecode");
  const streamBytes = new TextEncoder().encode("stream");
  const endstreamBytes = new TextEncoder().encode("endstream");
  
  let pos = 0;
  while (true) {
    const dctIndex = indexOf(view, searchBytes, pos);
    if (dctIndex === -1) break;
    
    const streamIndex = indexOf(view, streamBytes, dctIndex);
    if (streamIndex === -1 || (streamIndex - dctIndex) > 1000) {
      pos = dctIndex + searchBytes.length;
      continue;
    }
    
    let streamStart = streamIndex + 6;
    if (view[streamStart] === 13) streamStart++; // \r
    if (view[streamStart] === 10) streamStart++; // \n
    
    const endstreamIndex = indexOf(view, endstreamBytes, streamStart);
    if (endstreamIndex === -1) break;
    
    const jpegBytes = view.slice(streamStart, endstreamIndex);
    
    if (jpegBytes[0] === 0xFF && jpegBytes[1] === 0xD8) {
      jpegs.push(jpegBytes);
    }
    
    pos = endstreamIndex + 9;
  }
  
  return jpegs;
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
      
      if (jobDescription.length > 10000) {
        // Clear lock on validation failure
        if (clientIP !== "anonymous") {
          await env.RESUME_CRITIQUE_KV.delete(`rate_limit:${clientIP}`).catch(() => {});
        }
        return new Response(
          JSON.stringify({ error: "Job description exceeds the maximum limit of 10,000 characters." }),
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

      // Check if file is PDF or image (by mime type or extension)
      const fileType = fileEntry.type || "";
      const fileName = (fileEntry.name || "").toLowerCase();
      const isPdf = fileType === "application/pdf" || fileName.endsWith(".pdf");
      const isImage = fileType.startsWith("image/") || fileName.endsWith(".png") || fileName.endsWith(".jpg") || fileName.endsWith(".jpeg");

      if (!isPdf && !isImage) {
        // Clear lock on validation failure
        if (clientIP !== "anonymous") {
          await env.RESUME_CRITIQUE_KV.delete(`rate_limit:${clientIP}`).catch(() => {});
        }
        return new Response(
          JSON.stringify({ error: "Unsupported file format. Please upload a PDF or a PNG/JPEG image." }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      // 4. Convert to an ArrayBuffer and then create a clean Blob with explicit type
      let fileBlob: Blob;
      let targetPageCount = 1;
      let pdfBuffer: ArrayBuffer | null = null;

      if (isPdf) {
        pdfBuffer = await fileEntry.arrayBuffer();
        fileBlob = new Blob([pdfBuffer], { type: 'application/pdf' });

        // Extract page count directly from PDF binary metadata structure
        try {
          const decoder = new TextDecoder('ascii');
          const view = new Uint8Array(pdfBuffer);
          const text = decoder.decode(view);
          
          // Look for the root /Pages object which contains the true page count (scoped by Type /Pages)
          const pagesMatches = [...text.matchAll(/\/Type\s*\/Pages[\s\S]*?\/Count\s+(\d+)/g)];
          if (pagesMatches.length > 0) {
            let pagesVal = 1;
            for (const match of pagesMatches) {
              const count = parseInt(match[1], 10);
              if (count > 0 && count < 20) {
                pagesVal = count; // Root /Pages count
              }
            }
            targetPageCount = pagesVal;
          } else {
            // Fallback to counting occurrences of individual /Type /Page objects
            const pageMatches = text.match(/\/Type\s*\/Page\b/g);
            if (pageMatches && pageMatches.length > 0 && pageMatches.length < 20) {
              targetPageCount = pageMatches.length;
            }
          }
          console.log(`Parsed actual PDF page count from binary metadata: ${targetPageCount}`);
        } catch (pdfErr) {
          console.warn("Failed to parse PDF binary page count:", pdfErr);
        }
      } else {
        // It's an image
        const imgBuffer = await fileEntry.arrayBuffer();
        fileBlob = new Blob([imgBuffer], { type: fileType || 'image/jpeg' });
        targetPageCount = 1; // Default to 1 page target for image uploads
      }

      // 5. Call env.AI.toMarkdown with the exact array-of-objects signature
      let resumeMarkdown = "";
      try {
        const conversionResult = await env.AI.toMarkdown([
          {
            name: fileEntry.name || (isPdf ? 'resume.pdf' : 'resume.jpg'),
            blob: fileBlob
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
          JSON.stringify({ error: `Failed to extract text from file natively: ${convErr.message || convErr}` }),
          {
            status: 422,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      // Detect if the extracted text is empty, too short, or contains native parser indicators of a scanned/empty document
      const isParserWarning = 
        resumeMarkdown.toLowerCase().includes("empty of text content") || 
        resumeMarkdown.toLowerCase().includes("no text found") ||
        resumeMarkdown.toLowerCase().includes("keyword gap");

      // Verify if the extracted text contains common resume sections or keywords to filter out binary noise or scanned documents
      const resumeKeywords = [
        "experience", "work", "employment", "history", "professional", 
        "education", "university", "college", "school", "academic",
        "skills", "technologies", "tools", "languages", 
        "contact", "email", "phone", "address", "linkedin", "github"
      ];
      let hasResumeKeywords = resumeKeywords.some(keyword => 
        resumeMarkdown.toLowerCase().includes(keyword)
      );

      if (!resumeMarkdown || resumeMarkdown.trim().length < 150 || isParserWarning || !hasResumeKeywords) {
        let ocrSuccess = false;
        if (isPdf && pdfBuffer) {
          console.log("PDF text extraction failed or returned blank. Attempting scanned PDF JPEG extraction fallback...");
          try {
            const jpegs = extractJpegsFromPdf(pdfBuffer);
            if (jpegs.length > 0) {
              console.log(`Found ${jpegs.length} scanned JPEG(s) inside PDF. Running Workers AI OCR on the first page...`);
              const imgBlob = new Blob([jpegs[0]], { type: 'image/jpeg' });
              const ocrResult = await env.AI.toMarkdown([
                {
                  name: 'scanned_page.jpg',
                  blob: imgBlob
                }
              ]);
              const ocrText = ocrResult?.[0]?.data || "";
              
              const hasOcrKeywords = resumeKeywords.some(keyword => 
                ocrText.toLowerCase().includes(keyword)
              );
              
              if (ocrText && ocrText.trim().length >= 150 && hasOcrKeywords) {
                resumeMarkdown = ocrText;
                hasResumeKeywords = true;
                ocrSuccess = true;
                console.log("Scanned PDF OCR fallback succeeded!");
              }
            }
          } catch (ocrErr) {
            console.warn("Scanned PDF OCR fallback failed with error:", ocrErr);
          }
        }

        if (!ocrSuccess) {
          console.warn(`Validation failed. Legible text length: ${resumeMarkdown ? resumeMarkdown.trim().length : 0} chars. Keywords match: ${hasResumeKeywords}. Warning: ${isParserWarning}.`);
          console.warn(`Extracted preview: "${resumeMarkdown ? resumeMarkdown.substring(0, 150) : ""}"`);
          
          // Clear lock on failure
          if (clientIP !== "anonymous") {
            await env.RESUME_CRITIQUE_KV.delete(`rate_limit:${clientIP}`).catch(() => {});
          }
          
          let errorMsg = "Failed to extract legible text from the uploaded file.";
          if (isPdf || isParserWarning || !hasResumeKeywords) {
            errorMsg = "The uploaded PDF appears to be a scanned image with no readable text layer. Please upload a standard PDF with selectable text, or upload a PNG/JPEG image of your résumé directly.";
          }
          
          return new Response(
            JSON.stringify({ error: errorMsg }),
            {
              status: 422,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            }
          );
        }
      }

      // Calibration: Adjust target page count based on actual text volume to prevent underflow/overflow conflicts
      const charCount = resumeMarkdown.length;
      if (targetPageCount > 1 && charCount < 3600) {
        console.log(`Calibrating targetPageCount down to 1. Character count: ${charCount}`);
        targetPageCount = 1;
      } else if (targetPageCount > 2 && charCount < 6000) {
        targetPageCount = 2;
      } else if (targetPageCount === 1) {
        if (charCount > 5800) {
          targetPageCount = 2;
        }
        if (charCount > 11000) {
          targetPageCount = 3;
        }
      }
      const pageLabel = targetPageCount === 1 ? "SINGLE PAGE" : `${targetPageCount} PAGES`;

      // 6. Request evaluation from parallel specialized agents
      let critique = "";
      try {
        console.log("Triggering parallel specialized critic agents...");
        const criticPromises: Promise<string>[] = [
          callAgyBridge(env, getGrammarSystemPrompt(), getGrammarUserPrompt(resumeMarkdown)),
          callAgyBridge(env, getLayoutSystemPrompt(pageLabel), getLayoutUserPrompt(resumeMarkdown))
        ];

        let atsPromiseIndex = -1;
        if (jobDescription) {
          atsPromiseIndex = criticPromises.push(
            callAgyBridge(env, getAtsSystemPrompt(), getAtsUserPrompt(resumeMarkdown, jobDescription))
          ) - 1;
        }

        const results = await Promise.all(criticPromises);
        const grammarFeedback = results[0];
        const layoutFeedback = results[1];
        const atsFeedback = atsPromiseIndex !== -1 ? results[atsPromiseIndex] : "";

        // Combine critiques
        let compositeCritiques = `### Grammar, Tone, and Impact Feedback\n${grammarFeedback}\n\n### Formatting and Layout Feedback\n${layoutFeedback}`;
        if (atsFeedback) {
          compositeCritiques = `### ATS Alignment and Keyword Feedback\n${atsFeedback}\n\n` + compositeCritiques;
        }

        // 7. Self-Correction Loop (Editor-in-Chief & Validator Agents)
        let validationFeedback = "";
        let attempts = 0;
        const maxAttempts = 3;
        let finalHtml = "";
        let finalCritique = "";

        while (attempts < maxAttempts) {
          attempts++;
          console.log(`Self-correction loop: Attempt ${attempts}/${maxAttempts}`);

          const editorOutput = await callAgyBridge(
            env,
            getEditorSystemPrompt(pageLabel),
            getEditorUserPrompt(resumeMarkdown, jobDescription, compositeCritiques, validationFeedback)
          );

          const parts = editorOutput.split("=== REWRITTEN RESUME ===");
          const critiquePart = parts[0]?.trim() || "";
          const htmlPart = parts[1]?.trim() || "";

          finalCritique = critiquePart;
          finalHtml = htmlPart;

          if (!finalHtml) {
            validationFeedback = "Validation Error: Could not find '=== REWRITTEN RESUME ===' delimiter or the HTML block is empty.";
            continue;
          }

          // Run compliance validation
          console.log(`Auditing HTML draft (Attempt ${attempts})...`);
          const auditResult = (await callAgyBridge(
            env,
            getValidatorSystemPrompt(pageLabel),
            getValidatorUserPrompt(finalHtml)
          )).trim();

          if (auditResult.toUpperCase() === "PASS") {
            console.log("HTML validation passed compliance audit.");
            break;
          } else {
            console.warn(`Validation failed on attempt ${attempts}. Issues:\n${auditResult}`);
            validationFeedback = auditResult;
          }
        }

        // If after loops we don't have the final HTML, construct a fallback
        critique = finalCritique + "\n\n=== REWRITTEN RESUME ===\n" + finalHtml;

      } catch (aiErr: any) {
        console.error("AGY Bridge / Multi-agent execution error:", aiErr);
        // Clear lock on failure
        if (clientIP !== "anonymous") {
          await env.RESUME_CRITIQUE_KV.delete(`rate_limit:${clientIP}`).catch(() => {});
        }
        return new Response(
          JSON.stringify({ error: `Multi-agent evaluation failed: ${aiErr.message || aiErr}` }),
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
          JSON.stringify({ error: "Empty critique returned from evaluation loop." }),
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
