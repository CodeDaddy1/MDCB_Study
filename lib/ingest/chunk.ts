import type { ExtractedSegment } from '@/lib/ingest/extract'

export interface Chunk {
  content: string
  ord: number
  source_loc: { page?: number; heading?: string } | null
}

// ~500-800 tokens per chunk with ~15% overlap. Tokens ≈ chars / 4.
const TARGET_CHARS = 3000
const OVERLAP_CHARS = 450

/** Chunk a document's extracted segments, preserving page citations. */
export function chunkSegments(segments: ExtractedSegment[]): Chunk[] {
  const chunks: Chunk[] = []
  let ord = 0
  for (const seg of segments) {
    const loc =
      seg.page !== undefined || seg.heading !== undefined
        ? { page: seg.page, heading: seg.heading }
        : null
    for (const piece of splitText(seg.text)) {
      chunks.push({ content: piece, ord: ord++, source_loc: loc })
    }
  }
  return chunks
}

function splitText(raw: string): string[] {
  const clean = raw
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .trim()
  if (clean.length === 0) return []
  if (clean.length <= TARGET_CHARS) return [clean]

  const paragraphs = clean.split(/\n{2,}/)
  const out: string[] = []
  let buf = ''

  const flush = () => {
    if (buf.trim()) out.push(buf.trim())
    buf = ''
  }

  for (const para of paragraphs) {
    const p = para.trim()
    if (!p) continue

    if (p.length > TARGET_CHARS) {
      flush()
      out.push(...hardSplit(p))
      continue
    }

    if (buf.length + p.length + 2 > TARGET_CHARS) {
      const overlap = tail(buf, OVERLAP_CHARS)
      flush()
      buf = overlap ? `${overlap}\n\n${p}` : p
    } else {
      buf = buf ? `${buf}\n\n${p}` : p
    }
  }
  flush()
  return out
}

/** Hard-split an oversized paragraph into overlapping windows. */
function hardSplit(text: string): string[] {
  const out: string[] = []
  let start = 0
  while (start < text.length) {
    const end = Math.min(start + TARGET_CHARS, text.length)
    out.push(text.slice(start, end).trim())
    if (end >= text.length) break
    start = end - OVERLAP_CHARS
  }
  return out
}

/** Last ~n chars of `text`, snapped back to a word boundary. */
function tail(text: string, n: number): string {
  if (text.length <= n) return text
  const slice = text.slice(text.length - n)
  const space = slice.indexOf(' ')
  return space > 0 ? slice.slice(space + 1) : slice
}
