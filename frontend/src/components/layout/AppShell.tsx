import { Suspense } from 'react';
import { Outlet } from 'react-router-dom';
import { LoadingState } from '@/components/data/LoadingState';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { AppSidebar } from './Sidebar';
import { Topbar } from './Topbar';

// CLAUDE.md: "page padding 24px (16px mobile)" and "max content width 1440px."
//
// `min-w-0` on the inset and <main>: flex items default to `min-width:
// auto`, so a wide table would otherwise stretch the whole column past the
// viewport (clipping the topbar) instead of scrolling inside its own card.
export function AppShell() {
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="min-w-0">
        <Topbar />
        <main className="mx-auto w-full max-w-[1440px] min-w-0 flex-1 p-4 md:p-6">
          <Suspense fallback={<LoadingState rows={6} />}>
            <Outlet />
          </Suspense>
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
