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
} from '@/components/ui/sidebar';
import { useAuth } from '@/auth/useAuth';
import { NAV_GROUPS } from './nav';

export function AppSidebar() {
  const { user } = useAuth();
  const location = useLocation();

  return (
    <SidebarRoot collapsible="icon">
      <SidebarHeader className="px-3 py-3">
        <span className="text-sm font-semibold tracking-tight group-data-[collapsible=icon]:hidden">
          PPFC Portal
        </span>
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
                        render={<Link to={item.to} />}
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
