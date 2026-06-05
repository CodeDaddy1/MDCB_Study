import 'server-only'
import Anthropic from '@anthropic-ai/sdk'

/**
 * Model constants. Verify the latest IDs at docs.claude.com before changing.
 * - GENERATION: concept extraction + quiz generation (higher quality).
 * - VERIFICATION: high-volume fact-checking + grading (cheaper, faster).
 */
export const MODELS = {
  GENERATION: 'claude-sonnet-4-6',
  VERIFICATION: 'claude-haiku-4-5-20251001',
} as const

let client: Anthropic | null = null

/** Lazily-constructed Anthropic client. Server-only — never import client-side. */
export function getAnthropic(): Anthropic {
  if (!client) {
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set')
    client = new Anthropic({ apiKey })
  }
  return client
}
