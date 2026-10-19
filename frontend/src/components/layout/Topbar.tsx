import { ChevronDown, Compass, LogOut, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Breadcrumb, BreadcrumbItem, BreadcrumbList, BreadcrumbPage } from '@/components/ui/breadcrumb';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { useAuth } from '@/auth/useAuth';
import { ToneBadge } from '@/components/display/ToneBadge';
import { DateText } from '@/components/display/DateText';
import { NotificationBell } from '@/features/notifications/components/NotificationBell';
import { NAV_GROUPS } from './nav';
import { useReportingDate } from './useReportingDate';

const ROLE_LABEL: Record<string, string> = {
  admin: 'Admin',
  project_manager: 'Project manager',
  contributor: 'Contributor',
};

function currentPageLabel(pathname: string): string {
  for (const group of NAV_GROUPS) {
    for (const item of group.items) {
      if (pathname.startsWith(item.to)) return item.label;
    }
  }
  const first = pathname.split('/').filter(Boolean)[0];
  return first ? first.charAt(0).toUpperCase() + first.slice(1) : 'Overview';
}

export function Topbar() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const reportingDate = useReportingDate();

  const [whatsNewOpen, setWhatsNewOpen] = useState(false);

  async function handleLogout() {
    await logout();
    navigate('/login');
  }

  const initials = user?.fullName
    ? user.fullName
        .split(' ')
        .map((p) => p[0])
        .slice(0, 2)
        .join('')
        .toUpperCase()
    : '?';

  return (
    // On phones the bar keeps every control but drops words: the badge
    // reads "As of …", the account menu shows only the avatar (its
    // aria-label still names the user) and a long page label truncates.
    <header className="bg-background/80 flex h-14 shrink-0 items-center gap-2 border-b px-3 backdrop-blur-sm sm:gap-3 sm:px-4">
      <SidebarTrigger />
      <Breadcrumb className="min-w-0">
        <BreadcrumbList>
          <BreadcrumbItem className="min-w-0">
            <BreadcrumbPage className="truncate">{currentPageLabel(location.pathname)}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-3">
        {reportingDate && (
          <ToneBadge tone="neutral">
            <span className="hidden sm:inline">Data as of</span>
            <span className="sm:hidden">As of</span> <DateText value={reportingDate} />
          </ToneBadge>
        )}

        <NotificationBell />

        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                className="gap-2 px-2"
                aria-label={`Account menu for ${user?.fullName ?? 'you'}`}
              >
                <Avatar className="size-6">
                  <AvatarFallback className="text-[10px] text-slate-700">{initials}</AvatarFallback>
                </Avatar>
                <span className="hidden max-w-32 truncate text-sm sm:inline">{user?.fullName}</span>
                <ChevronDown className="text-muted-foreground hidden size-3.5 sm:block" />
              </Button>
            }
          />
          <DropdownMenuContent align="end">
            <DropdownMenuGroup>
              <DropdownMenuLabel className="font-normal">
                <p className="text-sm font-medium">{user?.fullName}</p>
                <p className="text-muted-foreground text-xs">{user?.role ? ROLE_LABEL[user.role] : ''}</p>
              </DropdownMenuLabel>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => {
                navigate('/');
                setTimeout(() => window.dispatchEvent(new Event('keel-start-tour')), 300);
              }}
            >
              <Compass />
              Take the tour
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setWhatsNewOpen((o) => !o)}>
              <Sparkles />
              What&apos;s new
            </DropdownMenuItem>
            {whatsNewOpen && (
              <div className="px-2 py-1.5 text-xs text-slate-500 space-y-1">
                <p className="font-medium text-slate-700">Recent updates</p>
                <ul className="list-disc pl-4 space-y-0.5">
                  <li>Dashboard glance band &amp; focus strip</li>
                  <li>Project overview two-column layout</li>
                  <li>Status-colour list borders</li>
                  <li>Guided first-login tour</li>
                </ul>
              </div>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleLogout}>
              <LogOut />
              Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
