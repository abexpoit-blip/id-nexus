import {
  LayoutDashboard, Users, ShoppingCart, Trophy, RefreshCcw, Boxes,
  Tag, Globe2, UserCog, FileCheck2, CreditCard, Banknote, Award, CalendarClock, ShieldAlert, MessageCircle, LifeBuoy, Megaphone, ClipboardCheck,
} from "lucide-react";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

export type AdminSection =
  | "overview" | "users" | "orders" | "leaderboard" | "replacements"
  | "stock" | "categories" | "vpn_brands" | "sellers" | "applications"
  | "payments" | "payouts" | "accounts" | "brand" | "risk" | "messages" | "support" | "notices"
  | "seller_uploads";

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
        { id: "support", title: "Support tickets", icon: LifeBuoy },
        { id: "notices", title: "Notices", icon: Megaphone },
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
        { id: "seller_uploads", title: "Seller uploads", icon: ClipboardCheck },
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
                          aria-current={isActive ? "page" : undefined}
                          aria-label={item.badge ? `${item.title}, ${item.badge} pending` : undefined}
                          className={cn(
                            "flex w-full items-center gap-2 hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-sidebar",
                            isActive && "nav-active-rainbow font-semibold",
                          )}
                        >
                          <Icon
                            aria-hidden="true"
                            className={cn("h-4 w-4 shrink-0", isActive && "text-primary")}
                          />
                          {!collapsed && <span className="flex-1 text-left">{item.title}</span>}
                          {!collapsed && item.badge ? (
                            <span
                              aria-hidden="true"
                              className="ml-auto rounded-full bg-gradient-to-r from-amber-500 to-rose-500 px-2 py-0.5 text-[10px] font-semibold text-white shadow-md"
                            >
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
