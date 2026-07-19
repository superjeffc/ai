import { readFileSync, writeFileSync } from 'fs';

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

async function testWorker() {
  console.log("Creating dummy PDF file 'test_resume.pdf'...");
  writeFileSync('test_resume.pdf', pdfContent);
  const pdfBuffer = readFileSync('test_resume.pdf');

  console.log("Building FormData...");
  const formData = new FormData();
  const fileBlob = new Blob([pdfBuffer], { type: 'application/pdf' });
  formData.append('resume', fileBlob, 'test_resume.pdf');

  try {
    console.log("Sending POST request to http://localhost:8787/ ...");
    const response = await fetch('http://localhost:8787/', {
      method: 'POST',
      body: formData
    });

    console.log("Response status:", response.status);
    const data = await response.json();
    console.log("Response body:", JSON.stringify(data, null, 2));
  } catch (err) {
    console.error("Connection failed. Make sure 'npm run dev' is running in another terminal!");
    console.error("Error details:", err.message);
  }
}

testWorker();
