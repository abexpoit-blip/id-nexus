import { ReactNode, useMemo } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  ShoppingBag,
  Wallet,
  RefreshCcw,
  Upload,
  Store,
  Shield,
  ScrollText,
  LogOut,
  ArrowLeftRight,
  Globe,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { NotificationsBell } from "@/components/NotificationsBell";
import { BrandFooter } from "@/components/BrandFooter";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type NavItem = {
  label: string;
  to: string;
  icon: typeof LayoutDashboard;
  match?: (path: string) => boolean;
  /**
   * When true, this tab is a deliberate "switch app mode" action
   * (e.g. seller → buyer area). It must NEVER show as active in the
   * current mode and requires a confirm tap before navigating.
   */
  switchMode?: boolean;
};

const buyerNav: NavItem[] = [
  { label: "Dashboard", to: "/dashboard", icon: LayoutDashboard, match: (p) => p === "/dashboard" },
  { label: "Browse", to: "/browse", icon: ShoppingBag, match: (p) => p.startsWith("/browse") },
  { label: "VPN", to: "/vpn", icon: Globe, match: (p) => p.startsWith("/vpn") },
  { label: "Wallet", to: "/wallet", icon: Wallet, match: (p) => p.startsWith("/wallet") },
  { label: "Replacements", to: "/replacements", icon: RefreshCcw, match: (p) => p.startsWith("/replacements") },
];

const sellerNav: NavItem[] = [
  { label: "Dashboard", to: "/seller", icon: LayoutDashboard, match: (p) => p === "/seller" },
  { label: "Upload", to: "/seller", icon: Upload, match: () => false },
  { label: "Wallet", to: "/wallet", icon: Wallet, match: (p) => p.startsWith("/wallet") },
];

const adminExtras: NavItem[] = [
  { label: "Admin", to: "/admin", icon: Shield, match: (p) => p === "/admin" },
  { label: "Audit", to: "/admin/audit", icon: ScrollText, match: (p) => p.startsWith("/admin/audit") },
];

export type AppShellMode = "buyer" | "seller";

interface AppShellProps {
  mode: AppShellMode;
  title?: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
}

function isActive(path: string, item: NavItem) {
  // Hard guard: switchMode tabs can never appear active — they belong
  // to the *other* mode and must remain visually neutral.
  if (item.switchMode) return false;
  return item.match ? item.match(path) : path === item.to;
}

