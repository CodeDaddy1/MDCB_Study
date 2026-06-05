import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'StudyApp — verified, source-grounded study',
  description:
    'Upload source material and study with verified, source-grounded quizzes and spaced-repetition mastery tracking.',
}

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  )
}
