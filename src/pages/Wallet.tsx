import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
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
import { Loader2, Wallet as WalletIcon, ArrowDownToLine, ArrowUpFromLine } from "lucide-react";
import { toast } from "sonner";
import { DepositWizard } from "@/components/wallet/DepositWizard";
import { AppShell } from "@/components/layout/AppShell";

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
  const { user, roles, loading: authLoading } = useAuth();
  const [balance, setBalance] = useState(0);
  const [topups, setTopups] = useState<TopupRow[]>([]);
  const [withdraws, setWithdraws] = useState<WithdrawRow[]>([]);
  const [busy, setBusy] = useState(false);

  // Withdraw form
  const [wAmount, setWAmount] = useState("");
  const [wMethod, setWMethod] = useState<Method>("bkash");
  const [wReceiver, setWReceiver] = useState("");
  const [wNote, setWNote] = useState("");

  const isSeller = roles.includes("seller") || roles.includes("admin");

  const loadAll = async () => {
    if (!user) return;
    const [{ data: prof }, { data: tp }, { data: wd }] = await Promise.all([
      supabase.from("profiles").select("balance_bdt").eq("id", user.id).maybeSingle(),
      supabase.from("topup_requests").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(50),
      supabase.from("withdraw_requests").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(50),
    ]);
    setBalance(Number(prof?.balance_bdt ?? 0));
    setTopups((tp ?? []) as TopupRow[]);
    setWithdraws((wd ?? []) as WithdrawRow[]);
  };

  useEffect(() => {
    loadAll();
    if (!user) return;
    const ch = supabase
      .channel("wallet-" + user.id)
      .on("postgres_changes", { event: "*", schema: "public", table: "topup_requests", filter: `user_id=eq.${user.id}` }, loadAll)
      .on("postgres_changes", { event: "*", schema: "public", table: "withdraw_requests", filter: `user_id=eq.${user.id}` }, loadAll)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "profiles", filter: `id=eq.${user.id}` }, loadAll)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const submitWithdraw = async () => {
    const amt = Number(wAmount);
    if (!amt || amt < 100) return toast.error("Minimum withdraw ৳100");
    if (!wReceiver.trim()) return toast.error("Enter receiver number");
    setBusy(true);
    const { error } = await supabase.rpc("submit_withdraw_request", {
      p_amount: amt, p_method: wMethod, p_receiver_number: wReceiver, p_note: wNote || null,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Withdraw submitted — admin will process.");
    setWAmount(""); setWReceiver(""); setWNote("");
    loadAll();
  };

  if (authLoading) return <div className="flex min-h-screen items-center justify-center bg-background"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  if (!user) return <Navigate to="/login" replace />;

  return (
    <AppShell
      mode={isSeller ? "seller" : "buyer"}
      title="Wallet"
      subtitle="Top-up via bKash/Nagad. Sellers can request payouts."
      actions={
        <Card className="border-border/60 bg-gradient-card p-3">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Current balance</div>
          <div className="mt-1 flex items-center gap-2 font-display text-xl font-bold text-primary">
            <WalletIcon className="h-5 w-5" /> ৳ {balance.toFixed(2)}
          </div>
        </Card>
      }
    >
        <Tabs defaultValue="topup">
          <TabsList>
            <TabsTrigger value="topup"><ArrowDownToLine className="mr-2 h-4 w-4" />Top-up</TabsTrigger>
            {isSeller && <TabsTrigger value="withdraw"><ArrowUpFromLine className="mr-2 h-4 w-4" />Withdraw</TabsTrigger>}
            <TabsTrigger value="history">History</TabsTrigger>
          </TabsList>

          <TabsContent value="topup" className="mt-4">
            <DepositWizard isSeller={isSeller} onSubmitted={loadAll} />
          </TabsContent>

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
                  </div>
                  <div className="md:col-span-2">
                    <Label>Receiver number</Label>
                    <Input value={wReceiver} onChange={(e) => setWReceiver(e.target.value)} placeholder="01XXXXXXXXX (your number)" />
                  </div>
                  <div className="md:col-span-2">
                    <Label>Note (optional)</Label>
                    <Textarea value={wNote} onChange={(e) => setWNote(e.target.value)} rows={2} />
                  </div>
                </div>
                <div className="mt-4 flex justify-end">
                  <Button onClick={submitWithdraw} disabled={busy} className="bg-gradient-brand text-primary-foreground">
                    {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Request withdraw
                  </Button>
                </div>
              </Card>
            </TabsContent>
          )}

          <TabsContent value="history" className="mt-4 space-y-6">
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
    </AppShell>
  );
};

export default Wallet;