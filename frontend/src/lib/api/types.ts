/** Mirrors the API's response envelopes (see backend ResponseEnvelopeInterceptor). */
export interface ApiEnvelope<T> {
  data: T
}

export interface PaginationMeta {
  page: number
  pageSize: number
  total: number
  totalPages: number
}

export interface Page<T> {
  data: T[]
  meta: PaginationMeta
}

export interface FieldError {
  field: string
  messages: string[]
}

/** Mirrors the API's AllExceptionsFilter body. */
export interface ApiErrorBody {
  statusCode: number
  error: string
  message: string
  details?: FieldError[]
  path: string
  timestamp: string
}

export type SortOrder = 'asc' | 'desc'
