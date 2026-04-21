import { useEffect, useMemo, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
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
import { ArrowLeft, Loader2, AlertTriangle, RefreshCcw, DollarSign, XCircle, CheckCheck } from "lucide-react";
import { toast } from "sonner";
import { NotificationsBell } from "@/components/NotificationsBell";
import { CategoriesManager } from "@/components/admin/CategoriesManager";
import { SellerLimitsManager } from "@/components/admin/SellerLimitsManager";
import { StockOverview } from "@/components/admin/StockOverview";

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
  const [section, setSection] = useState<"replacements" | "stock" | "categories" | "sellers">("replacements");
  const [search, setSearch] = useState("");
  const [actingItem, setActingItem] = useState<RpItem | null>(null);
  const [action, setAction] = useState<"replace" | "refund" | "reject" | null>(null);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const load = async () => {
    if (!isAdmin) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("replacement_items")
      .select(
        "id, request_id, reported_uid, outcome, outcome_reason, in_window, window_hours, created_at, buyer_id, seller_id, account_id",
      )
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) toast.error(error.message);
    setItems((data ?? []) as RpItem[]);
    setLoading(false);
  };

  useEffect(() => {
    load();
    if (!isAdmin) return;
    const ch = supabase
      .channel("admin-replacement-items")
      .on("postgres_changes", { event: "*", schema: "public", table: "replacement_items" }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
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

  const openAction = (item: RpItem, act: "replace" | "refund" | "reject") => {
    setActingItem(item);
    setAction(act);
    setReason("");
  };

  const submit = async () => {
    if (!actingItem || !action) return;
    setSubmitting(true);
    const { error } = await supabase.rpc("admin_resolve_replacement_item", {
      p_item_id: actingItem.id,
      p_action: action,
      p_reason: reason.trim() || null,
    });
    setSubmitting(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`Marked as ${action}`);
    setActingItem(null);
    setAction(null);
    load();
  };

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }
  if (!user) return <Navigate to="/auth" replace />;
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
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-xl">
        <div className="container flex h-16 items-center justify-between">
          <div className="flex items-center gap-4">
            <Link to="/dashboard" className="text-sm text-muted-foreground hover:text-foreground">
              <ArrowLeft className="inline h-4 w-4" /> Dashboard
            </Link>
            <Logo size="sm" showTagline={false} />
            <Badge variant="outline" className="border-primary/40 text-primary">Admin</Badge>
          </div>
          <NotificationsBell />
        </div>
      </header>

      <main className="container py-8">
        <div className="mb-6">
          <h1 className="font-display text-2xl font-bold md:text-3xl">Admin CMS</h1>
          <p className="text-sm text-muted-foreground">
            Manage stock, pricing, categories, seller daily limits, and resolve replacement issues.
          </p>
        </div>

        <Tabs value={section} onValueChange={(v) => setSection(v as typeof section)} className="mb-6">
          <TabsList className="flex w-full flex-wrap justify-start gap-1 sm:w-auto">
            <TabsTrigger value="replacements">Replacements{counts.pending ? ` (${counts.pending})` : ""}</TabsTrigger>
            <TabsTrigger value="stock">Stock</TabsTrigger>
            <TabsTrigger value="categories">Categories & pricing</TabsTrigger>
            <TabsTrigger value="sellers">Seller limits</TabsTrigger>
          </TabsList>
        </Tabs>

        {section === "stock" && <StockOverview />}
        {section === "categories" && <CategoriesManager />}
        {section === "sellers" && <SellerLimitsManager />}

        {section === "replacements" && (
        <>
        <div className="mb-6 grid gap-3 sm:grid-cols-4">
          <Card className="border-border/60 bg-gradient-card p-4">
            <div className="text-xs uppercase tracking-widest text-muted-foreground">Pending</div>
            <div className="mt-1 font-display text-2xl font-bold text-warning">{counts.pending}</div>
          </Card>
          <Card className="border-border/60 bg-gradient-card p-4">
            <div className="text-xs uppercase tracking-widest text-muted-foreground">Replaced</div>
            <div className="mt-1 font-display text-2xl font-bold text-success">{counts.replaced}</div>
          </Card>
          <Card className="border-border/60 bg-gradient-card p-4">
            <div className="text-xs uppercase tracking-widest text-muted-foreground">Refunded</div>
            <div className="mt-1 font-display text-2xl font-bold text-success">{counts.refunded}</div>
          </Card>
          <Card className="border-border/60 bg-gradient-card p-4">
            <div className="text-xs uppercase tracking-widest text-muted-foreground">Rejected</div>
            <div className="mt-1 font-display text-2xl font-bold text-destructive">{counts.rejected}</div>
          </Card>
        </div>

        <Card className="border-border/60 bg-gradient-card p-6">
          <Tabs value={tab} onValueChange={(v) => setTab(v as "pending" | "all")}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <TabsList>
                <TabsTrigger value="pending">Pending ({counts.pending})</TabsTrigger>
                <TabsTrigger value="all">All ({items.length})</TabsTrigger>
              </TabsList>
              <Input
                placeholder="Search UID or request id..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="max-w-xs"
              />
            </div>
            <TabsContent value="pending" className="mt-4" />
            <TabsContent value="all" className="mt-4" />
          </Tabs>

          {loading ? (
            <div className="flex h-32 items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <CheckCheck className="h-10 w-10 text-success" />
              <p className="mt-3 text-sm text-muted-foreground">
                {tab === "pending" ? "No pending requests — all clear!" : "No requests match your search."}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>UID</TableHead>
                    <TableHead>Request</TableHead>
                    <TableHead>Window</TableHead>
                    <TableHead>Outcome</TableHead>
                    <TableHead>Filed</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((it) => (
                    <TableRow key={it.id}>
                      <TableCell className="font-mono text-xs">{it.reported_uid}</TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        #{it.request_id.slice(0, 8)}
                      </TableCell>
                      <TableCell className="text-xs">
                        {it.in_window ? (
                          <Badge className="bg-success/20 text-success hover:bg-success/20">
                            in {it.window_hours}h
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-muted-foreground">
                            out
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge className={outcomeBadgeClass(it.outcome) + " capitalize"}>
                          {it.outcome.replace("_", " ")}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {new Date(it.created_at).toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right">
                        {it.outcome === "pending" ? (
                          <div className="inline-flex gap-1">
                            <Button
                              size="sm"
                              variant="outline"
                              className="border-success/40 text-success hover:text-success"
                              onClick={() => openAction(it, "replace")}
                              disabled={!it.account_id}
                            >
                              <RefreshCcw className="mr-1 h-3 w-3" /> Replace
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => openAction(it, "refund")}
                              disabled={!it.account_id}
                            >
                              <DollarSign className="mr-1 h-3 w-3" /> Refund
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="border-destructive/40 text-destructive hover:text-destructive"
                              onClick={() => openAction(it, "reject")}
                            >
                              <XCircle className="mr-1 h-3 w-3" /> Reject
                            </Button>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">{it.outcome_reason ?? "—"}</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </Card>
        </>
        )}
      </main>

      <Dialog open={!!actingItem} onOpenChange={(o) => !o && setActingItem(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="capitalize">
              {action} replacement
            </DialogTitle>
            <DialogDescription>
              UID <span className="font-mono">{actingItem?.reported_uid}</span> ·
              {action === "replace"
                ? " Issues a fresh available ID from the same category to the buyer."
                : action === "refund"
                ? " Credits the buyer's balance with the original unit price."
                : " Closes without action — buyer will be notified."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <label className="text-sm font-medium">Reason / note (optional)</label>
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Visible to buyer & seller"
              maxLength={500}
            />
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
              Confirm {action}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Admin;