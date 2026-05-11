import {
  LayoutDashboard, Users, ShoppingCart, Trophy, RefreshCcw, Boxes,
  Tag, Globe2, UserCog, FileCheck2, CreditCard, Banknote, Award, CalendarClock, ShieldAlert, MessageCircle,
} from "lucide-react";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

export type AdminSection =
  | "overview" | "users" | "orders" | "leaderboard" | "replacements"
  | "stock" | "categories" | "vpn_brands" | "sellers" | "applications"
  | "payments" | "payouts" | "accounts" | "brand" | "risk" | "messages";

const groups: { label: string; items: { id: AdminSection; title: string; icon: any; badge?: number }[] }[] = [];

export const AdminSidebar = ({
  active, onSelect, pendingCounts,
}: {
  active: AdminSection;
  onSelect: (s: AdminSection) => void;
  pendingCounts?: { replacements?: number; topups?: number; withdraws?: number; applications?: number; messages?: number };
}) => {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const c = pendingCounts ?? {};

  const navGroups: { label: string; items: { id: AdminSection; title: string; icon: any; badge?: number }[] }[] = [
    {
      label: "Operations",
      items: [
        { id: "overview", title: "Overview", icon: LayoutDashboard },
        { id: "orders", title: "Orders", icon: ShoppingCart },
        { id: "replacements", title: "Replacements", icon: RefreshCcw, badge: c.replacements },
        { id: "messages", title: "Messaging", icon: MessageCircle, badge: c.messages },
        { id: "payments", title: "Payments", icon: CreditCard, badge: (c.topups ?? 0) + (c.withdraws ?? 0) },
        { id: "payouts", title: "Payout schedule", icon: CalendarClock },
      ],
    },
    {
      label: "People",
      items: [
        { id: "users", title: "Users & money", icon: Users },
        { id: "risk", title: "Risk queue", icon: ShieldAlert },
        { id: "leaderboard", title: "Leaderboard", icon: Trophy },
        { id: "applications", title: "Seller apps", icon: FileCheck2, badge: c.applications },
        { id: "sellers", title: "Seller limits", icon: UserCog },
      ],
    },
    {
      label: "Catalog",
      items: [
        { id: "stock", title: "Stock", icon: Boxes },
        { id: "categories", title: "Categories", icon: Tag },
        { id: "vpn_brands", title: "VPN brands", icon: Globe2 },
      ],
    },
    {
      label: "Settings",
      items: [
        { id: "accounts", title: "Payment accounts", icon: Banknote },
        { id: "brand", title: "Brand credit", icon: Award },
      ],
    },
  ];

  return (
    <Sidebar collapsible="icon" className="border-r border-border/60">
      <SidebarContent>
        {navGroups.map((g) => (
          <SidebarGroup key={g.label}>
            <SidebarGroupLabel>{g.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {g.items.map((item) => {
                  const Icon = item.icon;
                  const isActive = active === item.id;
                  return (
                    <SidebarMenuItem key={item.id}>
                      <SidebarMenuButton
                        asChild
                        isActive={isActive}
                        tooltip={item.title}
                      >
                        <button
                          type="button"
                          onClick={() => onSelect(item.id)}
                          className={cn(
                            "flex w-full items-center gap-2 hover:bg-muted/50",
                            isActive && "font-semibold text-primary",
                          )}
                        >
                          <Icon className="h-4 w-4 shrink-0" />
                          {!collapsed && <span className="flex-1 text-left">{item.title}</span>}
                          {!collapsed && item.badge ? (
                            <span className="ml-auto rounded-full bg-warning/20 px-2 py-0.5 text-[10px] font-semibold text-warning">
                              {item.badge}
                            </span>
                          ) : null}
                        </button>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
    </Sidebar>
  );
};
