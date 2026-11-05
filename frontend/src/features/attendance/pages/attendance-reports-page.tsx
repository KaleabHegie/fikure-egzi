import { useTranslation } from 'react-i18next'
import { Navigate, useSearchParams } from 'react-router'
import { PageHeader } from '@/components/layout/page-header'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useAuth } from '@/features/auth/use-auth'
import { PERMISSIONS } from '@/lib/permissions'
import { LowAttendanceReport } from '../components/low-attendance-report'
import { TopAttendanceReport } from '../components/top-attendance-report'

/** Attendance reports: who comes most, and who needs a follow-up visit. */
export function AttendanceReportsPage() {
  const { t } = useTranslation()
  const { can } = useAuth()
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') === 'low' ? 'low' : 'top'

  // The reports list members, so attendance takers (scanners) don't get them.
  if (!can(PERMISSIONS.MEMBERS_READ)) return <Navigate to="/attendance" replace />

  return (
    <>
      <PageHeader title={t('nav.attendanceReports')} description={t('attendance.reportsDescription')} />
      <Tabs value={tab} onValueChange={(v) => setParams(v === 'top' ? {} : { tab: v }, { replace: true })}>
        <TabsList className="mb-4">
          <TabsTrigger value="top">{t('attendance.tabs.top')}</TabsTrigger>
          <TabsTrigger value="low">{t('attendance.tabs.report')}</TabsTrigger>
        </TabsList>
        <TabsContent value="top">
          <TopAttendanceReport />
        </TabsContent>
        <TabsContent value="low">
          <LowAttendanceReport />
        </TabsContent>
      </Tabs>
    </>
  )
}
