import Link from 'next/link'
import { signup } from '../login/actions'

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const { error } = await searchParams

  return (
    <div className="rounded-[var(--radius-lg)] border border-border bg-card p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-foreground">Create account</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Start building verified study decks.
      </p>

      {error && (
        <p className="mt-4 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      <form action={signup} className="mt-5 space-y-4">
        <Field
          label="Display name"
          name="display_name"
          type="text"
          autoComplete="name"
          required={false}
        />
        <Field label="Email" name="email" type="email" autoComplete="email" />
        <Field
          label="Password"
          name="password"
          type="password"
          autoComplete="new-password"
        />
        <button
          type="submit"
          className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:opacity-90"
        >
          Create account
        </button>
      </form>

      <p className="mt-5 text-center text-sm text-muted-foreground">
        Already have an account?{' '}
        <Link href="/login" className="font-medium text-primary hover:underline">
          Sign in
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
  required = true,
}: {
  label: string
  name: string
  type: string
  autoComplete?: string
  required?: boolean
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-foreground">
        {label}
      </span>
      <input
        name={name}
        type={type}
        required={required}
        autoComplete={autoComplete}
        className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-ring focus:ring-2 focus:ring-ring/30"
      />
    </label>
  )
}
