import { QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from 'react-router'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { AuthProvider } from '@/features/auth/auth-context'
import { ThemeProvider, useTheme } from '@/lib/theme'
import { queryClient } from './query-client'
import { router } from './router'

function ThemedToaster() {
  const { resolvedTheme } = useTheme()
  return <Toaster position="top-right" theme={resolvedTheme} richColors closeButton />
}

export function App() {
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <TooltipProvider>
            <RouterProvider router={router} />
            <ThemedToaster />
          </TooltipProvider>
        </AuthProvider>
      </QueryClientProvider>
    </ThemeProvider>
  )
}
