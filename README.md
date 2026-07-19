# Computer Science Resume Critique API

A specialized, edge-native API built on Cloudflare Workers (TypeScript) that processes PDF resume uploads entirely in-memory and provides a systems-focused computer science resume critique using Cloudflare Workers AI.

## 🚀 Key Architectural Features
- **Zero Persistent Storage:** Runs completely ephemerally in-memory (V8 isolate compatible). The uploaded PDF is processed using `ArrayBuffer` and `Uint8Array`.
- **Pure JS Text Extraction:** Uses `unpdf` (optimized PDF.js build) for text extraction, avoiding heavy Node.js native binary parsers that fail on edge workers.
- **Workers AI Integration:** Leverages the high-performance `@cf/meta/llama-3.1-8b-instruct-fp8` model.
- **CORS Support:** Handles preflight `OPTIONS` requests dynamically for seamless integration with frontend clients.
- **Rigorous Systems Critique:** Systems prompt is heavily biased towards logical categorization of technical skills (low-level systems separated from high-level frameworks), bullet point engineering metrics, and vertical layout whitespace.

---

## 🛠️ API Reference

### POST `/`
Uploads a PDF resume and returns the Markdown critique.

- **Headers:**
  - `Content-Type: multipart/form-data`
- **Body:**
  - `resume` (or `file`): The PDF binary file.

#### Example Request
```bash
curl -X POST -F "resume=@/path/to/resume.pdf" http://localhost:8787/
```

#### Example Response
```json
{
  "critique": "# Resume Critique...\n\n### 1. Skill Matrix Grouping...\n...",
  "extractedTextLength": 2450
}
```

---

## 💻 Local Development

### 1. Install Dependencies
```bash
npm install
```

### 2. Generate TypeScript Bindings
Ensure Wrangler types are generated:
```bash
npx wrangler types
```

### 3. Start Local Server
Run wrangler's local development server:
```bash
npm run dev
```

### 4. Run End-to-End Test
With the development server running in one terminal, run the test script in another:
```bash
node test_worker.js
```
*(Remember to clean up `test_resume.pdf` after testing).*

---

## 🔒 Production Deployment

Deploy the Worker to your Cloudflare account manually:
```bash
npm run deploy
```

Deployments are also automated via GitHub Actions on commits to the `main` or `master` branches (using the workflow configured in `.github/workflows/deploy.yml`). Make sure to set `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` in your GitHub repository secrets.
