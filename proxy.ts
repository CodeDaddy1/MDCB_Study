import type { NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

// Next 16 "proxy" convention (formerly "middleware"). Refreshes the Supabase
// auth session on every matched request and gates the authed area.
export async function proxy(request: NextRequest) {
  return await updateSession(request)
}

export const config = {
  matcher: [
    /*
     * Run on all paths except Next internals, static assets, and the cron
     * route (which authenticates with CRON_SECRET, not a user session).
     */
    '/((?!_next/static|_next/image|favicon.ico|api/cron|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
}
