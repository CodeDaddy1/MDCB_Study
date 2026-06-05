import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // officeparser pulls native/CJS deps (and optional OCR) that must not be
  // bundled by Turbopack/webpack — keep it external to the server build.
  serverExternalPackages: ['officeparser'],
}

export default nextConfig
