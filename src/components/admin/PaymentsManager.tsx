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
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import {
  Loader2, Check, X, Banknote, Image as ImageIcon, CheckCircle2,
  Search, CalendarIcon, RotateCcw, ChevronLeft, ChevronRight, RefreshCw,
  AlertTriangle, CheckSquare,
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
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const [, setNowTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setNowTick((n) => n + 1), 15_000);
    return () => clearInterval(id);
  }, []);

  // Polling — configurable interval. 0 = off.
  const POLL_KEY = "paymentsManager.pollMs";
  const [pollMs, setPollMs] = useState<number>(() => {
    if (typeof window === "undefined") return 30_000;
    const v = parseInt(window.localStorage.getItem(POLL_KEY) || "", 10);
    return Number.isFinite(v) && v >= 0 ? v : 30_000;
  });
  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(POLL_KEY, String(pollMs));
    }
  }, [pollMs]);

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

  // Bulk selection
  const [selectedTopups, setSelectedTopups] = useState<Set<string>>(new Set());
  const [selectedWithdraws, setSelectedWithdraws] = useState<Set<string>>(new Set());

  // Bulk confirm dialog
  type BulkAction = "approve-topups" | "reject-topups" | "reject-withdraws";
  const [bulkConfirm, setBulkConfirm] = useState<BulkAction | null>(null);
  const [bulkNote, setBulkNote] = useState("");
  const [bulkSubmitting, setBulkSubmitting] = useState(false);

  // Bulk result modal
  type BulkResultRow = {
    id: string;
    ok: boolean;
    user_id?: string;
    amount?: number;
    balance_before?: number;
    balance_after?: number;
    error?: string;
  };
  const [bulkResults, setBulkResults] = useState<{
    action: BulkAction;
    rows: BulkResultRow[];
  } | null>(null);

  // Auto-refresh error tracking
  const [refreshError, setRefreshError] = useState<{
    message: string;
    when: Date;
    source: "tab" | "counts" | "manual";
  } | null>(null);

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

  const loadTab = async (kind: TabKind, opts: { silent?: boolean; source?: "tab" | "manual" } = {}) => {
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
      setLastRefreshed(new Date());
      setRefreshError((prev) => (prev?.source === (opts.source ?? "tab") ? null : prev));
      return true;
    } catch (e: any) {
      const msg = e?.message || "Failed to load payments";
      setRefreshError({ message: msg, when: new Date(), source: opts.source ?? "tab" });
      if (!opts.silent) toast.error(msg);
      else toast.error(`Auto-refresh failed: ${msg}`);
      return false;
    } finally {
      if (!opts.silent) setLoading(false);
    }
  };

  const loadPendingCounts = async (opts: { source?: "counts" | "manual" } = {}) => {
    try {
      const c = await api.get<{ topups: number; withdraws: number }>(
        "/api/admin/payments/pending-counts"
      );
      setPendingCounts(c);
      setRefreshError((prev) => (prev?.source === (opts.source ?? "counts") ? null : prev));
      return true;
    } catch (e: any) {
      const msg = e?.message || "Failed to load pending counts";
      setRefreshError({ message: msg, when: new Date(), source: opts.source ?? "counts" });
      return false;
    }
  };

  const loadAll = () => {
    loadTab(tab, { silent: true });
    loadPendingCounts();
  };

  const refreshNow = async () => {
    if (refreshing) return;
    setRefreshing(true);
    setRefreshError(null);
    try {
      const [a, b] = await Promise.all([
        loadTab(tab, { silent: true, source: "manual" }),
        loadPendingCounts({ source: "manual" }),
      ]);
      if (a && b) {
        toast.success("Refreshed");
        setLastRefreshed(new Date());
      } else {
        toast.error("Refresh failed — see banner");
      }
    } finally {
      setRefreshing(false);
    }
  };

  // Reload when active tab's filters change
  useEffect(() => {
    loadTab("topups");
    setSelectedTopups(new Set());
  }, [topupsFilter]);
  useEffect(() => {
    loadTab("withdraws");
    setSelectedWithdraws(new Set());
  }, [withdrawsFilter]);

  // Pending counts + configurable polling (0 = off)
  useEffect(() => {
    loadPendingCounts();
    if (!pollMs) return;
    const id = setInterval(() => {
      loadTab(tab, { silent: true });
      loadPendingCounts();
      setLastRefreshed(new Date());
    }, pollMs);
    return () => clearInterval(id);
  }, [tab, pollMs]);

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

  const userBalance = (id: string): number | null => {
    const v = userBalances[id];
    return typeof v === "number" ? v : null;
  };

  const fmtBdt = (n: number | null | undefined) =>
    n == null ? "—" : `৳ ${Number(n).toFixed(0)}`;

  // ===== Bulk selection helpers =====
  const isTopupSelectable = (r: Topup) => r.status === "pending";
  const isWithdrawSelectable = (r: Withdraw) =>
    r.status === "pending" || r.status === "approved";

  const toggleTopup = (id: string) =>
    setSelectedTopups((s) => {
      const next = new Set(s);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  const toggleWithdraw = (id: string) =>
    setSelectedWithdraws((s) => {
      const next = new Set(s);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const selectableTopupIds = topups.filter(isTopupSelectable).map((r) => r.id);
  const selectableWithdrawIds = withdraws
    .filter((r) => r.status === "pending") // only pending can be bulk-rejected
    .map((r) => r.id);

  const allTopupsSelected =
    selectableTopupIds.length > 0 &&
    selectableTopupIds.every((id) => selectedTopups.has(id));
  const allWithdrawsSelected =
    selectableWithdrawIds.length > 0 &&
    selectableWithdrawIds.every((id) => selectedWithdraws.has(id));

  const toggleAllTopups = () =>
    setSelectedTopups(allTopupsSelected ? new Set() : new Set(selectableTopupIds));
  const toggleAllWithdraws = () =>
    setSelectedWithdraws(allWithdrawsSelected ? new Set() : new Set(selectableWithdrawIds));

  // Build summary for confirmation dialog
  type BulkSummary = {
    rows: Array<{
      id: string;
      userId: string;
      userLabel: string;
      amount: number;
      balance: number | null;
      projected: number | null;
      method: string;
      warning?: string;
    }>;
    totalAmount: number;
    perUser: Record<string, { label: string; current: number | null; delta: number; after: number | null; insufficient?: boolean }>;
  };

  const buildBulkSummary = (action: BulkAction): BulkSummary => {
    const isApprove = action === "approve-topups";
    const sourceRows = action === "reject-withdraws"
      ? withdraws.filter((r) => selectedWithdraws.has(r.id))
      : topups.filter((r) => selectedTopups.has(r.id));
    const sign = action === "approve-topups" ? 1 : 0; // reject = no balance change
    const rows = sourceRows.map((r: any) => {
      const bal = userBalance(r.user_id);
      const amount = Number(r.amount_bdt);
      const projected = bal == null ? null : bal + sign * amount;
      return {
        id: r.id,
        userId: r.user_id,
        userLabel: userLabel(r.user_id),
        amount,
        balance: bal,
        projected,
        method: r.method,
      };
    });
    // Aggregate per user (multiple selected items per user accumulate)
    const perUser: BulkSummary["perUser"] = {};
    for (const r of rows) {
      const cur = perUser[r.userId] ?? {
        label: r.userLabel,
        current: r.balance,
        delta: 0,
        after: r.balance,
      };
      cur.delta += sign * r.amount;
      cur.after = cur.current == null ? null : cur.current + cur.delta;
      perUser[r.userId] = cur;
    }
    return {
      rows,
      totalAmount: rows.reduce((s, r) => s + r.amount, 0),
      perUser,
    };
  };

  const submitBulk = async () => {
    if (!bulkConfirm) return;
    const ids = bulkConfirm === "reject-withdraws"
      ? Array.from(selectedWithdraws)
      : Array.from(selectedTopups);
    if (ids.length === 0) return;
    setBulkSubmitting(true);
    try {
      const path =
        bulkConfirm === "approve-topups"
          ? "/api/admin/topups/bulk-approve"
          : bulkConfirm === "reject-topups"
            ? "/api/admin/topups/bulk-reject"
            : "/api/admin/withdraws/bulk-reject";
      const body: any = { ids };
      if (bulkConfirm !== "approve-topups") body.note = bulkNote || null;
      const data = await api.post<{ results: BulkResultRow[] }>(path, body);
      const rows = data.results || [];
      const okCount = rows.filter((r) => r.ok).length;
      const failCount = rows.length - okCount;
      if (failCount === 0) toast.success(`${okCount} request${okCount === 1 ? "" : "s"} processed`);
      else if (okCount === 0) toast.error(`All ${failCount} failed`);
      else toast.warning(`${okCount} succeeded, ${failCount} failed`);
      setBulkResults({ action: bulkConfirm, rows });
      setBulkConfirm(null);
      setBulkNote("");
      // Clear selection of items that succeeded
      const okIds = new Set(rows.filter((r) => r.ok).map((r) => r.id));
      if (bulkConfirm === "reject-withdraws") {
        setSelectedWithdraws((s) => new Set(Array.from(s).filter((id) => !okIds.has(id))));
      } else {
        setSelectedTopups((s) => new Set(Array.from(s).filter((id) => !okIds.has(id))));
      }
      // Refresh authoritative state
      loadAll();
    } catch (e: any) {
      toast.error(e?.message || "Bulk action failed");
    } finally {
      setBulkSubmitting(false);
    }
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

  const pollOptions: { label: string; value: number }[] = [
    { label: "Off", value: 0 },
    { label: "10s", value: 10_000 },
    { label: "30s", value: 30_000 },
    { label: "1m", value: 60_000 },
    { label: "5m", value: 300_000 },
  ];
  const fmtRefreshed = (d: Date | null) => {
    if (!d) return "never";
    const s = Math.max(0, Math.floor((Date.now() - d.getTime()) / 1000));
    if (s < 60) return `${s}s ago`;
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    return d.toLocaleTimeString();
  };

  return (
    <Card className="border-border/60 bg-gradient-card p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs text-muted-foreground">
          Last updated: <span className="font-medium text-foreground">{fmtRefreshed(lastRefreshed)}</span>
          {pollMs > 0 && (
            <span className="ml-2 text-muted-foreground/70">
              · auto-refresh every {pollOptions.find((o) => o.value === pollMs)?.label ?? `${pollMs / 1000}s`}
            </span>
          )}
          {pollMs === 0 && (
            <span className="ml-2 text-warning/90">· auto-refresh off</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Select
            value={String(pollMs)}
            onValueChange={(v) => setPollMs(parseInt(v, 10))}
          >
            <SelectTrigger className="h-9 w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {pollOptions.map((o) => (
                <SelectItem key={o.value} value={String(o.value)}>
                  Auto: {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="sm"
            className="h-9"
            onClick={refreshNow}
            disabled={refreshing}
          >
            <RefreshCw className={cn("mr-1 h-3.5 w-3.5", refreshing && "animate-spin")} />
            Refresh now
          </Button>
        </div>
      </div>

      {refreshError && (
        <Alert variant="destructive" className="mb-4">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle className="flex items-center justify-between">
            <span>
              {refreshError.source === "manual"
                ? "Manual refresh failed"
                : refreshError.source === "counts"
                  ? "Pending counts failed to refresh"
                  : "Auto-refresh failed"}
            </span>
            <span className="text-xs font-normal opacity-80">
              {refreshError.when.toLocaleTimeString()}
            </span>
          </AlertTitle>
          <AlertDescription className="flex items-center justify-between gap-3">
            <span className="break-all">{refreshError.message}</span>
            <div className="flex shrink-0 gap-2">
              <Button size="sm" variant="outline" className="h-7" onClick={refreshNow} disabled={refreshing}>
                <RefreshCw className={cn("mr-1 h-3 w-3", refreshing && "animate-spin")} />
                Retry
              </Button>
              <Button size="sm" variant="ghost" className="h-7" onClick={() => setRefreshError(null)}>
                Dismiss
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      )}

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
          {selectedTopups.size > 0 && (
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-md border border-primary/40 bg-primary/10 px-3 py-2 text-sm">
              <div className="flex items-center gap-2">
                <CheckSquare className="h-4 w-4 text-primary" />
                <span><strong>{selectedTopups.size}</strong> top-up{selectedTopups.size === 1 ? "" : "s"} selected</span>
                <span className="text-muted-foreground">
                  · total ৳ {topups.filter((r) => selectedTopups.has(r.id)).reduce((s, r) => s + Number(r.amount_bdt), 0).toFixed(0)}
                </span>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => setBulkConfirm("approve-topups")}>
                  <Check className="mr-1 h-3 w-3" /> Approve all
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setBulkConfirm("reject-topups")}>
                  <X className="mr-1 h-3 w-3" /> Reject all
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setSelectedTopups(new Set())}>Clear</Button>
              </div>
            </div>
          )}
          {loading && tab === "topups" ? (
            <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
          ) : topups.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No top-up requests match these filters.</p>
          ) : (
            <div className="overflow-x-auto"><Table>
              <TableHeader><TableRow>
                <TableHead className="w-8">
                  <Checkbox
                    checked={allTopupsSelected}
                    disabled={selectableTopupIds.length === 0}
                    onCheckedChange={toggleAllTopups}
                    aria-label="Select all pending top-ups"
                  />
                </TableHead>
                <TableHead>When</TableHead><TableHead>User</TableHead><TableHead>Balance</TableHead><TableHead>Method</TableHead><TableHead>Amount</TableHead><TableHead>Sender</TableHead><TableHead>TxnID</TableHead><TableHead>Proof</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Actions</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {topups.map((r) => (
                  <TableRow key={r.id} data-state={selectedTopups.has(r.id) ? "selected" : undefined}>
                    <TableCell>
                      <Checkbox
                        checked={selectedTopups.has(r.id)}
                        disabled={!isTopupSelectable(r)}
                        onCheckedChange={() => toggleTopup(r.id)}
                        aria-label={`Select top-up ${r.txn_id}`}
                      />
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString()}</TableCell>
                    <TableCell className="text-sm">
                      {userLabel(r.user_id)}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {fmtBdt(userBalance(r.user_id))}
                      {r.status === "pending" && userBalance(r.user_id) != null && (
                        <div className="text-[10px] text-success">
                          → {fmtBdt((userBalance(r.user_id) ?? 0) + Number(r.amount_bdt))}
                        </div>
                      )}
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
          {selectedWithdraws.size > 0 && (
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-md border border-primary/40 bg-primary/10 px-3 py-2 text-sm">
              <div className="flex items-center gap-2">
                <CheckSquare className="h-4 w-4 text-primary" />
                <span><strong>{selectedWithdraws.size}</strong> withdraw{selectedWithdraws.size === 1 ? "" : "s"} selected</span>
                <span className="text-muted-foreground">
                  · total ৳ {withdraws.filter((r) => selectedWithdraws.has(r.id)).reduce((s, r) => s + Number(r.amount_bdt), 0).toFixed(0)}
                </span>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="ghost" onClick={() => setBulkConfirm("reject-withdraws")}>
                  <X className="mr-1 h-3 w-3" /> Reject all
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setSelectedWithdraws(new Set())}>Clear</Button>
              </div>
              <div className="basis-full text-[11px] text-muted-foreground">
                Bulk payouts are intentionally disabled — pay each withdraw individually so a unique payout TxnID can be entered.
              </div>
            </div>
          )}
          {loading && tab === "withdraws" ? (
            <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
          ) : withdraws.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No withdraw requests match these filters.</p>
          ) : (
            <div className="overflow-x-auto"><Table>
              <TableHeader><TableRow>
                <TableHead className="w-8">
                  <Checkbox
                    checked={allWithdrawsSelected}
                    disabled={selectableWithdrawIds.length === 0}
                    onCheckedChange={toggleAllWithdraws}
                    aria-label="Select all pending withdraws"
                  />
                </TableHead>
                <TableHead>When</TableHead><TableHead>User</TableHead><TableHead>Balance</TableHead><TableHead>Method</TableHead><TableHead>Amount</TableHead><TableHead>Receiver</TableHead><TableHead>Status</TableHead><TableHead>Payout TxnID</TableHead><TableHead className="text-right">Actions</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {withdraws.map((r) => (
                  <TableRow key={r.id} data-state={selectedWithdraws.has(r.id) ? "selected" : undefined}>
                    <TableCell>
                      <Checkbox
                        checked={selectedWithdraws.has(r.id)}
                        disabled={r.status !== "pending"}
                        onCheckedChange={() => toggleWithdraw(r.id)}
                        aria-label={`Select withdraw ${r.id}`}
                      />
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString()}</TableCell>
                    <TableCell className="text-sm">{userLabel(r.user_id)}</TableCell>
                    <TableCell className="font-mono text-xs">
                      {(() => {
                        const bal = userBalance(r.user_id);
                        const insufficient = bal != null && bal < Number(r.amount_bdt);
                        return (
                          <>
                            <span className={insufficient ? "text-destructive font-semibold" : ""}>
                              {fmtBdt(bal)}
                            </span>
                            {(r.status === "pending" || r.status === "approved") && bal != null && (
                              <div className={`text-[10px] ${insufficient ? "text-destructive" : "text-warning"}`}>
                                → {fmtBdt(bal - Number(r.amount_bdt))}
                              </div>
                            )}
                          </>
                        );
                      })()}
                    </TableCell>
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
            {payTarget && (() => {
              const bal = userBalance(payTarget.user_id);
              const after = bal == null ? null : bal - Number(payTarget.amount_bdt);
              const insufficient = bal != null && bal < Number(payTarget.amount_bdt);
              return (
                <div className={`grid grid-cols-3 gap-2 rounded-md border p-3 text-center ${insufficient ? "border-destructive/40 bg-destructive/10" : "border-border/60 bg-background/40"}`}>
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Balance now</div>
                    <div className="mt-0.5 font-display text-base font-semibold">{fmtBdt(bal)}</div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Debit</div>
                    <div className="mt-0.5 font-display text-base font-semibold text-warning">− ৳ {Number(payTarget.amount_bdt).toFixed(0)}</div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">After</div>
                    <div className={`mt-0.5 font-display text-base font-semibold ${insufficient ? "text-destructive" : "text-primary"}`}>{fmtBdt(after)}</div>
                  </div>
                  {insufficient && (
                    <div className="col-span-3 text-xs text-destructive">
                      Insufficient balance — payout will be rejected by the server.
                    </div>
                  )}
                </div>
              );
            })()}
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
            {rejTarget && (() => {
              const row = rejTarget.kind === "topup"
                ? topups.find((t) => t.id === rejTarget.id)
                : withdraws.find((w) => w.id === rejTarget.id);
              if (!row) return null;
              const bal = userBalance(row.user_id);
              return (
                <div className="rounded-md border border-border/60 bg-background/40 p-3 text-xs">
                  <span className="text-muted-foreground">User: </span>
                  <span className="font-medium">{userLabel(row.user_id)}</span>
                  <span className="mx-2 text-muted-foreground">·</span>
                  <span className="text-muted-foreground">Balance: </span>
                  <span className="font-mono">{fmtBdt(bal)}</span>
                  <span className="mx-2 text-muted-foreground">·</span>
                  <span className="text-muted-foreground">No balance change on reject.</span>
                </div>
              );
            })()}
            <Textarea value={rejNote} onChange={(e) => setRejNote(e.target.value)} placeholder="Reason (sent to user)" rows={3} />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRejOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={submitReject} disabled={busy !== null}>Reject</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Action result modal — shows balance before / after for any action */}
      <Dialog open={!!actionResult} onOpenChange={(o) => !o && setActionResult(null)}>
        <DialogContent>
          {actionResult && (() => {
            const isApprove = actionResult.kind === "approve-topup";
            const isPay = actionResult.kind === "pay-withdraw";
            const isReject = actionResult.kind.startsWith("reject");
            const title = isApprove
              ? "Top-up approved"
              : isPay
                ? "Withdraw paid"
                : actionResult.kind === "reject-topup"
                  ? "Top-up rejected"
                  : "Withdraw rejected";
            const accentClass = isReject
              ? "text-destructive"
              : isPay
                ? "text-warning"
                : "text-success";
            const tileClass = isReject
              ? "border-destructive/30 bg-destructive/10"
              : isPay
                ? "border-warning/30 bg-warning/10"
                : "border-success/30 bg-success/10";
            const amountLabel = isApprove
              ? "Credited"
              : isPay
                ? "Debited"
                : "Unchanged";
            const amountPrefix = isPay ? "−" : isApprove ? "+" : "";
            const before = actionResult.balanceBefore;
            const after = actionResult.balanceAfter;
            const delta =
              typeof before === "number" && typeof after === "number"
                ? after - before
                : null;
            return (
              <>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    {isReject
                      ? <X className={`h-5 w-5 ${accentClass}`} />
                      : <CheckCircle2 className={`h-5 w-5 ${accentClass}`} />}
                    {title}
                  </DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-2 text-sm">
                  <div className={`rounded-lg border p-4 text-center ${tileClass}`}>
                    <div className="text-xs uppercase tracking-widest text-muted-foreground">
                      {amountLabel}
                    </div>
                    <div className={`mt-1 font-display text-3xl font-bold ${accentClass}`}>
                      {amountPrefix} ৳ {actionResult.amount.toFixed(0)}
                    </div>
                  </div>

                  <div className="rounded-lg border border-border/60 bg-background/40 p-4">
                    <div className="mb-2 text-xs uppercase tracking-widest text-muted-foreground">
                      Wallet balance
                    </div>
                    {actionResult.balanceLoading ? (
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span className="text-xs">Fetching balance…</span>
                      </div>
                    ) : actionResult.balanceError ? (
                      <div className="space-y-2">
                        <div className="text-xs text-destructive">
                          Failed: {actionResult.balanceError}
                        </div>
                        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={refreshActionBalance}>
                          Retry
                        </Button>
                      </div>
                    ) : (
                      <div className="grid grid-cols-3 gap-2 text-center">
                        <div>
                          <div className="text-xs text-muted-foreground">Before</div>
                          <div className="mt-1 font-display text-lg font-semibold">
                            {before == null ? "—" : `৳ ${before.toFixed(0)}`}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs text-muted-foreground">Δ Change</div>
                          <div className={`mt-1 font-display text-lg font-semibold ${delta && delta > 0 ? "text-success" : delta && delta < 0 ? "text-destructive" : "text-muted-foreground"}`}>
                            {delta == null
                              ? "—"
                              : delta === 0
                                ? "৳ 0"
                                : `${delta > 0 ? "+" : "−"} ৳ ${Math.abs(delta).toFixed(0)}`}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs text-muted-foreground">After</div>
                          <div className="mt-1 font-display text-lg font-semibold text-primary">
                            {after == null ? "—" : `৳ ${after.toFixed(0)}`}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-md border border-border/60 bg-background/40 p-3">
                      <div className="text-xs text-muted-foreground">User</div>
                      <div className="mt-1 font-medium">{actionResult.userLabel}</div>
                    </div>
                    <div className="rounded-md border border-border/60 bg-background/40 p-3">
                      <div className="text-xs text-muted-foreground">Method</div>
                      <div className="mt-1 font-medium capitalize">{actionResult.method}</div>
                    </div>
                    {actionResult.reference && (
                      <div className="col-span-2 rounded-md border border-border/60 bg-background/40 p-3">
                        <div className="text-xs text-muted-foreground">
                          {isPay ? "Payout TxnID" : "TxnID"}
                        </div>
                        <div className="mt-1 font-mono text-xs break-all">{actionResult.reference}</div>
                      </div>
                    )}
                  </div>
                </div>
                <DialogFooter>
                  <Button onClick={() => setActionResult(null)}>Done</Button>
                </DialogFooter>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* Bulk action confirmation */}
      <Dialog open={!!bulkConfirm} onOpenChange={(o) => { if (!o) { setBulkConfirm(null); setBulkNote(""); } }}>
        <DialogContent className="max-w-2xl">
          {bulkConfirm && (() => {
            const summary = buildBulkSummary(bulkConfirm);
            const isApprove = bulkConfirm === "approve-topups";
            const title = isApprove
              ? "Approve top-ups in bulk"
              : bulkConfirm === "reject-topups"
                ? "Reject top-ups in bulk"
                : "Reject withdraws in bulk";
            const usersList = Object.entries(summary.perUser);
            return (
              <>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    {isApprove
                      ? <Check className="h-5 w-5 text-success" />
                      : <X className="h-5 w-5 text-destructive" />}
                    {title}
                  </DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-2 text-sm">
                  <div className="grid grid-cols-3 gap-2">
                    <div className="rounded-md border border-border/60 bg-background/40 p-3 text-center">
                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Requests</div>
                      <div className="mt-0.5 font-display text-xl font-semibold">{summary.rows.length}</div>
                    </div>
                    <div className="rounded-md border border-border/60 bg-background/40 p-3 text-center">
                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Total amount</div>
                      <div className={`mt-0.5 font-display text-xl font-semibold ${isApprove ? "text-success" : "text-muted-foreground"}`}>
                        ৳ {summary.totalAmount.toFixed(0)}
                      </div>
                    </div>
                    <div className="rounded-md border border-border/60 bg-background/40 p-3 text-center">
                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Affected users</div>
                      <div className="mt-0.5 font-display text-xl font-semibold">{usersList.length}</div>
                    </div>
                  </div>

                  <div>
                    <div className="mb-2 text-xs uppercase tracking-widest text-muted-foreground">
                      Per-user balance preview
                    </div>
                    <div className="max-h-[240px] overflow-y-auto rounded-md border border-border/60">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>User</TableHead>
                            <TableHead className="text-right">Before</TableHead>
                            <TableHead className="text-right">Δ</TableHead>
                            <TableHead className="text-right">After</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {usersList.map(([uid, u]) => (
                            <TableRow key={uid}>
                              <TableCell className="text-sm">{u.label}</TableCell>
                              <TableCell className="text-right font-mono text-xs">{fmtBdt(u.current)}</TableCell>
                              <TableCell className={`text-right font-mono text-xs ${u.delta > 0 ? "text-success" : u.delta < 0 ? "text-destructive" : "text-muted-foreground"}`}>
                                {u.delta === 0 ? "৳ 0" : `${u.delta > 0 ? "+" : "−"} ৳ ${Math.abs(u.delta).toFixed(0)}`}
                              </TableCell>
                              <TableCell className="text-right font-mono text-xs text-primary">
                                {fmtBdt(u.after)}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                    {!isApprove && (
                      <p className="mt-2 text-[11px] text-muted-foreground">
                        Rejecting does not change wallet balances.
                      </p>
                    )}
                  </div>

                  {!isApprove && (
                    <div>
                      <label className="text-xs text-muted-foreground">Reason (sent to all selected users)</label>
                      <Textarea
                        value={bulkNote}
                        onChange={(e) => setBulkNote(e.target.value)}
                        rows={2}
                        placeholder="e.g. Invalid TxnID — please re-submit"
                      />
                    </div>
                  )}
                </div>
                <DialogFooter>
                  <Button variant="ghost" onClick={() => setBulkConfirm(null)} disabled={bulkSubmitting}>Cancel</Button>
                  <Button
                    variant={isApprove ? "default" : "destructive"}
                    onClick={submitBulk}
                    disabled={bulkSubmitting || summary.rows.length === 0}
                  >
                    {bulkSubmitting && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
                    {isApprove
                      ? `Approve ${summary.rows.length} top-up${summary.rows.length === 1 ? "" : "s"}`
                      : `Reject ${summary.rows.length}`}
                  </Button>
                </DialogFooter>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* Bulk result modal */}
      <Dialog open={!!bulkResults} onOpenChange={(o) => !o && setBulkResults(null)}>
        <DialogContent className="max-w-2xl">
          {bulkResults && (() => {
            const okRows = bulkResults.rows.filter((r) => r.ok);
            const failRows = bulkResults.rows.filter((r) => !r.ok);
            const totalAmt = okRows.reduce((s, r) => s + (r.amount || 0), 0);
            const isApprove = bulkResults.action === "approve-topups";
            return (
              <>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    {failRows.length === 0
                      ? <CheckCircle2 className="h-5 w-5 text-success" />
                      : okRows.length === 0
                        ? <X className="h-5 w-5 text-destructive" />
                        : <AlertTriangle className="h-5 w-5 text-warning" />}
                    Bulk action complete
                  </DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-2 text-sm">
                  <div className="grid grid-cols-3 gap-2">
                    <div className="rounded-md border border-success/30 bg-success/10 p-3 text-center">
                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Succeeded</div>
                      <div className="mt-0.5 font-display text-xl font-semibold text-success">{okRows.length}</div>
                    </div>
                    <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-center">
                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Failed</div>
                      <div className="mt-0.5 font-display text-xl font-semibold text-destructive">{failRows.length}</div>
                    </div>
                    <div className="rounded-md border border-border/60 bg-background/40 p-3 text-center">
                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{isApprove ? "Total credited" : "Total amount"}</div>
                      <div className={`mt-0.5 font-display text-xl font-semibold ${isApprove ? "text-success" : "text-muted-foreground"}`}>
                        ৳ {totalAmt.toFixed(0)}
                      </div>
                    </div>
                  </div>

                  <div className="max-h-[260px] overflow-y-auto rounded-md border border-border/60">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>User</TableHead>
                          <TableHead className="text-right">Amount</TableHead>
                          <TableHead className="text-right">Before</TableHead>
                          <TableHead className="text-right">After</TableHead>
                          <TableHead>Result</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {bulkResults.rows.map((r) => (
                          <TableRow key={r.id}>
                            <TableCell className="text-xs">
                              {r.user_id ? userLabel(r.user_id) : <span className="text-muted-foreground">—</span>}
                            </TableCell>
                            <TableCell className="text-right font-mono text-xs">{fmtBdt(r.amount)}</TableCell>
                            <TableCell className="text-right font-mono text-xs">{fmtBdt(r.balance_before)}</TableCell>
                            <TableCell className="text-right font-mono text-xs text-primary">{fmtBdt(r.balance_after)}</TableCell>
                            <TableCell>
                              {r.ok
                                ? <Badge className="bg-success/20 text-success hover:bg-success/20">ok</Badge>
                                : <Badge className="bg-destructive/20 text-destructive hover:bg-destructive/20">{r.error || "failed"}</Badge>}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
                <DialogFooter>
                  <Button onClick={() => setBulkResults(null)}>Done</Button>
                </DialogFooter>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>
    </Card>
  );
};