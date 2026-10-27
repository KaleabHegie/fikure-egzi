import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api/client'
import type { AuditEntry, AuditQuery, AuditUser } from './types'

export const auditKeys = {
  all: ['audit'] as const,
  list: (q: AuditQuery) => [...auditKeys.all, 'list', q] as const,
  users: () => [...auditKeys.all, 'users'] as const,
}

export function useAuditLog(q: AuditQuery) {
  return useQuery({
    queryKey: auditKeys.list(q),
    queryFn: () => api.getPage<AuditEntry>('/audit', q),
    placeholderData: (prev) => prev,
  })
}

/** The people whose actions the current user may see. */
export function useAuditUsers() {
  return useQuery({ queryKey: auditKeys.users(), queryFn: () => api.get<AuditUser[]>('/audit/users') })
}
