export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            StudyApp
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Verified, source-grounded studying.
          </p>
        </div>
        {children}
      </div>
    </div>
  )
}