function SideNav({ mode }: { mode: AppShellMode }) {
  const { roles } = useAuth();
  const isAdmin = roles.includes("admin");
  const items = mode === "seller" ? sellerNav : buyerNav;
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border">
      <SidebarContent className="bg-sidebar">
        <div className="flex h-16 items-center justify-center border-b border-sidebar-border px-3">
          {collapsed ? (
            <div className="h-8 w-8 rounded-lg bg-gradient-brand" />
          ) : (
            <Logo size="sm" showTagline={false} />
          )}
        </div>

        <SidebarGroup>
          <SidebarGroupLabel>{mode === "seller" ? "Seller" : "Buyer"}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => {
                const active = isActive(location.pathname, item);
                const Icon = item.icon;
                return (
                  <SidebarMenuItem key={`${item.label}-${item.to}`}>
                    <SidebarMenuButton asChild isActive={active} tooltip={item.label}>
                      <Link
                        to={item.to}
                        aria-current={active ? "page" : undefined}
                        className={cn(
                          "flex items-center gap-3",
                          active &&
                            "bg-sidebar-accent text-sidebar-accent-foreground font-semibold",
                        )}
                      >
                        <Icon className="h-4 w-4" aria-hidden="true" />
                        {!collapsed && <span>{item.label}</span>}
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {isAdmin && (
          <SidebarGroup>
            <SidebarGroupLabel>Admin</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {adminExtras.map((item) => {
                  const active = isActive(location.pathname, item);
                  const Icon = item.icon;
                  return (
                    <SidebarMenuItem key={item.to}>
                      <SidebarMenuButton asChild isActive={active} tooltip={item.label}>
                        <Link
                          to={item.to}
                          aria-current={active ? "page" : undefined}
                          className={cn(
                            "flex items-center gap-3",
                            active &&
                              "bg-sidebar-accent text-sidebar-accent-foreground font-semibold",
                          )}
                        >
                          <Icon className="h-4 w-4" aria-hidden="true" />
                          {!collapsed && <span>{item.label}</span>}
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        <SidebarGroup>
          <SidebarGroupLabel>Switch mode</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {mode === "buyer" ? (
                roles.includes("seller") || isAdmin ? (
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild tooltip="Seller area">
                      <Link to="/seller" className="flex items-center gap-3">
                        <Store className="h-4 w-4" />
                        {!collapsed && <span>Seller</span>}
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ) : (
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild tooltip="Apply to become a seller">
                      <Link to="/apply-seller" className="flex items-center gap-3">
                        <Store className="h-4 w-4" />
                        {!collapsed && <span>Become seller</span>}
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )
              ) : isAdmin ? (
                <SidebarMenuItem>
                  <SidebarMenuButton asChild tooltip="Buyer area">
                    <Link to="/dashboard" className="flex items-center gap-3">
                      <ShoppingBag className="h-4 w-4" />
                      {!collapsed && <span>Buyer</span>}
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ) : null}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}

function MobileBottomTabs({ mode }: { mode: AppShellMode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { roles } = useAuth();
  const isAdmin = roles.includes("admin");
  // Pick 4 most useful tabs for mobile
  const items: NavItem[] =
    mode === "seller"
      ? [
          { label: "Stock", to: "/seller", icon: LayoutDashboard, match: (p) => p === "/seller" },
          { label: "Wallet", to: "/wallet", icon: Wallet, match: (p) => p.startsWith("/wallet") },
          ...(isAdmin
            ? [{ label: "Admin", to: "/admin", icon: Shield, match: (p: string) => p === "/admin" } as NavItem]
            : []),
        ]
      : [
          { label: "Home", to: "/dashboard", icon: LayoutDashboard, match: (p) => p === "/dashboard" },
          { label: "Browse", to: "/browse", icon: ShoppingBag, match: (p) => p.startsWith("/browse") },
          { label: "Wallet", to: "/wallet", icon: Wallet, match: (p) => p.startsWith("/wallet") },
          { label: "Replace", to: "/replacements", icon: RefreshCcw, match: (p) => p.startsWith("/replacements") },
        ];

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border/60 bg-background/95 backdrop-blur-xl md:hidden">
      <ul
        className="grid"
        style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}
      >
        {items.map((item) => {
          const active = isActive(location.pathname, item);
          const Icon = item.icon;
          const isSwitch = !!item.switchMode;
          return (
            <li key={`${item.label}-${item.to}`}>
              {isSwitch ? (
                <button
                  type="button"
                  aria-label={`Switch to ${item.label} area`}
                  onClick={(e) => {
                    e.preventDefault();
                    // Deliberate confirmation prevents accidental navigation
                    // away from seller mode via a stray tap.
                    toast(`Switch to ${item.label} area?`, {
                      action: {
                        label: "Switch",
                        onClick: () => navigate(item.to),
                      },
                    });
                  }}
                  className="flex w-full flex-col items-center justify-center gap-1 py-2.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70 transition-colors hover:text-foreground"
                >
                  <Icon className="h-5 w-5" aria-hidden="true" />
                  <span>{item.label}</span>
                </button>
              ) : (
                <Link
                  to={item.to}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex flex-col items-center justify-center gap-1 py-2.5 text-[10px] font-medium uppercase tracking-wider transition-colors",
                    active
                      ? "text-primary"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Icon className={cn("h-5 w-5", active && "drop-shadow-[0_0_8px_hsl(var(--primary)/0.55)]")} aria-hidden="true" />
                  <span>{item.label}</span>
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export const AppShell = ({ mode, title, subtitle, actions, children }: AppShellProps) => {
  const { user, profile, roles, signOut } = useAuth();
  const navigate = useNavigate();
  const isAdmin = roles.includes("admin");
  const isSeller = roles.includes("seller");
  const primaryRole = useMemo(
    () => (isAdmin ? "admin" : mode === "seller" || isSeller ? "seller" : "buyer"),
    [isAdmin, isSeller, mode],
  );

  return (
    <SidebarProvider defaultOpen>
      <div className="flex min-h-screen w-full bg-background text-foreground">
        {/* PC Sidebar */}
        <div className="hidden md:block">
          <SideNav mode={mode} />
        </div>

        <div className="flex min-w-0 flex-1 flex-col">
          {/* Top header */}
          <header className="sticky top-0 z-30 border-b border-border/60 bg-background/80 backdrop-blur-xl">
            <div className="flex h-16 items-center gap-3 px-4 md:px-6">
              <div className="hidden md:block">
                <SidebarTrigger />
              </div>
              <Link to="/" className="md:hidden">
                <Logo size="sm" showTagline={false} />
              </Link>
              <div className="ml-auto flex items-center gap-2 md:gap-3">
                <NotificationsBell />
                <span className="pill-gold capitalize">{primaryRole}</span>
                <span className="hidden text-sm text-muted-foreground lg:inline">
                  {profile?.display_name || user?.email}
                </span>
                <Button variant="ghost" size="sm" onClick={signOut} className="hidden sm:inline-flex">
                  <LogOut className="mr-2 h-4 w-4" aria-hidden="true" /> Sign out
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={signOut}
                  className="min-h-11 min-w-11 sm:hidden"
                  aria-label="Sign out"
                >
                  <LogOut className="h-4 w-4" aria-hidden="true" />
                </Button>
              </div>
            </div>
            {(title || subtitle || actions) && (
            <>
              <div className="flex flex-wrap items-end justify-between gap-3 border-t border-border/40 px-4 py-4 md:px-6">
                <div>
                  {title && (
                    <h1 className="font-display text-xl font-bold md:text-2xl">
                      <span className="heading-rainbow">{title}</span>
                    </h1>
                  )}
                  {subtitle && (
                    <p className="text-sm text-muted-foreground">{subtitle}</p>
                  )}
                </div>
                {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
              </div>
              <div className="rainbow-strip h-0.5 w-full opacity-80" aria-hidden="true" />
            </>
            )}
          </header>

          <main className="surface-aurora flex-1 px-4 pb-24 pt-6 md:px-6 md:pb-10">{children}</main>
          <BrandFooter compact />
        </div>

        <MobileBottomTabs mode={mode} />
      </div>
    </SidebarProvider>
  );
};

export default AppShell;