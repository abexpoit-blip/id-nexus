import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { api } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Loader2, Wallet as WalletIcon, ArrowDownToLine, ArrowUpFromLine,
  History, TrendingUp, AlertCircle, CheckCircle2,
} from "lucide-react";
import { toast } from "sonner";
import { DepositWizard } from "@/components/wallet/DepositWizard";
import { AppShell } from "@/components/layout/AppShell";
import { WalletCreditCard } from "@/components/wallet/WalletCreditCard";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type Method = "bkash" | "nagad" | "binance";

interface TopupRow {
  id: string;
  amount_bdt: number;
  method: Method;
  sender_number: string;
  txn_id: string;
  status: string;
  admin_note: string | null;
  created_at: string;
}

interface WithdrawRow {
  id: string;
  amount_bdt: number;
  method: Method;
  receiver_number: string;
  status: string;
  admin_note: string | null;
  payout_txn_id: string | null;
  created_at: string;
}

interface LedgerRow {
  id: string;
  kind: string;
  amount_bdt: string | number;
  balance_after: string | number;
  note: string | null;
  created_at: string;
}

type LedgerFilter = "all" | "deposits" | "withdrawals" | "earnings";

const KIND_LABEL: Record<string, string> = {
  topup: "Deposit",
  withdraw: "Withdrawal",
  seller_payout: "Daily Earning",
  refund: "Refund",
  admin_adjustment: "Adjustment",
  purchase: "Purchase",
};

const statusBadge = (s: string) => {
  const cls =
    s === "approved" || s === "paid"
      ? "bg-success/20 text-success"
      : s === "rejected"
      ? "bg-destructive/20 text-destructive"
      : "bg-warning/20 text-warning";
  return <Badge className={`${cls} hover:${cls}`}>{s}</Badge>;
};

