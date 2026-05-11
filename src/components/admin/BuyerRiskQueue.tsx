import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertTriangle, Loader2, Ban, RefreshCw } from "lucide-react";
import { toast } from "sonner";

interface RiskBuyer {
  user_id: string;
  email: string | null;
  display_name: string | null;
  balance_bdt: number;
  is_banned: boolean;
  orders_count: number;
  replacements_filed: number;
  replacements_rejected: number;
  replacement_rate: number;
  risk_level: "low" | "medium" | "high";
  last_replacement_at: string | null;
}

export const BuyerRiskQueue = () => {
  const [buyers, setBuyers] = useState<RiskBuyer[]>([]);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const { buyers } = await api.get<{ buyers: RiskBuyer[] }>("/api/admin/buyers/risk-queue");
      setBuyers(buyers ?? []);
    } catch (e: any) { toast.error(e?.message || "Failed"); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const ban = async (b: RiskBuyer) => {
    if (!confirm(`Ban ${b.email ?? b.user_id}? They can't place new orders.`)) return;
    try {
      await api.post(`/api/admin/users/${b.user_id}/ban`, { banned: true });
      toast.success("Buyer banned");
      load();
    } catch (e: any) { toast.error(e?.message || "Failed"); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-xl font-semibold flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-warning" /> Buyer risk queue
          </h2>
          <p className="text-sm text-muted-foreground">
            Buyers with high replacement-to-order ratios. Review for fraud or quality issues.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
          Refresh
        </Button>
      </div>

      <Card className="overflow-hidden border-border/60 bg-gradient-card">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Buyer</TableHead>
                <TableHead>Risk</TableHead>
                <TableHead className="text-right">Orders</TableHead>
                <TableHead className="text-right">Replacements</TableHead>
                <TableHead className="text-right">Rate</TableHead>
                <TableHead>Last filed</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {!loading && buyers.length === 0 && (
                <TableRow><TableCell colSpan={7} className="text-center text-sm text-muted-foreground py-8">
                  No risky buyers — clean shop.
                </TableCell></TableRow>
              )}
              {buyers.map((b) => (
                <TableRow key={b.user_id}>
                  <TableCell>
                    <div className="font-medium">{b.display_name ?? "—"}</div>
                    <div className="text-xs text-muted-foreground">{b.email}</div>
                  </TableCell>
                  <TableCell>
                    <Badge className={
                      b.risk_level === "high"
                        ? "bg-destructive/20 text-destructive"
                        : "bg-warning/20 text-warning"
                    }>
                      {b.risk_level.toUpperCase()}
                    </Badge>
                    {b.is_banned && <Badge variant="outline" className="ml-1 border-destructive/40 text-destructive">Banned</Badge>}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm">{b.orders_count}</TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    {b.replacements_filed}
                    {b.replacements_rejected > 0 && (
                      <span className="ml-1 text-xs text-muted-foreground">({b.replacements_rejected} rej)</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right font-display font-semibold text-warning">
                    {(b.replacement_rate * 100).toFixed(1)}%
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {b.last_replacement_at ? new Date(b.last_replacement_at).toLocaleDateString() : "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    {!b.is_banned && (
                      <Button size="sm" variant="outline"
                        className="border-destructive/40 text-destructive"
                        onClick={() => ban(b)}>
                        <Ban className="mr-1 h-3 w-3" /> Ban
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
};

export default BuyerRiskQueue;