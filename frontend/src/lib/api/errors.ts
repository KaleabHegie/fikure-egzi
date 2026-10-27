import { isAxiosError } from 'axios'
import type { FieldValues, Path, UseFormSetError } from 'react-hook-form'
import i18n, { translateMessage } from '@/i18n'
import type { ApiErrorBody, FieldError } from './types'

/** Every failed request surfaces as this, whatever went wrong underneath. */
export class ApiError extends Error {
  readonly status: number
  readonly details: FieldError[]

  constructor(status: number, message: string, details: FieldError[] = []) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.details = details
  }

  get isNetworkError(): boolean {
    return this.status === 0
  }
}

export function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error
  if (isAxiosError<ApiErrorBody>(error)) {
    if (!error.response) return new ApiError(0, error.message)
    const { status, data } = error.response
    // Gateway/proxy failures (502/503/504) carry no API error body.
    const body = data && typeof data === 'object' ? data : undefined
    return new ApiError(status, body?.message ?? error.message, Array.isArray(body?.details) ? body.details : [])
  }
  return new ApiError(-1, error instanceof Error ? error.message : 'Unknown error')
}

/**
 * A message for the user, in the current language. Status-level failures map
 * to translated text; 400/409/422 keep the API's specific message (English).
 */
export function getErrorMessage(error: unknown): string {
  const e = toApiError(error)
  const t = i18n.t
  if (e.status === 0) return t('errors.network')
  if (e.status === 401) return t('auth.sessionExpired')
  if (e.status === 403) return t('errors.forbidden')
  if (e.status === 404) return t('errors.notFound')
  if (e.status === 429) return t('errors.tooManyRequests')
  if (e.status >= 500 || e.status < 0) return t('errors.server')
  // Validation errors name what's wrong; their messages may be translation keys.
  const details = e.details.flatMap((d) => d.messages.map((m) => translateMessage(m) ?? m))
  if (details.length > 0) return [...new Set(details)].join('. ')
  return e.message || t('errors.unexpected')
}

/**
 * Maps the API's field-level validation errors onto react-hook-form fields.
 * Returns true when at least one error was attached to a field.
 */
export function applyApiFieldErrors<T extends FieldValues>(
  error: unknown,
  setError: UseFormSetError<T>,
  knownFields: readonly string[],
): boolean {
  const { details } = toApiError(error)
  let applied = false
  for (const detail of details) {
    if (knownFields.includes(detail.field)) {
      setError(detail.field as Path<T>, { type: 'server', message: detail.messages.join('. ') })
      applied = true
    }
  }
  return applied
}
