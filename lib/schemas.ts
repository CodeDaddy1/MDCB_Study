import { z } from 'zod'

/**
 * Zod schemas for all LLM output. Every model response is validated against one
 * of these (via `messages.parse` + `zodOutputFormat`) before it touches the DB.
 */

// ---- Source Expert: concept extraction ----
export const conceptListSchema = z.object({
  concepts: z.array(
    z.object({
      name: z.string(),
      description: z.string(),
      // null when the concept has no parent (kept non-optional so the model
      // always emits the key — friendlier to structured-output JSON schema).
      parent_name: z.string().nullable(),
    }),
  ),
})
export type ConceptList = z.infer<typeof conceptListSchema>

// ---- Source Expert: verification (fact-check) ----
export const verifySchema = z.object({
  supported: z.boolean(),
  supporting_chunk_id: z.string().nullable(),
  reason: z.string(),
})
export type Verification = z.infer<typeof verifySchema>

// ---- Question payload / answer shapes (by question type) ----
// Used by the quiz generator + scoring (later phases). Defined here so the
// content contract lives in one place.
export const mcqPayloadSchema = z.object({ options: z.array(z.string()) })
export const mcqAnswerSchema = z.object({ correct_index: z.number().int() })

export const orderedStepsPayloadSchema = z.object({ steps: z.array(z.string()) })
export const orderedStepsAnswerSchema = z.object({
  order: z.array(z.number().int()),
})

export const termPayloadSchema = z.object({
  term: z.string(),
  definition: z.string(),
})
export const termAnswerSchema = z.object({ definition: z.string() })

export const shortAnswerPayloadSchema = z.object({ rubric: z.string() })
export const shortAnswerAnswerSchema = z.object({ reference: z.string() })
