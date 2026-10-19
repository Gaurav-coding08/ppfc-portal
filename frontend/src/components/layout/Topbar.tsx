import { Bell, ChevronDown, LogOut } from 'lucide-react';
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
    <header className="bg-background/80 flex h-14 shrink-0 items-center gap-3 border-b px-4 backdrop-blur-sm">
      <SidebarTrigger />
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbPage>{currentPageLabel(location.pathname)}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="ml-auto flex items-center gap-3">
        {reportingDate && (
          <ToneBadge tone="neutral">
            Data as of <DateText value={reportingDate} />
          </ToneBadge>
        )}

        {/* Unread count wiring arrives with the notifications module (M3). */}
        <Button variant="ghost" size="icon" aria-label="Notifications">
          <Bell className="size-4" />
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button variant="ghost" className="gap-2 px-2">
                <Avatar className="size-6">
                  <AvatarFallback className="text-[10px]">{initials}</AvatarFallback>
                </Avatar>
                <span className="max-w-32 truncate text-sm">{user?.fullName}</span>
                <ChevronDown className="text-muted-foreground size-3.5" />
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
