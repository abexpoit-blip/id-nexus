import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Loader2, Trophy, AlertTriangle, Gift, RefreshCcw, Crown, Medal, Award } from "lucide-react";
import { toast } from "sonner";

interface SellerRow {
  seller_id: string;
  email: string | null;
  display_name: string | null;
  is_banned: boolean;
  sales_lifetime: number;
  revenue_lifetime: number;
  sales_period: number;
  revenue_period: number;
  replacements_total: number;
  replacements_upheld: number;
  rank: number;
  tier: "platinum" | "gold" | "silver" | "bronze" | "none";
  risk_level: "low" | "medium" | "high";
  bonus_eligible: boolean;
}

const tierStyle = (t: SellerRow["tier"]) => {
  switch (t) {
    case "platinum": return { cls: "bg-primary/15 text-primary border-primary/40", label: "Platinum", Icon: Crown };
    case "gold":     return { cls: "bg-warning/15 text-warning border-warning/40", label: "Gold", Icon: Trophy };
    case "silver":   return { cls: "bg-muted text-foreground border-border", label: "Silver", Icon: Medal };
    case "bronze":   return { cls: "bg-accent/15 text-accent border-accent/40", label: "Bronze", Icon: Award };
    default:         return { cls: "bg-muted text-muted-foreground border-border", label: "—", Icon: Award };
  }
};

export const SellerLeaderboard = () => {
  const [rows, setRows] = useState<SellerRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [days, setDays] = useState("30");
  const [bonusing, setBonusing] = useState<SellerRow | null>(null);
  const [bonusAmt, setBonusAmt] = useState("");
  const [bonusNote, setBonusNote] = useState("Top seller bonus");
  const [submitting, setSubmitting] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const r = await api.get<{ sellers: SellerRow[] }>(`/api/admin/sellers/leaderboard?days=${days}`);
      setRows(r.sellers ?? []);
    } catch (e: any) { toast.error(e?.message || "Failed to load leaderboard"); }
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [days]);

  const submitBonus = async () => {
    if (!bonusing) return;
    const amt = Number(bonusAmt);
    if (!Number.isFinite(amt) || amt <= 0) { toast.error("Enter a positive amount"); return; }
    setSubmitting(true);
    try {
      const r = await api.post<{ balance: number }>(
        `/api/admin/sellers/${bonusing.seller_id}/bonus`,
        { amount_bdt: amt, note: bonusNote.trim() || "Top seller bonus" }
      );
      toast.success(`Bonus credited. New balance ৳${r.balance.toFixed(2)}`);
      setBonusing(null); setBonusAmt(""); load();
    } catch (e: any) { toast.error(e?.message || "Failed"); }
    finally { setSubmitting(false); }
  };

  return (
    <Card className="border-border/60 bg-gradient-card p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-semibold flex items-center gap-2">
            <Trophy className="h-5 w-5 text-warning" /> Seller leaderboard
          </h2>
          <p className="text-xs text-muted-foreground">
            Tiers awarded by lifetime sales · Top 3 of the period are bonus-eligible.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={days} onValueChange={setDays}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Last 7 days</SelectItem>
              <SelectItem value="30">Last 30 days</SelectItem>
              <SelectItem value="90">Last 90 days</SelectItem>
              <SelectItem value="365">Last year</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={load}>
            <RefreshCcw className="mr-2 h-4 w-4" /> Refresh
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex h-32 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : rows.length === 0 ? (
        <div className="py-12 text-center text-sm text-muted-foreground">No sellers yet.</div>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">#</TableHead>
                <TableHead>Seller</TableHead>
                <TableHead>Tier</TableHead>
                <TableHead className="text-right">Sales (period)</TableHead>
                <TableHead className="text-right">Revenue (period)</TableHead>
                <TableHead className="text-right">Lifetime sales</TableHead>
                <TableHead>Risk</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((s) => {
                const t = tierStyle(s.tier);
                const Icon = t.Icon;
                return (
                  <TableRow key={s.seller_id}>
                    <TableCell className="font-display font-bold">{s.rank}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div>
                          <div className="font-medium">{s.display_name ?? "—"}</div>
                          <div className="text-xs text-muted-foreground">{s.email}</div>
                        </div>
                        {s.bonus_eligible && (
                          <Badge className="bg-warning/20 text-warning hover:bg-warning/20">
                            <Gift className="mr-1 h-3 w-3" /> Bonus
                          </Badge>
                        )}
                        {s.is_banned && <Badge variant="destructive">Banned</Badge>}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={t.cls + " gap-1"}>
                        <Icon className="h-3 w-3" /> {t.label}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">{s.sales_period}</TableCell>
                    <TableCell className="text-right">৳{Number(s.revenue_period || 0).toFixed(0)}</TableCell>
                    <TableCell className="text-right text-muted-foreground">{s.sales_lifetime}</TableCell>
                    <TableCell>
                      {s.risk_level === "low" ? (
                        <span className="text-xs text-muted-foreground">Low</span>
                      ) : (
                        <Badge className="bg-warning/20 text-warning hover:bg-warning/20 gap-1">
                          <AlertTriangle className="h-3 w-3" />
                          {s.risk_level === "high" ? "HIGH" : "Watch"}
                          <span className="font-normal opacity-80">· {s.replacements_upheld}/{s.sales_lifetime}</span>
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="outline" onClick={() => { setBonusing(s); setBonusAmt(""); }}>
                        <Gift className="mr-1 h-3 w-3" /> Pay bonus
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={!!bonusing} onOpenChange={(o) => !o && setBonusing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Pay bonus to {bonusing?.display_name ?? bonusing?.email}</DialogTitle>
            <DialogDescription>
              Credits the seller's wallet immediately. They'll be notified and the action is audit-logged.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Amount (৳)</Label>
              <Input type="number" min={1} value={bonusAmt} onChange={(e) => setBonusAmt(e.target.value)} placeholder="500" />
            </div>
            <div>
              <Label>Note</Label>
              <Textarea value={bonusNote} onChange={(e) => setBonusNote(e.target.value)} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setBonusing(null)} disabled={submitting}>Cancel</Button>
            <Button onClick={submitBonus} disabled={submitting} className="bg-gradient-brand text-primary-foreground">
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Credit bonus
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
};
