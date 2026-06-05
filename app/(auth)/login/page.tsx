import Link from 'next/link'
import { login } from './actions'

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; message?: string }>
}) {
  const { error, message } = await searchParams

  return (
    <div className="rounded-[var(--radius-lg)] border border-border bg-card p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-foreground">Sign in</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Welcome back. Enter your credentials to continue.
      </p>

      {message === 'check-email' && (
        <p className="mt-4 rounded-md bg-muted px-3 py-2 text-sm text-foreground">
          Check your email to confirm your account, then sign in.
        </p>
      )}
      {error && (
        <p className="mt-4 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      <form action={login} className="mt-5 space-y-4">
        <Field label="Email" name="email" type="email" autoComplete="email" />
        <Field
          label="Password"
          name="password"
          type="password"
          autoComplete="current-password"
        />
        <button
          type="submit"
          className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:opacity-90"
        >
          Sign in
        </button>
      </form>

      <p className="mt-5 text-center text-sm text-muted-foreground">
        No account?{' '}
        <Link href="/signup" className="font-medium text-primary hover:underline">
          Create one
        </Link>
      </p>
    </div>
  )
}

function Field({
  label,
  name,
  type,
  autoComplete,
}: {
  label: string
  name: string
  type: string
  autoComplete?: string
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-foreground">
        {label}
      </span>
      <input
        name={name}
        type={type}
        required
        autoComplete={autoComplete}
        className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-ring focus:ring-2 focus:ring-ring/30"
      />
    </label>
  )
}
