import {
  AlertTriangle,
  BarChart3,
  Bot,
  FolderKanban,
  GitPullRequest,
  LayoutDashboard,
  ListChecks,
  Tags,
  ScrollText,
  Shield,
  Users,
  type LucideIcon,
} from 'lucide-react';
import type { AuthUser } from '@/auth/types';
import { isAdmin, isProjectManager } from '@/auth/can';

export interface NavItem {
  label: string;
  to: string;
  icon: LucideIcon;
  // Per-item version of NavGroup.visible, for one admin-only link inside
  // a group other roles can see.
  visible?: (user: AuthUser | null) => boolean;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
  // Omitted entirely (not just disabled) when this returns false — CLAUDE.md
  // "Role-aware UI is convenience only," but there is no reason to show a
  // contributor a group of links that only ever lead to a 403.
  visible?: (user: AuthUser | null) => boolean;
}

// CLAUDE.md layout: "left sidebar ... with grouped nav: Overview
// (Dashboard), Delivery (Projects, My tasks, Risks), Governance (Change
// requests), Finance (Alerts, Comparison), Admin (Users, Audit log,
// Automation)."
export const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Overview',
    items: [{ label: 'Dashboard', to: '/dashboard', icon: LayoutDashboard }],
  },
  {
    label: 'Delivery',
    items: [
      { label: 'Projects', to: '/projects', icon: FolderKanban },
      { label: 'My tasks', to: '/my-tasks', icon: ListChecks },
      { label: 'Risks', to: '/risks', icon: Shield },
    ],
  },
  {
    label: 'Governance',
    items: [{ label: 'Change requests', to: '/change-requests', icon: GitPullRequest }],
  },
  {
    label: 'Finance',
    // Contributors "never ... edit finance" (CLAUDE.md) — finance screens
    // show portfolio-wide budget/spend figures a contributor has no role-
    // based reason to see, so the group is hidden rather than shown
    // read-only.
    visible: (user) => isAdmin(user) || isProjectManager(user),
    items: [
      { label: 'Alerts', to: '/finance/alerts', icon: AlertTriangle },
      { label: 'Comparison', to: '/finance/comparison', icon: BarChart3 },
      // Category create/rename/deactivate is admin-only (backend requireRole).
      { label: 'Cost categories', to: '/finance/categories', icon: Tags, visible: (user) => isAdmin(user) },
    ],
  },
  {
    label: 'Admin',
    visible: (user) => isAdmin(user),
    items: [
      { label: 'Users', to: '/admin/users', icon: Users },
      { label: 'Audit log', to: '/admin/audit-log', icon: ScrollText },
      { label: 'Automation', to: '/admin/automation', icon: Bot },
    ],
  },
];
