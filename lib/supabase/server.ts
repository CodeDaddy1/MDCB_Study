import 'server-only'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { Database } from '@/lib/database.types'

/**
 * Request-scoped Supabase client for Server Components, Route Handlers, and
 * Server Actions. Uses the anon key + the user's cookies, so all queries run
 * under Row Level Security as the signed-in user.
 */
export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options)
            }
          } catch {
            // `setAll` was called from a Server Component, where cookies are
            // read-only. The session is refreshed in middleware instead, so
            // this is safe to ignore.
          }
        },
      },
    },
  )
}
