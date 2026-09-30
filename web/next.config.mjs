import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // El repo raíz tiene su propio package-lock.json (proyecto original MPL).
  outputFileTracingRoot: here
}

export default nextConfig
