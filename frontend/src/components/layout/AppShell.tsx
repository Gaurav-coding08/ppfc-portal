import { Suspense, useEffect, useState } from 'react';
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
// Sidebar by width (CLAUDE.md responsive rules): ≥ 1280 px expanded,
// 768–1279 px collapsed to icons, < 768 px a sheet drawer (the shadcn
// sidebar switches to its drawer below `md` on its own). The expanded state
// follows the breakpoint whenever the window crosses it; in between, the
// user's own toggle wins.
const WIDE_VIEWPORT = '(min-width: 1280px)';

function useSidebarOpenByWidth() {
  const [open, setOpen] = useState(() => window.matchMedia(WIDE_VIEWPORT).matches);
  useEffect(() => {
    const mql = window.matchMedia(WIDE_VIEWPORT);
    const onChange = () => setOpen(mql.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);
  return [open, setOpen] as const;
}

export function AppShell() {
  const [sidebarOpen, setSidebarOpen] = useSidebarOpenByWidth();
  return (
    <SidebarProvider open={sidebarOpen} onOpenChange={setSidebarOpen}>
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
