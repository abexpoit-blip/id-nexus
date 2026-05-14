import { useEffect, useMemo, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { api } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ArrowLeft, Loader2, AlertTriangle, RefreshCcw, DollarSign, XCircle, CheckCheck, ScrollText } from "lucide-react";
import { toast } from "sonner";
import { NotificationsBell } from "@/components/NotificationsBell";
import { CategoriesManager } from "@/components/admin/CategoriesManager";
import { SellerLimitsManager } from "@/components/admin/SellerLimitsManager";
import { SellerUploadsManager } from "@/components/admin/SellerUploadsManager";
import { StockOverview } from "@/components/admin/StockOverview";
import { PaymentsManager } from "@/components/admin/PaymentsManager";
import { SellerApplicationsManager } from "@/components/admin/SellerApplicationsManager";
import { BrandSettingsManager } from "@/components/admin/BrandSettingsManager";
import { VpnBrandsManager } from "@/components/admin/VpnBrandsManager";
import { PaymentAccountsManager } from "@/components/admin/PaymentAccountsManager";
import { AdminOverview } from "@/components/admin/AdminOverview";
import { UsersManager } from "@/components/admin/UsersManager";
import { OrdersManager } from "@/components/admin/OrdersManager";
import { SellerLeaderboard } from "@/components/admin/SellerLeaderboard";
import { AdminSidebar } from "@/components/admin/AdminSidebar";
import { RevenueChart } from "@/components/admin/RevenueChart";
import { ActivityFeed } from "@/components/admin/ActivityFeed";
import { GlobalSearch } from "@/components/admin/GlobalSearch";
import { PayoutScheduleManager } from "@/components/admin/PayoutScheduleManager";
import { BuyerRiskQueue } from "@/components/admin/BuyerRiskQueue";
import { MessagesManager } from "@/components/admin/MessagesManager";
import { SupportTicketsManager } from "@/components/admin/SupportTicketsManager";
import { NoticesManager } from "@/components/admin/NoticesManager";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AdminReplacementsView } from "@/components/admin/AdminReplacementsView";

interface RpItem {
  id: string;
  request_id: string;
  reported_uid: string;
  outcome: string;
  outcome_reason: string | null;
  in_window: boolean;
  window_hours: number | null;
  created_at: string;
  buyer_id: string;
  seller_id: string | null;
  account_id: string | null;
}

const outcomeBadgeClass = (o: string) => {
  const map: Record<string, string> = {
    pending: "bg-warning/20 text-warning",
    replaced: "bg-success/20 text-success",
    refunded: "bg-success/20 text-success",
    rejected: "bg-destructive/20 text-destructive",
    out_of_window: "bg-muted text-muted-foreground",
    not_yours: "bg-muted text-muted-foreground",
  };
  return map[o] ?? "bg-muted text-muted-foreground";
};

