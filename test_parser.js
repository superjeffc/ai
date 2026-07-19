import { readFileSync, writeFileSync } from 'fs';
import { extractText, getDocumentProxy } from 'unpdf';

// A minimal valid PDF structure with text contents
const pdfContent = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /Resources << /Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> >> >> /MediaBox [0 0 612 792] /Contents 4 0 R >>
endobj
4 0 obj
<< /Length 52 >>
stream
BT
/F1 12 Tf
100 700 Td
(Systems Engineer resume sample text) Tj
ET
endstream
endobj
xref
0 5
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000113 00000 n 
0000000244 00000 n 
trailer
<< /Size 5 /Root 1 0 R >>
startxref
347
%%EOF`;

async function test() {
  console.log("Writing sample.pdf...");
  writeFileSync('sample.pdf', pdfContent);

  console.log("Reading sample.pdf...");
  const buffer = readFileSync('sample.pdf');
  const uint8 = new Uint8Array(buffer);

  try {
    console.log("Loading document proxy via unpdf...");
    const pdf = await getDocumentProxy(uint8);
    console.log("Document loaded successfully. Pages count:", pdf.numPages);
    
    console.log("Extracting text...");
    const { text } = await extractText(pdf, { mergePages: true });
    console.log("Extracted Text Result:");
    console.log("----------------------");
    console.log(text);
    console.log("----------------------");
    
    if (text.includes("Systems Engineer")) {
      console.log("SUCCESS: Text extracted successfully!");
    } else {
      console.log("FAILURE: Expected text not found in extracted output.");
    }
  } catch (err) {
    console.error("Test failed with error:", err);
  }
}

test();
