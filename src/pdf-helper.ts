import { extractText } from 'unpdf';

/**
 * Extracts raw textual content from an in-memory PDF ArrayBuffer using an edge-safe parser.
 */
export async function extractTextFromPDFBuffer(buffer: ArrayBuffer): Promise<string> {
  try {
    // Cast buffer to Uint8Array as required by unpdf
    const pdfData = new Uint8Array(buffer);
    
    // Extract text with all pages merged into a single string
    const result = await extractText(pdfData, { mergePages: true });
    
    return result.text || '';
  } catch (error: any) {
    throw new Error(`Edge-safe PDF parsing failed: ${error.message}`);
  }
}
