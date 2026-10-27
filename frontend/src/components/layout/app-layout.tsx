import { Menu } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Outlet } from 'react-router'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { BrandMark } from './brand-mark'
import { LanguageSwitch, ThemeToggle } from './preferences'
import { SidebarPanel } from './sidebar-nav'
import { UserMenu } from './user-menu'

export function AppLayout() {
  const { t } = useTranslation()
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <div className="flex min-h-svh">
      <aside className="sticky top-0 hidden h-svh w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar lg:flex">
        <SidebarPanel />
      </aside>

      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-64 gap-0 bg-sidebar p-0">
          <SheetTitle className="sr-only">{t('nav.navigation')}</SheetTitle>
          <SheetDescription className="sr-only">{t('nav.main')}</SheetDescription>
          <SidebarPanel onNavigate={() => setMobileOpen(false)} />
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b bg-background/85 px-4 backdrop-blur sm:px-6">
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setMobileOpen(true)} aria-label={t('nav.openNavigation')}>
            <Menu />
          </Button>
          <BrandMark compact className="lg:hidden" />
          <div className="ml-auto flex items-center gap-2">
            <LanguageSwitch />
            <ThemeToggle />
            <UserMenu />
          </div>
        </header>
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
