import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Row {
  category_id: string;
  category_name: string;
  price_bdt: number;
  is_active: boolean;
  available: number;
  sold: number;
  bad: number;
  total: number;
}

export const StockOverview = () => {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const { stock } = await api.get<{ stock: any[] }>("/api/admin/stock");
      setRows((stock ?? []).map((r) => ({
        category_id: r.category_id,
        category_name: r.category_name,
        price_bdt: Number(r.price_bdt),
        is_active: r.is_active,
        available: Number(r.available),
        sold: Number(r.sold),
        bad: Number(r.bad),
        total: Number(r.total),
      })));
    } catch { /* ignore */ }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const totals = rows.reduce(
    (a, r) => ({ available: a.available + r.available, sold: a.sold + r.sold, bad: a.bad + r.bad }),
    { available: 0, sold: 0, bad: 0 },
  );

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="border-border/60 bg-gradient-card p-4">
          <div className="text-xs uppercase tracking-widest text-muted-foreground">Available</div>
          <div className="mt-1 font-display text-2xl font-bold text-primary">{totals.available}</div>
        </Card>
        <Card className="border-border/60 bg-gradient-card p-4">
          <div className="text-xs uppercase tracking-widest text-muted-foreground">Sold</div>
          <div className="mt-1 font-display text-2xl font-bold">{totals.sold}</div>
        </Card>
        <Card className="border-border/60 bg-gradient-card p-4">
          <div className="text-xs uppercase tracking-widest text-muted-foreground">Bad / replaced</div>
          <div className="mt-1 font-display text-2xl font-bold text-warning">{totals.bad}</div>
        </Card>
      </div>

      <Card className="border-border/60 bg-gradient-card p-6">
        <div className="mb-3 flex items-center justify-between">
          <div className="font-display text-lg font-semibold">Stock by category</div>
          <Button size="sm" variant="outline" onClick={load} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </Button>
        </div>
        {loading ? (
          <div className="flex h-32 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-right">Price</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Available</TableHead>
                  <TableHead className="text-right">Sold</TableHead>
                  <TableHead className="text-right">Bad</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.category_id}>
                    <TableCell className="font-medium">{r.category_name}</TableCell>
                    <TableCell className="text-right">৳ {r.price_bdt.toFixed(0)}</TableCell>
                    <TableCell>
                      {r.is_active ? <Badge className="bg-success/15 text-success">active</Badge>
                        : <Badge variant="outline" className="text-muted-foreground">hidden</Badge>}
                    </TableCell>
                    <TableCell className="text-right font-display font-semibold text-primary">{r.available}</TableCell>
                    <TableCell className="text-right">{r.sold}</TableCell>
                    <TableCell className="text-right text-warning">{r.bad}</TableCell>
                    <TableCell className="text-right text-muted-foreground">{r.total}</TableCell>
                  </TableRow>
                ))}
                {rows.length === 0 && (
                  <TableRow><TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">No data</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>
    </div>
  );
};