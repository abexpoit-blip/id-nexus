import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, Check, X, Banknote, Image as ImageIcon, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

interface Topup {
  id: string; user_id: string; amount_bdt: number; method: string;
  sender_number: string; txn_id: string; note: string | null;
  status: string; admin_note: string | null; created_at: string;
  screenshot_url: string | null; source: string | null;
}
interface Withdraw {
  id: string; user_id: string; amount_bdt: number; method: string;
  receiver_number: string; note: string | null; status: string;
  admin_note: string | null; payout_txn_id: string | null; created_at: string;
}

const statusBadge = (s: string) => {
  const cls = s === "approved" || s === "paid" ? "bg-success/20 text-success"
    : s === "rejected" ? "bg-destructive/20 text-destructive"
    : "bg-warning/20 text-warning";
  return <Badge className={`${cls} hover:${cls}`}>{s}</Badge>;
};

export const PaymentsManager = () => {
  const [topups, setTopups] = useState<Topup[]>([]);
  const [withdraws, setWithdraws] = useState<Withdraw[]>([]);
  const [profiles, setProfiles] = useState<Record<string, { display_name: string | null; email: string | null }>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  // Pay dialog
  const [payOpen, setPayOpen] = useState(false);
  const [payTarget, setPayTarget] = useState<Withdraw | null>(null);
  const [payTxn, setPayTxn] = useState("");
  const [payNote, setPayNote] = useState("");

  // Reject dialog
  const [rejOpen, setRejOpen] = useState(false);
  const [rejTarget, setRejTarget] = useState<{ kind: "topup" | "withdraw"; id: string } | null>(null);
  const [rejNote, setRejNote] = useState("");

  // Approve confirmation modal
  const [approvedInfo, setApprovedInfo] = useState<{
    userLabel: string;
    method: string;
    txnId: string;
    amount: number;
    newBalance: number | null;
    balanceError: string | null;
    balanceLoading: boolean;
    userId: string;
  } | null>(null);

  const loadAll = async () => {
    setLoading(true);
    const [{ data: tp }, { data: wd }] = await Promise.all([
      supabase.from("topup_requests").select("*").order("created_at", { ascending: false }).limit(200),
      supabase.from("withdraw_requests").select("*").order("created_at", { ascending: false }).limit(200),
    ]);
    setTopups((tp ?? []) as Topup[]);
    setWithdraws((wd ?? []) as Withdraw[]);
    const ids = Array.from(new Set([...(tp ?? []).map((r: any) => r.user_id), ...(wd ?? []).map((r: any) => r.user_id)]));
    if (ids.length > 0) {
      const { data: profs } = await supabase.from("profiles").select("id, display_name, email").in("id", ids);
      const map: Record<string, any> = {};
      (profs ?? []).forEach((p: any) => { map[p.id] = { display_name: p.display_name, email: p.email }; });
      setProfiles(map);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadAll();
    const ch = supabase.channel("admin-payments")
      .on("postgres_changes", { event: "*", schema: "public", table: "topup_requests" }, loadAll)
      .on("postgres_changes", { event: "*", schema: "public", table: "withdraw_requests" }, loadAll)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const fetchBalanceWithRetry = async (
    userId: string,
    attempts = 3,
  ): Promise<{ balance: number | null; error: string | null }> => {
    let lastErr: string | null = null;
    for (let i = 0; i < attempts; i++) {
      const { data, error } = await supabase
        .from("profiles")
        .select("balance_bdt")
        .eq("id", userId)
        .maybeSingle();
      if (!error && data) {
        return { balance: Number(data.balance_bdt), error: null };
      }
      lastErr = error?.message ?? (data ? null : "Profile not found");
      // exponential backoff: 300ms, 700ms, 1500ms
      if (i < attempts - 1) {
        await new Promise((r) => setTimeout(r, 300 + i * 400 + i * i * 200));
      }
    }
    return { balance: null, error: lastErr ?? "Unknown error" };
  };

  const refreshApprovedBalance = async () => {
    if (!approvedInfo) return;
    setApprovedInfo({ ...approvedInfo, balanceLoading: true, balanceError: null });
    const res = await fetchBalanceWithRetry(approvedInfo.userId, 3);
    setApprovedInfo((prev) =>
      prev
        ? {
            ...prev,
            balanceLoading: false,
            newBalance: res.balance,
            balanceError: res.error,
          }
        : prev,
    );
  };

  const approveTopup = async (id: string) => {
    const row = topups.find((t) => t.id === id);
    setBusy(id);
    const { error } = await supabase.rpc("admin_approve_topup", { p_id: id, p_note: null });
    if (error) {
      setBusy(null);
      return toast.error(error.message);
    }
    setBusy(null);
    if (row) {
      // Open modal in loading state, then fetch balance with retries
      setApprovedInfo({
        userLabel: userLabel(row.user_id),
        method: row.method,
        txnId: row.txn_id,
        amount: Number(row.amount_bdt),
        newBalance: null,
        balanceError: null,
        balanceLoading: true,
        userId: row.user_id,
      });
      const res = await fetchBalanceWithRetry(row.user_id, 3);
      setApprovedInfo({
        userLabel: userLabel(row.user_id),
        method: row.method,
        txnId: row.txn_id,
        amount: Number(row.amount_bdt),
        newBalance: res.balance,
        balanceError: res.error,
        balanceLoading: false,
        userId: row.user_id,
      });
      if (res.error) {
        toast.error(`Approved, but balance fetch failed: ${res.error}`);
      }
    } else {
      toast.success("Top-up approved · balance credited");
    }
    loadAll();
  };

  const openReject = (kind: "topup" | "withdraw", id: string) => {
    setRejTarget({ kind, id }); setRejNote(""); setRejOpen(true);
  };

  const submitReject = async () => {
    if (!rejTarget) return;
    setBusy(rejTarget.id);
    const fn = rejTarget.kind === "topup" ? "admin_reject_topup" : "admin_reject_withdraw";
    const { error } = await supabase.rpc(fn, { p_id: rejTarget.id, p_note: rejNote || null });
    setBusy(null);
    if (error) return toast.error(error.message);
    toast.success("Rejected");
    setRejOpen(false);
    loadAll();
  };

  const openPay = (w: Withdraw) => {
    setPayTarget(w); setPayTxn(""); setPayNote(""); setPayOpen(true);
  };

  const submitPay = async () => {
    if (!payTarget) return;
    if (payTxn.trim().length < 3) return toast.error("Enter payout TxnID");
    setBusy(payTarget.id);
    const { error } = await supabase.rpc("admin_pay_withdraw", {
      p_id: payTarget.id, p_payout_txn: payTxn, p_note: payNote || null,
    });
    setBusy(null);
    if (error) return toast.error(error.message);
    toast.success("Withdraw paid · balance deducted");
    setPayOpen(false);
    loadAll();
  };

  const userLabel = (id: string) => {
    const p = profiles[id];
    return p?.display_name || p?.email || id.slice(0, 8);
  };

  if (loading) return <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;

  const pendingTopups = topups.filter((r) => r.status === "pending").length;
  const pendingWds = withdraws.filter((r) => r.status === "pending").length;

  return (
    <Card className="border-border/60 bg-gradient-card p-6">
      <Tabs defaultValue="topups">
        <TabsList>
          <TabsTrigger value="topups">Top-ups {pendingTopups > 0 && <Badge className="ml-2 bg-warning/20 text-warning hover:bg-warning/20">{pendingTopups}</Badge>}</TabsTrigger>
          <TabsTrigger value="withdraws">Withdraws {pendingWds > 0 && <Badge className="ml-2 bg-warning/20 text-warning hover:bg-warning/20">{pendingWds}</Badge>}</TabsTrigger>
        </TabsList>

        <TabsContent value="topups" className="mt-4">
          {topups.length === 0 ? <p className="text-sm text-muted-foreground">No top-up requests yet.</p> : (
            <div className="overflow-x-auto"><Table>
              <TableHeader><TableRow><TableHead>When</TableHead><TableHead>User</TableHead><TableHead>Method</TableHead><TableHead>Amount</TableHead><TableHead>Sender</TableHead><TableHead>TxnID</TableHead><TableHead>Proof</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
              <TableBody>
                {topups.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString()}</TableCell>
                    <TableCell className="text-sm">
                      {userLabel(r.user_id)}
                      {r.source === "telegram_bot" && <Badge className="ml-1 bg-primary/20 text-primary hover:bg-primary/20">bot</Badge>}
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
        </TabsContent>

        <TabsContent value="withdraws" className="mt-4">
          {withdraws.length === 0 ? <p className="text-sm text-muted-foreground">No withdraw requests yet.</p> : (
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