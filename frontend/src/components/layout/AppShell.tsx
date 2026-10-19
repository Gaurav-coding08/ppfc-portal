import { Outlet } from 'react-router-dom';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { AppSidebar } from './Sidebar';
import { Topbar } from './Topbar';

// CLAUDE.md: "page padding 24px (16px mobile)" and "max content width 1440px."
export function AppShell() {
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <Topbar />
        <main className="mx-auto w-full max-w-[1440px] flex-1 p-4 md:p-6">
          <Outlet />
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
