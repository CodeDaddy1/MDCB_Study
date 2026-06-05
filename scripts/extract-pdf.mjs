#!/usr/bin/env node
/**
 * Extract text from a PDF (per page) using unpdf — no poppler/OCR needed.
 * Usage: node scripts/extract-pdf.mjs "<path.pdf>" [startPage] [endPage]
 * Run from the MDCB_Study dir so `unpdf` resolves from node_modules.
 */
import { extractText, getDocumentProxy } from 'unpdf'
import { readFile } from 'node:fs/promises'

const [, , pdfPath, startArg, endArg] = process.argv
if (!pdfPath) {
  console.error('usage: node scripts/extract-pdf.mjs <pdf> [startPage] [endPage]')
  process.exit(1)
}

const buf = await readFile(pdfPath)
const pdf = await getDocumentProxy(new Uint8Array(buf))
const { totalPages, text } = await extractText(pdf, { mergePages: false })

const start = startArg ? Math.max(1, parseInt(startArg, 10)) : 1
const end = endArg ? Math.min(totalPages, parseInt(endArg, 10)) : totalPages

console.error(`# ${pdfPath}\n# ${totalPages} pages total — showing ${start}–${end}`)
for (let i = start; i <= end; i++) {
  const t = (text[i - 1] ?? '').replace(/\s+\n/g, '\n').trim()
  console.log(`\n===== PAGE ${i} =====`)
  console.log(t.length ? t : '(no extractable text)')
}
