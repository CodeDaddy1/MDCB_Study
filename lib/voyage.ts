import 'server-only'

/**
 * Voyage AI embeddings via REST (no first-party Node SDK).
 *
 * EMBEDDING_DIM is load-bearing: `chunks.embedding` is `vector(1024)` to match
 * voyage-4-lite. Changing the model/dimension requires a migration to the new
 * dimension AND re-embedding every chunk.
 */
export const VOYAGE_MODEL = 'voyage-4-lite'
export const EMBEDDING_DIM = 1024

const VOYAGE_URL = 'https://api.voyageai.com/v1/embeddings'
const MAX_BATCH = 128

interface VoyageResponse {
  data: { embedding: number[]; index: number }[]
}

async function embed(
  texts: string[],
  inputType: 'document' | 'query',
): Promise<number[][]> {
  if (texts.length === 0) return []
  const apiKey = process.env.VOYAGE_API_KEY
  if (!apiKey) throw new Error('VOYAGE_API_KEY is not set')

  const out: number[][] = []
  for (let i = 0; i < texts.length; i += MAX_BATCH) {
    const batch = texts.slice(i, i + MAX_BATCH)
    const res = await fetch(VOYAGE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        input: batch,
        model: VOYAGE_MODEL,
        input_type: inputType,
        output_dimension: EMBEDDING_DIM,
      }),
    })
    if (!res.ok) {
      const body = await res.text()
      throw new Error(`Voyage embeddings failed (${res.status}): ${body}`)
    }
    const json = (await res.json()) as VoyageResponse
    // Results may come back out of order — sort by index before collecting.
    const sorted = [...json.data].sort((a, b) => a.index - b.index)
    out.push(...sorted.map((d) => d.embedding))
  }
  return out
}

/** Embed source-material chunks (input_type=document). */
export function embedDocuments(texts: string[]): Promise<number[][]> {
  return embed(texts, 'document')
}

/** Embed a single search query (input_type=query). */
export async function embedQuery(text: string): Promise<number[]> {
  const [vector] = await embed([text], 'query')
  return vector
}
