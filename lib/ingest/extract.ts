import 'server-only'
import { extractText, getDocumentProxy } from 'unpdf'

export interface ExtractedSegment {
  text: string
  /** 1-based page number for PDFs (used as the citation source_loc). */
  page?: number
  heading?: string
}

/**
 * Extract raw text from an uploaded document, preserving page boundaries for
 * PDFs so chunks can cite a page. PPTX/DOCX/notes go through officeparser;
 * anything else is treated as UTF-8 text.
 */
export async function extractSegments(
  buffer: Buffer,
  filename: string,
  mimeType?: string | null,
): Promise<ExtractedSegment[]> {
  const lower = filename.toLowerCase()
  const isPdf = mimeType === 'application/pdf' || lower.endsWith('.pdf')
  const isOffice =
    lower.endsWith('.pptx') ||
    lower.endsWith('.ppt') ||
    lower.endsWith('.docx') ||
    lower.endsWith('.doc')

  if (isPdf) {
    const pdf = await getDocumentProxy(new Uint8Array(buffer))
    const { text } = await extractText(pdf, { mergePages: false })
    const pages = Array.isArray(text) ? text : [text]
    return pages
      .map((t, i) => ({ text: (t ?? '').trim(), page: i + 1 }))
      .filter((s) => s.text.length > 0)
  }

  if (isOffice) {
    // Dynamic import: officeparser is a server-external CJS package.
    // v7 returns a structured AST; .toText() flattens it to plain text.
    const { parseOffice } = await import('officeparser')
    const ast = await parseOffice(buffer)
    const trimmed = ast.toText().trim()
    return trimmed ? [{ text: trimmed }] : []
  }

  // Plain text / markdown / unknown → decode as UTF-8.
  const text = buffer.toString('utf-8').trim()
  return text ? [{ text }] : []
}
