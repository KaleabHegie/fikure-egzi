import {
  BookOpen,
  Building2,
  CalendarCheck,
  GraduationCap,
  LayoutDashboard,
  Package,
  type LucideIcon,
  ScrollText,
  ShieldCheck,
  Users,
  UsersRound,
} from 'lucide-react'
import { PERMISSIONS, type PermissionCode } from '@/lib/permissions'

type NavKey =
  | 'dashboard'
  | 'members'
  | 'classes'
  | 'departments'
  | 'attendance'
  | 'courses'
  | 'serviceGroups'
  | 'assets'
  | 'users'
  | 'audit'

export interface NavItem {
  /** Translation key under `nav.` */
  key: NavKey
  icon: LucideIcon
  /** Omitted for modules that are planned but not built yet. */
  to?: string
  permission?: PermissionCode
}

export interface NavSection {
  /** Translation key under `nav.groups.`; the opening group has no heading. */
  titleKey?: 'people' | 'operations' | 'administration'
  items: NavItem[]
}

/**
 * Sidebar structure. Adding a module = adding its route in app/router.tsx,
 * its label in the locale files (nav.*), and giving its entry here a `to`
 * and a permission.
 */
export const NAVIGATION: NavSection[] = [
  {
    items: [
      // Attendance takers only get the attendance page, so the dashboard needs member access.
      { key: 'dashboard', icon: LayoutDashboard, to: '/', permission: PERMISSIONS.MEMBERS_READ },
    ],
  },
  {
    titleKey: 'people',
    items: [
      {
        key: 'departments',
        icon: Building2,
        to: '/departments',
        permission: PERMISSIONS.DEPARTMENTS_READ,
      },
      { key: 'members', icon: Users, to: '/members', permission: PERMISSIONS.MEMBERS_READ },
      { key: 'classes', icon: BookOpen, to: '/classes', permission: PERMISSIONS.CLASSES_READ },
      {
        key: 'serviceGroups',
        icon: UsersRound,
        to: '/service-groups',
        permission: PERMISSIONS.CLASSES_READ,
      },
    ],
  },
  {
    titleKey: 'operations',
    items: [
      {
        key: 'attendance',
        icon: CalendarCheck,
        to: '/attendance',
        permission: PERMISSIONS.ATTENDANCE_READ,
      },
      { key: 'courses', icon: GraduationCap, to: '/courses', permission: PERMISSIONS.COURSES_READ },
      { key: 'assets', icon: Package, to: '/assets', permission: PERMISSIONS.ASSETS_READ },
    ],
  },
  {
    titleKey: 'administration',
    items: [
      { key: 'users', icon: ShieldCheck, to: '/users', permission: PERMISSIONS.USERS_MANAGE },
      { key: 'audit', icon: ScrollText, to: '/audit', permission: PERMISSIONS.AUDIT_READ },
    ],
  },
]
