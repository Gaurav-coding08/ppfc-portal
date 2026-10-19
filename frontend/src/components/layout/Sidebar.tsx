import { Link, useLocation } from 'react-router-dom';
import {
  Sidebar as SidebarRoot,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar';
import { useAuth } from '@/auth/useAuth';
import { KeelLogo } from '@/components/display/KeelLogo';
import { NAV_GROUPS } from './nav';

export function AppSidebar() {
  const { user } = useAuth();
  const location = useLocation();
  // On phones the sidebar is a drawer; close it once a page is chosen.
  const { isMobile, setOpenMobile } = useSidebar();

  return (
    <SidebarRoot collapsible="icon">
      <SidebarHeader className="px-3 py-3">
        <div className="flex items-center gap-2">
          <KeelLogo className="text-primary size-6 shrink-0" />
          <span className="text-sm font-semibold tracking-tight group-data-[collapsible=icon]:hidden">
            Keel
          </span>
        </div>
      </SidebarHeader>
      <SidebarContent>
        {NAV_GROUPS.filter((group) => group.visible?.(user) ?? true).map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items
                  .filter((item) => item.visible?.(user) ?? true)
                  .map((item) => (
                    <SidebarMenuItem key={item.to}>
                      <SidebarMenuButton
                        render={<Link to={item.to} onClick={() => isMobile && setOpenMobile(false)} />}
                        isActive={location.pathname.startsWith(item.to)}
                        tooltip={item.label}
                      >
                        <item.icon />
                        <span>{item.label}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
    </SidebarRoot>
  );
}
