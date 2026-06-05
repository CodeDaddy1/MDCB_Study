'use server'

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

async function getOrigin(): Promise<string> {
  const h = await headers()
  const fromOrigin = h.get('origin')
  if (fromOrigin) return fromOrigin
  const host = h.get('host') ?? 'localhost:3000'
  const proto = host.startsWith('localhost') ? 'http' : 'https'
  return `${proto}://${host}`
}

export async function login(formData: FormData) {
  const email = String(formData.get('email') ?? '').trim()
  const password = String(formData.get('password') ?? '')

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) {
    redirect(`/login?error=${encodeURIComponent(error.message)}`)
  }

  revalidatePath('/', 'layout')
  redirect('/dashboard')
}

export async function signup(formData: FormData) {
  const email = String(formData.get('email') ?? '').trim()
  const password = String(formData.get('password') ?? '')
  const displayName = String(formData.get('display_name') ?? '').trim()

  const supabase = await createClient()
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: displayName ? { display_name: displayName } : undefined,
      emailRedirectTo: `${await getOrigin()}/auth/callback`,
    },
  })
  if (error) {
    redirect(`/signup?error=${encodeURIComponent(error.message)}`)
  }

  // If the project has email confirmation disabled, signUp returns a session
  // and we can go straight in. Otherwise prompt the user to confirm by email.
  if (data.session) {
    revalidatePath('/', 'layout')
    redirect('/dashboard')
  }
  redirect('/login?message=check-email')
}
