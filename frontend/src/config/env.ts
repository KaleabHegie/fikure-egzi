import { z } from 'zod'

/**
 * Build-time configuration (Vite inlines VITE_* variables). Validated once at
 * startup so a bad deploy fails loudly instead of misbehaving.
 */
const envSchema = z.object({
  /** Base URL of the API including version, e.g. https://api.example.org/api/v1. Defaults to the same origin. */
  VITE_API_BASE_URL: z.string().min(1).default('/api/v1'),
  VITE_APP_NAME: z.string().min(1).default('Fikure Egzi Sunday School'),
})

const parsed = envSchema.safeParse(import.meta.env)
if (!parsed.success) {
  throw new Error(`Invalid frontend environment: ${z.prettifyError(parsed.error)}`)
}

export const env = {
  apiBaseUrl: parsed.data.VITE_API_BASE_URL.replace(/\/+$/, ''),
  appName: parsed.data.VITE_APP_NAME,
} as const
