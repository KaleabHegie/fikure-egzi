export const MEMBER_CODE_PREFIX = 'FE';

/** FE-00042. Five digits covers 99,999 members before the width grows. */
export function formatMemberCode(id: number): string {
  return `${MEMBER_CODE_PREFIX}-${String(id).padStart(5, '0')}`;
}
