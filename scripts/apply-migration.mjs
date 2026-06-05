#!/usr/bin/env node
/**
 * Apply SQL migrations to a Supabase project via the Management API.
 *
 * Requires a Personal Access Token (Supabase Dashboard → Account → Access
 * Tokens) — the project's publishable/secret API keys cannot run DDL.
 *
 * Usage:
 *   SUPABASE_ACCESS_TOKEN=sbp_... SUPABASE_PROJECT_ID=gbbthwzemmswqsqjjjxt \
 *     node scripts/apply-migration.mjs [file.sql ...]
 *
 * With no file args, applies every supabase/migrations/*.sql in order.
 */
import { readFile, readdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'

const token = process.env.SUPABASE_ACCESS_TOKEN
const ref = process.env.SUPABASE_PROJECT_ID
if (!token || !ref) {
  console.error(
    'Set SUPABASE_ACCESS_TOKEN (sbp_...) and SUPABASE_PROJECT_ID before running.',
  )
  process.exit(1)
}

const here = dirname(fileURLToPath(import.meta.url))
const migrationsDir = resolve(here, '..', 'supabase', 'migrations')

const args = process.argv.slice(2)
const files = args.length
  ? args
  : (await readdir(migrationsDir))
      .filter((f) => f.endsWith('.sql'))
      .sort()
      .map((f) => join(migrationsDir, f))

for (const file of files) {
  const sql = await readFile(file, 'utf8')
  process.stdout.write(`Applying ${file.split('/').pop()} … `)
  const res = await fetch(
    `https://api.supabase.com/v1/projects/${ref}/database/query`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: sql }),
    },
  )
  if (!res.ok) {
    console.error(`\nFailed (${res.status}): ${await res.text()}`)
    process.exit(1)
  }
  console.log('ok')
}
console.log('All migrations applied.')
