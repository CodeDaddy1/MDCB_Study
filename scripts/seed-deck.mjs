#!/usr/bin/env node
/**
 * Seed a deck from local PDFs (handouts + answer keys), then drive ingestion
 * through the app's cron endpoint so the real pipeline (extract → chunk →
 * embed → concepts) does the work — no duplicated logic.
 *
 * Prereqs: the app running with AI keys set (VOYAGE_API_KEY + ANTHROPIC_API_KEY),
 * either locally (`pnpm dev`, APP_URL=http://localhost:3000) or deployed.
 *
 * Env (most come from .env.local):
 *   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, CRON_SECRET
 *   SEED_OWNER_EMAIL   the app account that will own the deck (created if absent)
 *   APP_URL            default http://localhost:3000
 *   MATERIALS_DIR      default "~/Downloads/Medical Dosimetry Study " (trailing space)
 *   DECK_TITLE         default "MDCB — Medical Dosimetry Board Prep"
 *
 * Usage (from the MDCB_Study dir):
 *   set -a && . ./.env.local && set +a
 *   SEED_OWNER_EMAIL=you@example.com node scripts/seed-deck.mjs
 */
import { createClient } from '@supabase/supabase-js'
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { homedir } from 'node:os'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const cronSecret = process.env.CRON_SECRET
const appUrl = process.env.APP_URL ?? 'http://localhost:3000'
const ownerEmail = process.env.SEED_OWNER_EMAIL
const materialsDir =
  process.env.MATERIALS_DIR ??
  join(homedir(), 'Downloads', 'Medical Dosimetry Study ')
const deckTitle = process.env.DECK_TITLE ?? 'MDCB — Medical Dosimetry Board Prep'
const BUCKET = 'study-materials'

if (!url || !serviceKey) {
  console.error('Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.')
  process.exit(1)
}
if (!ownerEmail) {
  console.error('Set SEED_OWNER_EMAIL (the app account that will own the deck).')
  process.exit(1)
}

const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})

async function ensureUser(email) {
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage: 200,
    })
    if (error) throw error
    const found = data.users.find(
      (u) => (u.email ?? '').toLowerCase() === email.toLowerCase(),
    )
    if (found) return { id: found.id, created: false }
    if (data.users.length < 200) break
  }
  const password = randomUUID()
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })
  if (error) throw error
  return { id: data.user.id, created: true, password }
}

const owner = await ensureUser(ownerEmail)
console.log(
  `Owner: ${ownerEmail} (${owner.id})` +
    (owner.created ? `  [created — temp password: ${owner.password}]` : ''),
)

const { data: deck, error: deckErr } = await supabase
  .from('decks')
  .insert({
    owner_id: owner.id,
    title: deckTitle,
    description: 'Seeded from local MDCB study PDFs (handouts + answer keys).',
    visibility: 'private',
  })
  .select('id')
  .single()
if (deckErr) {
  console.error('Deck insert failed:', deckErr.message)
  process.exit(1)
}
console.log(`Deck: ${deck.id}`)

const files = (await readdir(materialsDir))
  .filter((f) => f.toLowerCase().endsWith('.pdf'))
  .sort()
console.log(`Uploading ${files.length} PDFs from "${materialsDir}"…`)
let uploaded = 0
for (const filename of files) {
  const buf = await readFile(join(materialsDir, filename))
  const path = `${deck.id}/${randomUUID()}/${filename}`
  const { error: upErr } = await supabase.storage
    .from(BUCKET)
    .upload(path, buf, { contentType: 'application/pdf', upsert: false })
  if (upErr) {
    console.error(`  ! upload failed ${filename}: ${upErr.message}`)
    continue
  }
  const { error: insErr } = await supabase.from('documents').insert({
    deck_id: deck.id,
    filename,
    storage_path: path,
    mime_type: 'application/pdf',
    status: 'uploaded',
  })
  if (insErr) {
    console.error(`  ! doc insert failed ${filename}: ${insErr.message}`)
    continue
  }
  uploaded++
  console.log(`  + ${filename}`)
}
console.log(`Uploaded ${uploaded}/${files.length} documents.`)

if (!cronSecret) {
  console.log(
    'No CRON_SECRET set — skipping ingestion. Start the app and use the per-document Process buttons, or set CRON_SECRET and re-run.',
  )
  process.exit(0)
}

console.log(`Ingesting via ${appUrl}/api/cron/ingest …`)
for (let i = 0; i < 60; i++) {
  let res
  try {
    res = await fetch(`${appUrl}/api/cron/ingest`, {
      headers: { Authorization: `Bearer ${cronSecret}` },
    })
  } catch (e) {
    console.error(`  cron request failed: ${e.message}. Is the app running at ${appUrl}?`)
    break
  }
  if (!res.ok) {
    console.error(`  cron failed (${res.status}): ${await res.text()}`)
    break
  }
  const body = await res.json()
  console.log(`  run ${i + 1}: processed ${body.processed}`)
  if (!body.processed) break
}

const { data: docs } = await supabase
  .from('documents')
  .select('status')
  .eq('deck_id', deck.id)
const counts = {}
for (const d of docs ?? []) counts[d.status] = (counts[d.status] ?? 0) + 1
console.log('Document statuses:', counts)
console.log(`Done. Log in as ${ownerEmail} and open ${appUrl}/decks/${deck.id}`)
