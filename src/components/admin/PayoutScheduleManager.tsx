import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Loader2, CalendarClock, Banknote, Save, Send } from "lucide-react";
import { toast } from "sonner";

type Schedule = { day_of_week: number; min_payout_bdt: number; auto_approve: boolean };
type Pending = {
  id: string; amount_bdt: number; method: string; receiver_number: string;
  created_at: string; status: string; user_email: string; display_name: string | null;
  balance_bdt: number;
};

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const nextPayoutDate = (dow: number) => {
  const today = new Date();
  const diff = (dow - today.getDay() + 7) % 7 || 7;
  const d = new Date(today); d.setDate(today.getDate() + diff);
  return d.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
};

export const PayoutScheduleManager = () => {
  const [loading, setLoading] = useState(true);
  const [schedule, setSchedule] = useState<Schedule>({ day_of_week: 5, min_payout_bdt: 100, auto_approve: false });
  const [pending, setPending] = useState<Pending[]>([]);
  const [totals, setTotals] = useState({ count: 0, amount: 0 });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [paying, setPaying] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const r = await api.get<{ schedule: Schedule; pending: Pending[]; totals: { count: number; amount: number } }>(
        "/api/admin/payouts/schedule"
      );
      setSchedule(r.schedule); setPending(r.pending ?? []); setTotals(r.totals ?? { count: 0, amount: 0 });
      setSelected(new Set());
    } catch (e: any) { toast.error(e?.message || "Failed to load"); }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const save = async () => {
    setSaving(true);
    try {
      await api.put("/api/admin/payouts/schedule", schedule);
      toast.success("Schedule saved");
    } catch (e: any) { toast.error(e?.message || "Failed"); }
    setSaving(false);
  };

  const toggleAll = () => {
    if (selected.size === pending.length) setSelected(new Set());
    else setSelected(new Set(pending.map((p) => p.id)));
  };
  const toggleOne = (id: string) => {
    const n = new Set(selected);
    n.has(id) ? n.delete(id) : n.add(id);
    setSelected(n);
  };

  const bulkPay = async () => {
    if (selected.size === 0) return;
    if (!confirm(`Pay out ${selected.size} withdrawal(s)? This deducts from seller balances.`)) return;
    setPaying(true);
    try {
      const r = await api.post<{ results: { ok: boolean; amount?: number; error?: string }[] }>(
        "/api/admin/withdraws/bulk-pay",
        { ids: Array.from(selected), txn_prefix: "BULK", note: `Scheduled payout ${new Date().toLocaleDateString()}` }
      );
      const ok = r.results.filter((x) => x.ok).length;
      const failed = r.results.length - ok;
      toast.success(`Paid ${ok} · ${failed} skipped`);
      load();
    } catch (e: any) { toast.error(e?.message || "Failed"); }
    setPaying(false);
  };

  const selectedAmount = pending
    .filter((p) => selected.has(p.id))
    .reduce((a, b) => a + Number(b.amount_bdt), 0);

  return (
    <div className="space-y-6">
      <Card className="border-border/60 bg-gradient-card p-6">
        <div className="flex items-center gap-2">
          <CalendarClock className="h-5 w-5 text-primary" />
          <h2 className="font-display text-lg font-semibold">Payout schedule</h2>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Sellers know when to expect payouts. Next scheduled payout:{" "}
          <b className="text-foreground">{nextPayoutDate(schedule.day_of_week)}</b>
        </p>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <div className="space-y-1.5">
            <Label>Payout day</Label>
            <Select
              value={String(schedule.day_of_week)}
              onValueChange={(v) => setSchedule((s) => ({ ...s, day_of_week: parseInt(v, 10) }))}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {DAYS.map((d, i) => <SelectItem key={i} value={String(i)}>{d}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Minimum payout (৳)</Label>
            <Input
              type="number" min={100}
              value={schedule.min_payout_bdt}
              onChange={(e) => setSchedule((s) => ({ ...s, min_payout_bdt: Number(e.target.value) || 100 }))}
            />
          </div>
          <div className="flex items-end gap-3">
            <div className="flex items-center gap-2">
              <Switch
                checked={schedule.auto_approve}
                onCheckedChange={(v) => setSchedule((s) => ({ ...s, auto_approve: v }))}
              />
              <Label className="text-sm">Auto-approve eligible</Label>
            </div>
          </div>
        </div>
        <div className="mt-4 flex justify-end">
          <Button onClick={save} disabled={saving} size="sm">
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Save schedule
          </Button>
        </div>
      </Card>

      <Card className="border-border/60 bg-gradient-card p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Banknote className="h-5 w-5 text-success" />
              <h2 className="font-display text-lg font-semibold">Pending payout queue</h2>
            </div>
            <p className="text-xs text-muted-foreground">
              {totals.count} request(s) · ৳{totals.amount.toFixed(2)} total ·
              {" "}{selected.size} selected (৳{selectedAmount.toFixed(2)})
            </p>
          </div>
          <Button
            size="sm"
            disabled={selected.size === 0 || paying}
            onClick={bulkPay}
            className="bg-success text-success-foreground hover:bg-success/90"
          >
            {paying ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
            Pay selected
          </Button>
        </div>

        {loading ? (
          <div className="flex h-32 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : pending.length === 0 ? (
          <div className="py-12 text-center text-sm text-muted-foreground">No pending withdrawals.</div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      checked={selected.size === pending.length && pending.length > 0}
                      onCheckedChange={toggleAll}
                    />
                  </TableHead>
                  <TableHead>Seller</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead>Receiver</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Requested</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pending.map((p) => {
                  const insufficient = Number(p.balance_bdt) < Number(p.amount_bdt);
                  return (
                    <TableRow key={p.id} className={insufficient ? "opacity-60" : ""}>
                      <TableCell>
                        <Checkbox
                          checked={selected.has(p.id)}
                          onCheckedChange={() => toggleOne(p.id)}
                          disabled={insufficient}
                        />
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">{p.display_name || p.user_email}</div>
                        <div className="font-mono text-xs text-muted-foreground">{p.user_email}</div>
                      </TableCell>
                      <TableCell className="capitalize">{p.method}</TableCell>
                      <TableCell className="font-mono text-xs">{p.receiver_number}</TableCell>
                      <TableCell className="text-right">৳{Number(p.amount_bdt).toFixed(2)}</TableCell>
                      <TableCell className="text-right text-xs text-muted-foreground">
                        ৳{Number(p.balance_bdt).toFixed(2)}
                        {insufficient && <Badge variant="outline" className="ml-1 border-destructive/40 text-destructive">low</Badge>}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="capitalize">{p.status}</Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {new Date(p.created_at).toLocaleDateString()}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>
    </div>
  );
};