const Admin = () => {
  const { user, roles, loading: authLoading } = useAuth();
  const isAdmin = roles.includes("admin");

  const [items, setItems] = useState<RpItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"pending" | "all">("pending");
  const [section, setSection] = useState<
    "overview" | "users" | "orders" | "leaderboard" | "replacements" | "stock" | "categories" | "vpn_brands" | "sellers" | "seller_uploads" | "applications" | "payments" | "payouts" | "accounts" | "brand" | "risk" | "messages" | "support" | "notices"
  >("overview");
  const [search, setSearch] = useState("");
  const [actingItem, setActingItem] = useState<RpItem | null>(null);
  const [action, setAction] = useState<"replace" | "refund" | "reject" | "replace_category" | null>(null);
  const [targetCategoryId, setTargetCategoryId] = useState<string>("");
  const [reason, setReason] = useState("");
  const [customMessage, setCustomMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [unreadMsgs, setUnreadMsgs] = useState(0);

  const load = async () => {
    if (!isAdmin) return;
    setLoading(true);
    try {
      const { items } = await api.get<{ items: RpItem[] }>("/api/admin/replacement-items");
      setItems(items ?? []);
    } catch (e: any) { toast.error(e?.message || "Failed"); }
    setLoading(false);
  };

  useEffect(() => {
    load();
    if (!isAdmin) return;
    const t = setInterval(load, 30_000);
    api.get<{ categories: any[] }>("/api/admin/categories")
      .then((r) => {
        setCategories(
          (r.categories || [])
            .filter((c: any) => c.is_active && c.kind === "fb_account")
            .map((c: any) => ({ id: c.id, name: c.name })),
        );
      })
      .catch(() => {});
    const loadMsgs = () => {
      api.get<{ unread: number }>("/api/messages/admin/unread-summary")
        .then((r) => setUnreadMsgs(r.unread ?? 0))
        .catch(() => {});
    };
    loadMsgs();
    const tm = setInterval(loadMsgs, 20_000);
    return () => { clearInterval(t); clearInterval(tm); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);

  const filtered = useMemo(() => {
    let list = items;
    if (tab === "pending") list = list.filter((i) => i.outcome === "pending");
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (i) =>
          i.reported_uid.toLowerCase().includes(q) ||
          i.id.toLowerCase().includes(q) ||
          i.request_id.toLowerCase().includes(q),
      );
    }
    return list;
  }, [items, tab, search]);

  const counts = useMemo(() => {
    return {
      pending: items.filter((i) => i.outcome === "pending").length,
      replaced: items.filter((i) => i.outcome === "replaced").length,
      refunded: items.filter((i) => i.outcome === "refunded").length,
      rejected: items.filter((i) => i.outcome === "rejected").length,
    };
  }, [items]);

  const openAction = (item: RpItem, act: "replace" | "refund" | "reject" | "replace_category", catId?: string) => {
    setActingItem(item);
    setAction(act);
    setReason("");
    setCustomMessage("");
    setTargetCategoryId(catId ?? "");
  };

  const submit = async () => {
    if (!actingItem || !action) return;
    setSubmitting(true);
    try {
      if (action === "replace_category") {
        if (!targetCategoryId) { toast.error("Pick a category"); setSubmitting(false); return; }
        await api.post(`/api/admin/replacement-items/${actingItem.id}/replace-from`, {
          category_id: targetCategoryId,
          reason: reason.trim() || null,
        });
      } else {
        await api.post(`/api/admin/replacement-items/${actingItem.id}/resolve`, {
          action,
          reason: reason.trim() || null,
        });
      }
      toast.success(action === "replace_category" ? "Replaced from chosen category" : `Marked as ${action}`);
      setActingItem(null);
      setAction(null);
      load();
    } catch (e: any) { toast.error(e?.message || "Failed"); }
    finally { setSubmitting(false); }
  };

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }
  if (!user) return <Navigate to="/admin-login" replace />;
  if (!isAdmin) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <Card className="max-w-md border-border/60 bg-gradient-card p-8 text-center">
          <AlertTriangle className="mx-auto h-10 w-10 text-warning" />
          <h2 className="mt-4 font-display text-xl font-semibold">Admin only</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            This page requires admin permissions.
          </p>
          <Button asChild className="mt-6">
            <Link to="/dashboard">Back to dashboard</Link>
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background text-foreground">
        <AdminSidebar
          active={section}
          onSelect={(s) => setSection(s as typeof section)}
          pendingCounts={{ replacements: counts.pending, messages: unreadMsgs }}
        />
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-40 flex h-16 items-center justify-between border-b border-border/60 bg-background/80 px-4 backdrop-blur-xl">
            <div className="flex items-center gap-3">
              <SidebarTrigger />
              <Link to="/dashboard" className="hidden text-sm text-muted-foreground hover:text-foreground sm:inline">
                <ArrowLeft className="inline h-4 w-4" /> Dashboard
              </Link>
              <Logo size="sm" showTagline={false} />
              <Badge variant="outline" className="border-primary/40 text-primary">Admin</Badge>
            </div>
            <div className="flex items-center gap-2">
              <GlobalSearch onJump={(s) => setSection(s as typeof section)} />
              <Button variant="outline" size="sm" asChild>
                <Link to="/admin/audit">
                  <ScrollText className="mr-2 h-4 w-4" /> Audit log
                </Link>
              </Button>
              <NotificationsBell />
            </div>
          </header>
          <div className="rainbow-strip h-0.5 w-full" />

          <main className="min-w-0 flex-1 px-3 py-4 sm:px-4 md:px-8 md:py-6">
            <div className="mb-4 md:mb-6">
              <h1 className="font-display text-2xl font-bold md:text-3xl">
                <span className="heading-gradient">Admin CMS</span>
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Manage stock, pricing, categories, seller limits, and resolve replacement issues.
              </p>
            </div>

        {section === "overview" && (
          <div className="space-y-6">
            <AdminOverview onJump={(s) => setSection(s as typeof section)} />
            <div className="grid gap-4 lg:grid-cols-3">
              <div className="lg:col-span-2"><RevenueChart /></div>
              <ActivityFeed />
            </div>
          </div>
        )}
        {section === "users" && <UsersManager />}
        {section === "risk" && <BuyerRiskQueue />}
        {section === "orders" && <OrdersManager />}
        {section === "messages" && <MessagesManager />}
        {section === "support" && <SupportTicketsManager />}
        {section === "notices" && <NoticesManager />}
        {section === "leaderboard" && <SellerLeaderboard />}
        {section === "stock" && <StockOverview />}
        {section === "categories" && <CategoriesManager />}
        {section === "vpn_brands" && <VpnBrandsManager />}
        {section === "sellers" && <SellerLimitsManager />}
        {section === "seller_uploads" && <SellerUploadsManager />}
        {section === "applications" && <SellerApplicationsManager />}
        {section === "payments" && <PaymentsManager />}
        {section === "payouts" && <PayoutScheduleManager />}
        {section === "accounts" && <PaymentAccountsManager />}
        {section === "brand" && <BrandSettingsManager />}

        {section === "replacements" && (
          <AdminReplacementsView
            items={items}
            loading={loading}
            categories={categories}
            onAction={openAction}
          />
        )}
          </main>
        </div>
      </div>

      <Dialog open={!!actingItem} onOpenChange={(o) => !o && setActingItem(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="capitalize">
              {action === "replace_category"
                ? `Replace with ${categories.find((c) => c.id === targetCategoryId)?.name ?? "selected category"}`
                : `${action} replacement`}
            </DialogTitle>
            <DialogDescription>
              UID <span className="font-mono">{actingItem?.reported_uid}</span> ·
              {action === "replace_category"
                ? ` Picks the oldest available ID from the chosen category and assigns it to the buyer.`
                : action === "replace"
                ? " Issues a fresh available ID from the same category to the buyer."
                : action === "refund"
                ? " Credits the buyer's balance with the original unit price."
                : " Closes without action — buyer will be notified."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Internal reason (optional)</label>
              <Input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Short note — visible to buyer & seller"
                maxLength={500}
              />
            </div>
            {(action === "replace" || action === "replace_category") && (
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Custom message to buyer (optional)</label>
                <Textarea
                  value={customMessage}
                  onChange={(e) => setCustomMessage(e.target.value)}
                  placeholder="If empty, a default replacement message will be sent."
                  maxLength={1000}
                  rows={3}
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setActingItem(null)} disabled={submitting}>
              Cancel
            </Button>
            <Button
              onClick={submit}
              disabled={submitting}
              className="bg-gradient-brand text-primary-foreground hover:opacity-90"
            >
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SidebarProvider>
  );
};

export default Admin;