const Wallet = () => {
  const { user, profile, roles, loading: authLoading, refresh } = useAuth();
  const balance = Number(profile?.balance_bdt ?? 0);
  const [topups, setTopups] = useState<TopupRow[]>([]);
  const [withdraws, setWithdraws] = useState<WithdrawRow[]>([]);
  const [ledger, setLedger] = useState<LedgerRow[]>([]);
  const [ledgerFilter, setLedgerFilter] = useState<LedgerFilter>("all");
  const [busy, setBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  // Withdraw form
  const [wAmount, setWAmount] = useState("");
  const [wMethod, setWMethod] = useState<Method>("bkash");
  const [wReceiver, setWReceiver] = useState("");
  const [wNote, setWNote] = useState("");

  const isSeller = roles.includes("seller") || roles.includes("admin");
  const cardholder = (
    profile?.display_name || (user?.email ? user.email.split("@")[0] : "MEMBER")
  )
    .toString()
    .toUpperCase()
    .slice(0, 22);
  const last4 = (user?.id || "0000").replace(/[^0-9a-z]/gi, "").slice(-4).toUpperCase().padStart(4, "0");

  const loadAll = async () => {
    if (!user) return;
    try {
      const [tp, wd, lg] = await Promise.all([
        api.get<{ topups: TopupRow[] }>("/api/wallet/topups"),
        api.get<{ withdraws: WithdrawRow[] }>("/api/withdraws/mine").catch(() => ({ withdraws: [] as WithdrawRow[] })),
        api.get<{ ledger: LedgerRow[] }>("/api/wallet/ledger").catch(() => ({ ledger: [] as LedgerRow[] })),
      ]);
      setTopups(tp.topups ?? []);
      setWithdraws(wd.withdraws ?? []);
      setLedger(lg.ledger ?? []);
      await refresh();
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    loadAll();
    if (!user) return;
    const timer = setInterval(loadAll, 30_000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // Live validation for the withdraw form
  const wAmt = Number(wAmount);
  const validNumber = /^01[0-9]{9}$/.test(wReceiver.trim());
  const validAmount = Number.isFinite(wAmt) && wAmt >= 100;
  const sufficientBalance = wAmt <= balance;
  const canSubmit =
    validAmount && validNumber && sufficientBalance && ["bkash", "nagad"].includes(wMethod);

  const openConfirm = () => {
    if (!validAmount) return toast.error("Minimum withdraw ৳100");
    if (!validNumber) return toast.error("Enter a valid 11-digit BD mobile number (01XXXXXXXXX)");
    if (!sufficientBalance) return toast.error(`Insufficient balance. Available: ৳${balance.toFixed(2)}`);
    if (!["bkash", "nagad"].includes(wMethod)) return toast.error("Only bKash and Nagad supported");
    setConfirmOpen(true);
  };

  const submitWithdraw = async () => {
    setConfirmOpen(false);
    setBusy(true);
    try {
      await api.post("/api/wallet/withdraw", {
        amount_bdt: wAmt,
        method: wMethod,
        receiver_number: wReceiver,
        note: wNote || null,
      });
      toast.success(`✓ Withdraw of ৳${wAmt.toFixed(2)} submitted`, {
        description: `Admin will process payout to ${wMethod} ${wReceiver}.`,
      });
      setWAmount(""); setWReceiver(""); setWNote("");
      loadAll();
    } catch (e: any) {
      toast.error("Withdraw failed", { description: e?.message || "Please try again." });
    } finally {
      setBusy(false);
    }
  };

  const filteredLedger = ledger.filter((r) => {
    if (ledgerFilter === "all") return true;
    if (ledgerFilter === "deposits") return r.kind === "topup" || r.kind === "refund";
    if (ledgerFilter === "withdrawals") return r.kind === "withdraw";
    if (ledgerFilter === "earnings") return r.kind === "seller_payout";
    return true;
  });

  if (authLoading) return <div className="flex min-h-screen items-center justify-center bg-background"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  if (!user) return <Navigate to="/login" replace />;

  return (
    <AppShell
      mode={isSeller ? "seller" : "buyer"}
      title="Wallet"
      subtitle={isSeller ? "Request payouts from your seller balance." : "Top-up via bKash/Nagad."}
    >
        {/* Premium credit-card style wallet */}
        <div className="mb-6 flex justify-center sm:justify-start">
          <WalletCreditCard
            balance={balance}
            cardholder={cardholder}
            last4={last4}
            variant={isSeller ? "seller" : "buyer"}
            recent={ledger.slice(0, 5).map((r) => ({
              id: r.id,
              kind: r.kind,
              amount_bdt: r.amount_bdt,
              created_at: r.created_at,
            }))}
          />
        </div>

        <Tabs defaultValue={isSeller ? "withdraw" : "topup"}>
          <TabsList>
            {!isSeller && (
              <TabsTrigger value="topup"><ArrowDownToLine className="mr-2 h-4 w-4" />Top-up</TabsTrigger>
            )}
            {isSeller && <TabsTrigger value="withdraw"><ArrowUpFromLine className="mr-2 h-4 w-4" />Withdraw</TabsTrigger>}
            <TabsTrigger value="transactions"><History className="mr-2 h-4 w-4" />Transactions</TabsTrigger>
            <TabsTrigger value="history">Requests</TabsTrigger>
          </TabsList>

          {!isSeller && (
            <TabsContent value="topup" className="mt-4">
              <DepositWizard isSeller={isSeller} onSubmitted={loadAll} />
            </TabsContent>
          )}

          {isSeller && (
            <TabsContent value="withdraw" className="mt-4">
              <Card className="border-border/60 bg-gradient-card p-6">
                <div className="mb-4">
                  <div className="font-display text-lg font-semibold">Request withdraw</div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Available balance: <span className="font-semibold text-primary">৳ {balance.toFixed(2)}</span>. Pending withdraws are reserved automatically.
                  </p>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <Label>Method</Label>
                    <Select value={wMethod} onValueChange={(v) => setWMethod(v as Method)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="bkash">bKash</SelectItem>
                        <SelectItem value="nagad">Nagad</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Amount (৳)</Label>
                    <Input type="number" min={100} value={wAmount} onChange={(e) => setWAmount(e.target.value)} placeholder="1000" />
                    {wAmount && !validAmount && (
                      <p className="mt-1 flex items-center gap-1 text-xs text-destructive">
                        <AlertCircle className="h-3 w-3" /> Minimum ৳100
                      </p>
                    )}
                    {wAmount && validAmount && !sufficientBalance && (
                      <p className="mt-1 flex items-center gap-1 text-xs text-destructive">
                        <AlertCircle className="h-3 w-3" /> Exceeds available ৳{balance.toFixed(2)}
                      </p>
                    )}
                    {wAmount && validAmount && sufficientBalance && (
                      <p className="mt-1 flex items-center gap-1 text-xs text-success">
                        <CheckCircle2 className="h-3 w-3" /> Remaining after: ৳{(balance - wAmt).toFixed(2)}
                      </p>
                    )}
                  </div>
                  <div className="md:col-span-2">
                    <Label>Receiver number</Label>
                    <Input value={wReceiver} onChange={(e) => setWReceiver(e.target.value)} placeholder="01XXXXXXXXX (your number)" />
                    {wReceiver && !validNumber && (
                      <p className="mt-1 flex items-center gap-1 text-xs text-destructive">
                        <AlertCircle className="h-3 w-3" /> Must be 11 digits starting with 01
                      </p>
                    )}
                  </div>
                  <div className="md:col-span-2">
                    <Label>Note (optional)</Label>
                    <Textarea value={wNote} onChange={(e) => setWNote(e.target.value)} rows={2} />
                  </div>
                </div>
                <div className="mt-4 flex justify-end">
                  <Button onClick={openConfirm} disabled={busy || !canSubmit} className="bg-gradient-brand text-primary-foreground">
                    {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Request withdraw
                  </Button>
                </div>
              </Card>
            </TabsContent>
          )}

          <TabsContent value="transactions" className="mt-4">
            <Card className="border-border/60 bg-gradient-card p-4 sm:p-6">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 font-display text-lg font-semibold">
                    <TrendingUp className="h-4 w-4 text-primary" /> Transaction history
                  </div>
                  <p className="text-xs text-muted-foreground">Filter your wallet activity by type.</p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {([
                    { k: "all", label: "All" },
                    { k: "deposits", label: "Deposits" },
                    { k: "withdrawals", label: "Withdrawals" },
                    { k: "earnings", label: "Daily earnings" },
                  ] as { k: LedgerFilter; label: string }[]).map((f) => (
                    <button
                      key={f.k}
                      onClick={() => setLedgerFilter(f.k)}
                      className={`rounded-full border px-3 py-1 text-xs transition ${
                        ledgerFilter === f.k
                          ? "border-primary bg-primary/15 text-primary"
                          : "border-border/60 bg-background/40 text-muted-foreground hover:border-primary/40"
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>
              {filteredLedger.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">No transactions in this filter.</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead className="text-right">Balance</TableHead>
                        <TableHead>Note</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredLedger.map((r) => {
                        const amt = Number(r.amount_bdt);
                        const positive = amt >= 0;
                        return (
                          <TableRow key={r.id}>
                            <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                              {new Date(r.created_at).toLocaleString()}
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className="text-[10px] uppercase tracking-wider">
                                {KIND_LABEL[r.kind] ?? r.kind}
                              </Badge>
                            </TableCell>
                            <TableCell
                              className={`text-right font-mono text-sm font-semibold tabular-nums ${
                                positive ? "text-success" : "text-destructive"
                              }`}
                            >
                              {positive ? "+" : ""}৳{amt.toFixed(2)}
                            </TableCell>
                            <TableCell className="text-right font-mono text-xs text-muted-foreground tabular-nums">
                              ৳{Number(r.balance_after).toFixed(2)}
                            </TableCell>
                            <TableCell className="max-w-[260px] truncate text-xs text-muted-foreground">
                              {r.note ?? "—"}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </Card>
          </TabsContent>

          <TabsContent value="history" className="mt-4 space-y-6">
            {!isSeller && (
              <Card className="border-border/60 bg-gradient-card p-6">
                <div className="mb-3 font-display text-lg font-semibold">Top-up history</div>
                {topups.length === 0 ? <p className="text-sm text-muted-foreground">No top-ups yet.</p> : (
                <div className="overflow-x-auto"><Table>
                  <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Method</TableHead><TableHead>Amount</TableHead><TableHead>TxnID</TableHead><TableHead>Status</TableHead><TableHead>Note</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {topups.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString()}</TableCell>
                        <TableCell>{r.method}</TableCell>
                        <TableCell>৳ {Number(r.amount_bdt).toFixed(2)}</TableCell>
                        <TableCell className="font-mono text-xs">{r.txn_id}</TableCell>
                        <TableCell>{statusBadge(r.status)}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{r.admin_note ?? "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table></div>
                )}
              </Card>
            )}

            {isSeller && (
              <Card className="border-border/60 bg-gradient-card p-6">
                <div className="mb-3 font-display text-lg font-semibold">Withdraw history</div>
                {withdraws.length === 0 ? <p className="text-sm text-muted-foreground">No withdraws yet.</p> : (
                  <div className="overflow-x-auto"><Table>
                    <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Method</TableHead><TableHead>Amount</TableHead><TableHead>Receiver</TableHead><TableHead>Status</TableHead><TableHead>Payout TxnID</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {withdraws.map((r) => (
                        <TableRow key={r.id}>
                          <TableCell className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString()}</TableCell>
                          <TableCell>{r.method}</TableCell>
                          <TableCell>৳ {Number(r.amount_bdt).toFixed(2)}</TableCell>
                          <TableCell className="font-mono text-xs">{r.receiver_number}</TableCell>
                          <TableCell>{statusBadge(r.status)}</TableCell>
                          <TableCell className="font-mono text-xs">{r.payout_txn_id ?? "—"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table></div>
                )}
              </Card>
            )}
          </TabsContent>
        </Tabs>

        {/* Withdraw confirmation modal */}
        <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Confirm withdraw request</AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="space-y-2 pt-2 text-sm">
                  <div className="flex justify-between border-b border-border/40 pb-2">
                    <span className="text-muted-foreground">Method</span>
                    <span className="font-medium uppercase">{wMethod}</span>
                  </div>
                  <div className="flex justify-between border-b border-border/40 pb-2">
                    <span className="text-muted-foreground">Receiver</span>
                    <span className="font-mono">{wReceiver}</span>
                  </div>
                  <div className="flex justify-between border-b border-border/40 pb-2">
                    <span className="text-muted-foreground">Amount</span>
                    <span className="font-display text-lg font-bold text-primary">৳{wAmt.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Balance after</span>
                    <span className="font-mono">৳{(balance - wAmt).toFixed(2)}</span>
                  </div>
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={submitWithdraw} className="bg-gradient-brand text-primary-foreground">
                Confirm withdraw
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
    </AppShell>
  );
};

export default Wallet;