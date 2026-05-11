import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import {
  Loader2, Check, X, Banknote, Image as ImageIcon, CheckCircle2,
  Search, CalendarIcon, RotateCcw, ChevronLeft, ChevronRight,
} from "lucide-react";
import { toast } from "sonner";

interface Topup {
  id: string; user_id: string; amount_bdt: number; method: string;
  sender_number: string; txn_id: string; note: string | null;
  status: string; admin_note: string | null; created_at: string;
  screenshot_url: string | null; source: string | null;
  user_balance_bdt?: number | string | null;
}
interface Withdraw {
  id: string; user_id: string; amount_bdt: number; method: string;
  receiver_number: string; note: string | null; status: string;
  admin_note: string | null; payout_txn_id: string | null; created_at: string;
  user_balance_bdt?: number | string | null;
}

const statusBadge = (s: string) => {
  const cls = s === "approved" || s === "paid" ? "bg-success/20 text-success"
    : s === "rejected" ? "bg-destructive/20 text-destructive"
    : "bg-warning/20 text-warning";
  return <Badge className={`${cls} hover:${cls}`}>{s}</Badge>;
};

export const PaymentsManager = () => {
  type TabKind = "topups" | "withdraws";
  const [tab, setTab] = useState<TabKind>("topups");
  const [topups, setTopups] = useState<Topup[]>([]);
  const [withdraws, setWithdraws] = useState<Withdraw[]>([]);
  const [topupsTotal, setTopupsTotal] = useState(0);
  const [withdrawsTotal, setWithdrawsTotal] = useState(0);
  const [pendingCounts, setPendingCounts] = useState({ topups: 0, withdraws: 0 });
  const [profiles, setProfiles] = useState<Record<string, { display_name: string | null; email: string | null }>>({});
  const [userBalances, setUserBalances] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  // Filters per tab
  type Filter = {
    q: string;
    status: string; // "" = all
    from?: Date;
    to?: Date;
    page: number;
    pageSize: number;
  };
  const defaultFilter = (): Filter => ({ q: "", status: "all", page: 1, pageSize: 25 });
  const [topupsFilter, setTopupsFilter] = useState<Filter>(defaultFilter());
  const [withdrawsFilter, setWithdrawsFilter] = useState<Filter>(defaultFilter());
  const [topupsSearchInput, setTopupsSearchInput] = useState("");
  const [withdrawsSearchInput, setWithdrawsSearchInput] = useState("");

  // Pay dialog
  const [payOpen, setPayOpen] = useState(false);
  const [payTarget, setPayTarget] = useState<Withdraw | null>(null);
  const [payTxn, setPayTxn] = useState("");
  const [payNote, setPayNote] = useState("");

  // Reject dialog
  const [rejOpen, setRejOpen] = useState(false);
  const [rejTarget, setRejTarget] = useState<{ kind: "topup" | "withdraw"; id: string } | null>(null);
  const [rejNote, setRejNote] = useState("");

  // Generic action-result confirmation modal (approve / reject / pay)
  type ActionKind = "approve-topup" | "reject-topup" | "pay-withdraw" | "reject-withdraw";
  type ActionResult = {
    kind: ActionKind;
    userLabel: string;
    userId: string;
    method: string;
    reference: string; // txnId or payout txn
    amount: number;
    balanceBefore: number | null;
    balanceAfter: number | null;
    balanceError: string | null;
    balanceLoading: boolean;
  };
  const [actionResult, setActionResult] = useState<ActionResult | null>(null);

  const buildQuery = (kind: TabKind, f: Filter) => {
    const q: Record<string, any> = {
      kind,
      page: f.page,
      page_size: f.pageSize,
    };
    if (f.q.trim()) q.q = f.q.trim();
    if (f.status && f.status !== "all") q.status = f.status;
    if (f.from) q.from = f.from.toISOString();
    if (f.to) {
      // Include the entire "to" day (end of day)
      const end = new Date(f.to);
      end.setHours(23, 59, 59, 999);
      q.to = end.toISOString();
    }
    return q;
  };

  const mergeProfiles = (rows: any[]) => {
    setProfiles((prev) => {
      const next = { ...prev };
      rows.forEach((r: any) => {
        if (r.user_id) {
          next[r.user_id] = {
            display_name: r.display_name ?? next[r.user_id]?.display_name ?? null,
            email: r.user_email ?? r.email ?? next[r.user_id]?.email ?? null,
          };
        }
      });
      return next;
    });
    setUserBalances((prev) => {
      const next = { ...prev };
      rows.forEach((r: any) => {
        if (r.user_id && r.user_balance_bdt != null) {
          next[r.user_id] = Number(r.user_balance_bdt);
        }
      });
      return next;
    });
  };

  const loadTab = async (kind: TabKind, opts: { silent?: boolean } = {}) => {
    if (!opts.silent) setLoading(true);
    try {
      const f = kind === "topups" ? topupsFilter : withdrawsFilter;
      const data = await api.get<{ rows: any[]; total: number }>(
        "/api/admin/payments",
        buildQuery(kind, f)
      );
      const rows = data.rows ?? [];
      mergeProfiles(rows);
      if (kind === "topups") {
        setTopups(rows as Topup[]);
        setTopupsTotal(data.total ?? rows.length);
      } else {
        setWithdraws(rows as Withdraw[]);
        setWithdrawsTotal(data.total ?? rows.length);
      }
    } catch (e: any) {
      toast.error(e?.message || "Failed to load payments");
    } finally {
      if (!opts.silent) setLoading(false);
    }
  };

  const loadPendingCounts = async () => {
    try {
      const c = await api.get<{ topups: number; withdraws: number }>(
        "/api/admin/payments/pending-counts"
      );
      setPendingCounts(c);
    } catch {
      /* ignore */
    }
  };

  const loadAll = () => {
    loadTab(tab, { silent: true });
    loadPendingCounts();
  };

  // Reload when active tab's filters change
  useEffect(() => {
    loadTab("topups");
  }, [topupsFilter]);
  useEffect(() => {
    loadTab("withdraws");
  }, [withdrawsFilter]);

  // Pending counts + 30s polling
  useEffect(() => {
    loadPendingCounts();
    const id = setInterval(() => {
      loadTab(tab, { silent: true });
      loadPendingCounts();
    }, 30_000);
    return () => clearInterval(id);
  }, [tab]);

  // Debounce search inputs
  const topupsSearchTimer = useRef<number | null>(null);
  useEffect(() => {
    if (topupsSearchTimer.current) window.clearTimeout(topupsSearchTimer.current);
    topupsSearchTimer.current = window.setTimeout(() => {
      setTopupsFilter((f) => (f.q === topupsSearchInput ? f : { ...f, q: topupsSearchInput, page: 1 }));
    }, 300);
    return () => { if (topupsSearchTimer.current) window.clearTimeout(topupsSearchTimer.current); };
  }, [topupsSearchInput]);
  const withdrawsSearchTimer = useRef<number | null>(null);
  useEffect(() => {
    if (withdrawsSearchTimer.current) window.clearTimeout(withdrawsSearchTimer.current);
    withdrawsSearchTimer.current = window.setTimeout(() => {
      setWithdrawsFilter((f) => (f.q === withdrawsSearchInput ? f : { ...f, q: withdrawsSearchInput, page: 1 }));
    }, 300);
    return () => { if (withdrawsSearchTimer.current) window.clearTimeout(withdrawsSearchTimer.current); };
  }, [withdrawsSearchInput]);

  const fetchBalanceWithRetry = async (
    userId: string,
    attempts = 3,
  ): Promise<{ balance: number | null; error: string | null }> => {
    let lastErr: string | null = null;
    for (let i = 0; i < attempts; i++) {
      try {
        const data = await api.get<{ users: any[] }>("/api/admin/users/search", { q: userId });
        const u = (data.users || []).find((x: any) => x.user_id === userId);
        if (u) return { balance: Number(u.balance_bdt), error: null };
        lastErr = "Profile not found";
      } catch (e: any) {
        lastErr = e?.message || "Unknown error";
      }
      if (i < attempts - 1) {
        await new Promise((r) => setTimeout(r, 300 + i * 400 + i * i * 200));
      }
    }
    return { balance: null, error: lastErr ?? "Unknown error" };
  };

  type ApiActionResp = {
    ok?: true;
    balance_before?: number;
    balance_after?: number;
    new_balance?: number;
    amount?: number;
  };

  const refreshActionBalance = async () => {
    if (!actionResult) return;
    setActionResult({ ...actionResult, balanceLoading: true, balanceError: null });
    const res = await fetchBalanceWithRetry(actionResult.userId, 3);
    setActionResult((prev) =>
      prev
        ? {
            ...prev,
            balanceLoading: false,
            balanceAfter: res.balance,
            balanceError: res.error,
          }
        : prev,
    );
  };

  const openActionResultFromResponse = (
    base: Omit<ActionResult, "balanceBefore" | "balanceAfter" | "balanceError" | "balanceLoading">,
    resp: ApiActionResp,
  ) => {
    const before = typeof resp.balance_before === "number" ? resp.balance_before : null;
    const after =
      typeof resp.balance_after === "number"
        ? resp.balance_after
        : typeof resp.new_balance === "number"
          ? resp.new_balance
          : null;
    const needsFetch = after === null;
    setActionResult({
      ...base,
      balanceBefore: before,
      balanceAfter: after,
      balanceError: null,
      balanceLoading: needsFetch,
    });
    if (needsFetch) {
      fetchBalanceWithRetry(base.userId, 3).then((res) => {
        setActionResult((prev) =>
          prev
            ? {
                ...prev,
                balanceAfter: res.balance,
                balanceError: res.error,
                balanceLoading: false,
              }
            : prev,
        );
        if (res.error) toast.error(`Action ok, but balance fetch failed: ${res.error}`);
      });
    }
    if (typeof after === "number") {
      setUserBalances((prev) => ({ ...prev, [base.userId]: after }));
    }
  };

  const approveTopup = async (id: string) => {
    const row = topups.find((t) => t.id === id);
    if (!row) return;
    setBusy(id);
    try {
      const resp = await api.post<ApiActionResp>(`/api/admin/topups/${id}/approve`);
      openActionResultFromResponse({
        kind: "approve-topup",
        userLabel: userLabel(row.user_id),
        userId: row.user_id,
        method: row.method,
        reference: row.txn_id,
        amount: Number(row.amount_bdt),
      }, resp);
      loadAll();
    } catch (e: any) {
      toast.error(e?.message || "Failed");
    } finally {
      setBusy(null);
    }
  };

  const openReject = (kind: "topup" | "withdraw", id: string) => {
    setRejTarget({ kind, id }); setRejNote(""); setRejOpen(true);
  };

  const submitReject = async () => {
    if (!rejTarget) return;
    setBusy(rejTarget.id);
    try {
      const isTopup = rejTarget.kind === "topup";
      const path = isTopup
        ? `/api/admin/topups/${rejTarget.id}/reject`
        : `/api/admin/withdraws/${rejTarget.id}/reject`;
      const resp = await api.post<ApiActionResp>(path, { note: rejNote || null });
      const row = isTopup
        ? topups.find((t) => t.id === rejTarget.id)
        : withdraws.find((w) => w.id === rejTarget.id);
      setRejOpen(false);
      if (row) {
        openActionResultFromResponse({
          kind: isTopup ? "reject-topup" : "reject-withdraw",
          userLabel: userLabel(row.user_id),
          userId: row.user_id,
          method: row.method,
          reference: isTopup ? (row as Topup).txn_id : ((row as Withdraw).payout_txn_id || ""),
          amount: Number(row.amount_bdt),
        }, resp);
      } else {
        toast.success("Rejected");
      }
      loadAll();
    } catch (e: any) {
      toast.error(e?.message || "Failed");
    } finally {
      setBusy(null);
    }
  };

  const openPay = (w: Withdraw) => {
    setPayTarget(w); setPayTxn(""); setPayNote(""); setPayOpen(true);
  };

  const submitPay = async () => {
    if (!payTarget) return;
    if (payTxn.trim().length < 3) return toast.error("Enter payout TxnID");
    setBusy(payTarget.id);
    try {
      const resp = await api.post<ApiActionResp>(`/api/admin/withdraws/${payTarget.id}/pay`, {
        payout_txn_id: payTxn,
        note: payNote || null,
      });
      const w = payTarget;
      setPayOpen(false);
      openActionResultFromResponse({
        kind: "pay-withdraw",
        userLabel: userLabel(w.user_id),
        userId: w.user_id,
        method: w.method,
        reference: payTxn,
        amount: Number(w.amount_bdt),
      }, resp);
      loadAll();
    } catch (e: any) {
      toast.error(e?.message || "Failed");
    } finally {
      setBusy(null);
    }
  };

  const userLabel = (id: string) => {
    const p = profiles[id];
    return p?.display_name || p?.email || id.slice(0, 8);
  };

  const pendingTopups = pendingCounts.topups;
  const pendingWds = pendingCounts.withdraws;

  const renderFilters = (
    kind: TabKind,
    filter: Filter,
    setFilter: (updater: (f: Filter) => Filter) => void,
    searchInput: string,
    setSearchInput: (v: string) => void,
    resetSearchInput: () => void,
  ) => {
    const statusOptions = kind === "topups"
      ? ["all", "pending", "approved", "rejected"]
      : ["all", "pending", "approved", "paid", "rejected"];
    return (
      <div className="mb-4 flex flex-wrap items-end gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder={kind === "topups"
              ? "Search user, email, TxnID, sender…"
              : "Search user, email, payout TxnID, receiver…"}
            className="h-9 pl-7"
          />
        </div>

        <Select
          value={filter.status || "all"}
          onValueChange={(v) => setFilter((f) => ({ ...f, status: v, page: 1 }))}
        >
          <SelectTrigger className="h-9 w-[140px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            {statusOptions.map((s) => (
              <SelectItem key={s} value={s} className="capitalize">
                {s === "all" ? "All statuses" : s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className={cn(
                "h-9 w-[150px] justify-start text-left font-normal",
                !filter.from && "text-muted-foreground"
              )}
            >
              <CalendarIcon className="mr-2 h-3.5 w-3.5" />
              {filter.from ? format(filter.from, "MMM d, yyyy") : "From"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={filter.from}
              onSelect={(d) => setFilter((f) => ({ ...f, from: d, page: 1 }))}
              initialFocus
              className={cn("p-3 pointer-events-auto")}
            />
          </PopoverContent>
        </Popover>

        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className={cn(
                "h-9 w-[150px] justify-start text-left font-normal",
                !filter.to && "text-muted-foreground"
              )}
            >
              <CalendarIcon className="mr-2 h-3.5 w-3.5" />
              {filter.to ? format(filter.to, "MMM d, yyyy") : "To"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={filter.to}
              onSelect={(d) => setFilter((f) => ({ ...f, to: d, page: 1 }))}
              initialFocus
              className={cn("p-3 pointer-events-auto")}
            />
          </PopoverContent>
        </Popover>

        <Select
          value={String(filter.pageSize)}
          onValueChange={(v) => setFilter((f) => ({ ...f, pageSize: parseInt(v, 10), page: 1 }))}
        >
          <SelectTrigger className="h-9 w-[110px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {[10, 25, 50, 100].map((n) => (
              <SelectItem key={n} value={String(n)}>{n} / page</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {(filter.q || (filter.status && filter.status !== "all") || filter.from || filter.to) && (
          <Button
            variant="ghost"
            size="sm"
            className="h-9"
            onClick={() => {
              resetSearchInput();
              setFilter(() => defaultFilter());
            }}
          >
            <RotateCcw className="mr-1 h-3 w-3" /> Reset
          </Button>
        )}
      </div>
    );
  };

  const renderPagination = (
    filter: Filter,
    setFilter: (updater: (f: Filter) => Filter) => void,
    total: number,
    rowsLen: number,
  ) => {
    const totalPages = Math.max(1, Math.ceil(total / filter.pageSize));
    const start = total === 0 ? 0 : (filter.page - 1) * filter.pageSize + 1;
    const end = (filter.page - 1) * filter.pageSize + rowsLen;
    return (
      <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
        <div>
          {total === 0 ? "No results" : `Showing ${start}–${end} of ${total}`}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-8"
            disabled={filter.page <= 1 || loading}
            onClick={() => setFilter((f) => ({ ...f, page: Math.max(1, f.page - 1) }))}
          >
            <ChevronLeft className="h-3 w-3" />
          </Button>
          <span className="tabular-nums">Page {filter.page} / {totalPages}</span>
          <Button
            variant="outline"
            size="sm"
            className="h-8"
            disabled={filter.page >= totalPages || loading}
            onClick={() => setFilter((f) => ({ ...f, page: Math.min(totalPages, f.page + 1) }))}
          >
            <ChevronRight className="h-3 w-3" />
          </Button>
        </div>
      </div>
    );
  };

  return (
    <Card className="border-border/60 bg-gradient-card p-6">
      <Tabs value={tab} onValueChange={(v) => setTab(v as TabKind)}>
        <TabsList>
          <TabsTrigger value="topups">Top-ups {pendingTopups > 0 && <Badge className="ml-2 bg-warning/20 text-warning hover:bg-warning/20">{pendingTopups}</Badge>}</TabsTrigger>
          <TabsTrigger value="withdraws">Withdraws {pendingWds > 0 && <Badge className="ml-2 bg-warning/20 text-warning hover:bg-warning/20">{pendingWds}</Badge>}</TabsTrigger>
        </TabsList>

        <TabsContent value="topups" className="mt-4">
          {renderFilters(
            "topups",
            topupsFilter,
            (u) => setTopupsFilter((f) => u(f)),
            topupsSearchInput,
            setTopupsSearchInput,
            () => setTopupsSearchInput(""),
          )}
          {loading && tab === "topups" ? (
            <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
          ) : topups.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No top-up requests match these filters.</p>
          ) : (
            <div className="overflow-x-auto"><Table>
              <TableHeader><TableRow><TableHead>When</TableHead><TableHead>User</TableHead><TableHead>Method</TableHead><TableHead>Amount</TableHead><TableHead>Sender</TableHead><TableHead>TxnID</TableHead><TableHead>Proof</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
              <TableBody>
                {topups.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString()}</TableCell>
                    <TableCell className="text-sm">
                      {userLabel(r.user_id)}
                    </TableCell>
                    <TableCell>{r.method}</TableCell>
                    <TableCell className="font-semibold">৳ {Number(r.amount_bdt).toFixed(0)}</TableCell>
                    <TableCell className="font-mono text-xs">{r.sender_number}</TableCell>
                    <TableCell className="font-mono text-xs">{r.txn_id}</TableCell>
                    <TableCell>
                      {r.screenshot_url ? (
                        <a href={r.screenshot_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                          <ImageIcon className="h-3 w-3" /> View
                        </a>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>{statusBadge(r.status)}</TableCell>
                    <TableCell className="text-right">
                      {r.status === "pending" && (
                        <div className="flex justify-end gap-2">
                          <Button size="sm" variant="outline" disabled={busy === r.id} onClick={() => approveTopup(r.id)}>
                            <Check className="mr-1 h-3 w-3" /> Approve
                          </Button>
                          <Button size="sm" variant="ghost" disabled={busy === r.id} onClick={() => openReject("topup", r.id)}>
                            <X className="mr-1 h-3 w-3" /> Reject
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table></div>
          )}
          {renderPagination(topupsFilter, (u) => setTopupsFilter((f) => u(f)), topupsTotal, topups.length)}
        </TabsContent>

        <TabsContent value="withdraws" className="mt-4">
          {renderFilters(
            "withdraws",
            withdrawsFilter,
            (u) => setWithdrawsFilter((f) => u(f)),
            withdrawsSearchInput,
            setWithdrawsSearchInput,
            () => setWithdrawsSearchInput(""),
          )}
          {loading && tab === "withdraws" ? (
            <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
          ) : withdraws.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No withdraw requests match these filters.</p>
          ) : (
            <div className="overflow-x-auto"><Table>
              <TableHeader><TableRow><TableHead>When</TableHead><TableHead>User</TableHead><TableHead>Method</TableHead><TableHead>Amount</TableHead><TableHead>Receiver</TableHead><TableHead>Status</TableHead><TableHead>Payout TxnID</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
              <TableBody>
                {withdraws.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString()}</TableCell>
                    <TableCell className="text-sm">{userLabel(r.user_id)}</TableCell>
                    <TableCell>{r.method}</TableCell>
                    <TableCell className="font-semibold">৳ {Number(r.amount_bdt).toFixed(0)}</TableCell>
                    <TableCell className="font-mono text-xs">{r.receiver_number}</TableCell>
                    <TableCell>{statusBadge(r.status)}</TableCell>
                    <TableCell className="font-mono text-xs">{r.payout_txn_id ?? "—"}</TableCell>
                    <TableCell className="text-right">
                      {(r.status === "pending" || r.status === "approved") && (
                        <div className="flex justify-end gap-2">
                          <Button size="sm" variant="outline" disabled={busy === r.id} onClick={() => openPay(r)}>
                            <Banknote className="mr-1 h-3 w-3" /> Mark paid
                          </Button>
                          <Button size="sm" variant="ghost" disabled={busy === r.id} onClick={() => openReject("withdraw", r.id)}>
                            <X className="mr-1 h-3 w-3" /> Reject
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table></div>
          )}
          {renderPagination(withdrawsFilter, (u) => setWithdrawsFilter((f) => u(f)), withdrawsTotal, withdraws.length)}
        </TabsContent>
      </Tabs>

      {/* Pay dialog */}
      <Dialog open={payOpen} onOpenChange={setPayOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Mark withdraw as paid</DialogTitle></DialogHeader>
          <div className="space-y-3 text-sm">
            <div>To: <span className="font-mono">{payTarget?.receiver_number}</span> · {payTarget?.method} · ৳ {Number(payTarget?.amount_bdt ?? 0).toFixed(2)}</div>
            <div>
              <label className="text-xs text-muted-foreground">Payout TxnID *</label>
              <Input value={payTxn} onChange={(e) => setPayTxn(e.target.value)} placeholder="9A1B2C3D4E" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Note</label>
              <Textarea value={payNote} onChange={(e) => setPayNote(e.target.value)} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPayOpen(false)}>Cancel</Button>
            <Button onClick={submitPay} disabled={busy !== null}>Confirm payment</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject dialog */}
      <Dialog open={rejOpen} onOpenChange={setRejOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Reject request</DialogTitle></DialogHeader>
          <div className="space-y-3 text-sm">
            <Textarea value={rejNote} onChange={(e) => setRejNote(e.target.value)} placeholder="Reason (sent to user)" rows={3} />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRejOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={submitReject} disabled={busy !== null}>Reject</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Approve confirmation modal */}
      <Dialog open={!!approvedInfo} onOpenChange={(o) => !o && setApprovedInfo(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-success" /> Top-up approved
            </DialogTitle>
          </DialogHeader>
          {approvedInfo && (
            <div className="space-y-4 py-2 text-sm">
              <div className="rounded-lg border border-success/30 bg-success/10 p-4 text-center">
                <div className="text-xs uppercase tracking-widest text-muted-foreground">
                  Credited
                </div>
                <div className="mt-1 font-display text-3xl font-bold text-success">
                  ৳ {approvedInfo.amount.toFixed(0)}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-md border border-border/60 bg-background/40 p-3">
                  <div className="text-xs text-muted-foreground">User</div>
                  <div className="mt-1 font-medium">{approvedInfo.userLabel}</div>
                </div>
                <div className="rounded-md border border-border/60 bg-background/40 p-3">
                  <div className="text-xs text-muted-foreground">New balance</div>
                  {approvedInfo.balanceLoading ? (
                    <div className="mt-1 flex items-center gap-2 text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span className="text-xs">Fetching…</span>
                    </div>
                  ) : approvedInfo.balanceError ? (
                    <div className="mt-1 space-y-1">
                      <div className="text-xs text-destructive">
                        Failed: {approvedInfo.balanceError}
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs"
                        onClick={refreshApprovedBalance}
                      >
                        Retry
                      </Button>
                    </div>
                  ) : approvedInfo.newBalance === null ? (
                    <div className="mt-1 text-muted-foreground">—</div>
                  ) : (
                    <div className="mt-1 font-display text-lg font-semibold text-primary">
                      ৳ {approvedInfo.newBalance.toFixed(0)}
                    </div>
                  )}
                </div>
                <div className="rounded-md border border-border/60 bg-background/40 p-3">
                  <div className="text-xs text-muted-foreground">Method</div>
                  <div className="mt-1 font-medium capitalize">{approvedInfo.method}</div>
                </div>
                <div className="rounded-md border border-border/60 bg-background/40 p-3">
                  <div className="text-xs text-muted-foreground">TxnID</div>
                  <div className="mt-1 font-mono text-xs break-all">{approvedInfo.txnId}</div>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setApprovedInfo(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
};