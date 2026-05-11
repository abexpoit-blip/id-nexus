import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Loader2, Search, RefreshCcw, XCircle, Download } from "lucide-react";
import { toast } from "sonner";

interface OrderRow {
  id: string;
  buyer_id: string;
  buyer_email: string | null;
  buyer_name: string | null;
  category_name: string | null;
  quantity: number;
  unit_price_bdt: number;
  total_bdt: number;
  status: string;
  created_at: string;
}

const statusBadge = (s: string) => {
  const map: Record<string, string> = {
    pending: "bg-warning/20 text-warning",
    completed: "bg-success/20 text-success",
    cancelled: "bg-destructive/20 text-destructive",
    refunded: "bg-muted text-muted-foreground",
    failed: "bg-destructive/20 text-destructive",
  };
  return map[s] ?? "bg-muted text-muted-foreground";
};

export const OrdersManager = () => {
  const [rows, setRows] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const pageSize = 25;
  const [acting, setActing] = useState<OrderRow | null>(null);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkNote, setBulkNote] = useState("");
  const [bulkSubmitting, setBulkSubmitting] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (query.trim()) params.set("q", query.trim());
      if (status !== "all") params.set("status", status);
      params.set("page", String(page));
      params.set("page_size", String(pageSize));
      const r = await api.get<{ rows: OrderRow[]; total: number }>(`/api/admin/orders?${params}`);
      setRows(r.rows ?? []);
      setTotal(r.total ?? 0);
      setSelected(new Set());
    } catch (e: any) { toast.error(e?.message || "Failed to load orders"); }
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [page, status]);

  const submitCancelRefund = async () => {
    if (!acting) return;
    setSubmitting(true);
    try {
      const r = await api.post<{ amount: number; balance_after: number }>(
        `/api/admin/orders/${acting.id}/cancel-refund`,
        { note: note.trim() || null }
      );
      toast.success(`Refunded ৳${r.amount.toFixed(2)} — buyer balance ৳${r.balance_after.toFixed(2)}`);
      setActing(null); setNote(""); load();
    } catch (e: any) { toast.error(e?.message || "Failed"); }
    finally { setSubmitting(false); }
  };

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const eligible = rows.filter((o) => o.status !== "cancelled" && o.status !== "refunded");
  const allSelected = eligible.length > 0 && eligible.every((o) => selected.has(o.id));
  const toggleAll = () => {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(eligible.map((o) => o.id)));
  };
  const toggleOne = (id: string) => {
    const n = new Set(selected); n.has(id) ? n.delete(id) : n.add(id); setSelected(n);
  };
  const submitBulk = async () => {
    if (selected.size === 0) return;
    setBulkSubmitting(true);
    try {
      const r = await api.post<{ results: { ok: boolean; amount?: number }[] }>(
        "/api/admin/orders/bulk-cancel-refund",
        { ids: Array.from(selected), note: bulkNote.trim() || null }
      );
      const ok = r.results.filter((x) => x.ok).length;
      const refunded = r.results.reduce((s, x) => s + (x.ok ? Number(x.amount || 0) : 0), 0);
      toast.success(`Refunded ${ok} order(s) · ৳${refunded.toFixed(2)}`);
      setBulkOpen(false); setBulkNote(""); load();
    } catch (e: any) { toast.error(e?.message || "Failed"); }
    finally { setBulkSubmitting(false); }
  };

  return (
    <Card className="border-border/60 bg-gradient-card p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-semibold">Orders</h2>
          <p className="text-xs text-muted-foreground">
            Manually cancel & refund completed orders. Accounts return to the available pool.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {selected.size > 0 && (
            <Button
              size="sm"
              variant="outline"
              className="border-destructive/40 text-destructive hover:text-destructive"
              onClick={() => setBulkOpen(true)}
            >
              <XCircle className="mr-1 h-4 w-4" /> Bulk refund ({selected.size})
            </Button>
          )}
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search email, order id, buyer id..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && (setPage(1), load())}
              className="w-72 pl-8"
            />
          </div>
          <Select value={status} onValueChange={(v) => { setStatus(v); setPage(1); }}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
              <SelectItem value="refunded">Refunded</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={() => { setPage(1); load(); }}>
            <RefreshCcw className="mr-2 h-4 w-4" /> Refresh
          </Button>
          <Button variant="outline" size="sm"
            onClick={() => api.download("/api/admin/exports/orders.csv",
              `orders-${new Date().toISOString().slice(0,10)}.csv`,
              { status: status === "all" ? undefined : status })
              .catch((e:any)=>toast.error(e?.message||"Export failed"))}>
            <Download className="mr-2 h-4 w-4" /> Export CSV
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex h-32 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : rows.length === 0 ? (
        <div className="py-12 text-center text-sm text-muted-foreground">No orders match.</div>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox checked={allSelected} onCheckedChange={toggleAll} />
                </TableHead>
                <TableHead>Order</TableHead>
                <TableHead>Buyer</TableHead>
                <TableHead>Category</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Placed</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((o) => (
                <TableRow key={o.id}>
                  <TableCell>
                    <Checkbox
                      checked={selected.has(o.id)}
                      onCheckedChange={() => toggleOne(o.id)}
                      disabled={o.status === "cancelled" || o.status === "refunded"}
                    />
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">#{o.id.slice(0, 8)}</TableCell>
                  <TableCell>
                    <div className="text-sm">{o.buyer_name || o.buyer_email || "—"}</div>
                    <div className="font-mono text-xs text-muted-foreground">{o.buyer_email}</div>
                  </TableCell>
                  <TableCell className="text-sm">{o.category_name ?? "—"}</TableCell>
                  <TableCell className="text-right text-sm">{o.quantity}</TableCell>
                  <TableCell className="text-right text-sm">৳{Number(o.total_bdt).toFixed(2)}</TableCell>
                  <TableCell><Badge className={statusBadge(o.status) + " capitalize"}>{o.status}</Badge></TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {new Date(o.created_at).toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-destructive/40 text-destructive hover:text-destructive"
                      onClick={() => { setActing(o); setNote(""); }}
                      disabled={o.status === "cancelled" || o.status === "refunded"}
                    >
                      <XCircle className="mr-1 h-3 w-3" /> Cancel & refund
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
        <div>{total.toLocaleString()} orders</div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Prev</Button>
          <span>Page {page} / {totalPages}</span>
          <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button>
        </div>
      </div>

      <Dialog open={!!acting} onOpenChange={(o) => !o && setActing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel & refund order</DialogTitle>
            <DialogDescription>
              Refunds <b>৳{acting ? Number(acting.total_bdt).toFixed(2) : "0.00"}</b> to {acting?.buyer_email ?? "buyer"}{" "}
              and returns the {acting?.quantity ?? 0} account(s) to the available pool. This is auditable and cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            placeholder="Reason / internal note (optional)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setActing(null)} disabled={submitting}>Cancel</Button>
            <Button
              onClick={submitCancelRefund}
              disabled={submitting}
              className="bg-destructive hover:bg-destructive/90"
            >
              {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Confirm refund
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={bulkOpen} onOpenChange={setBulkOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Bulk cancel & refund</DialogTitle>
            <DialogDescription>
              Refund <b>{selected.size}</b> selected order(s) and return all related accounts to the pool.
              This is auditable and cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            placeholder="Reason / internal note (optional)"
            value={bulkNote}
            onChange={(e) => setBulkNote(e.target.value)}
            rows={3}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkOpen(false)} disabled={bulkSubmitting}>Cancel</Button>
            <Button
              onClick={submitBulk}
              disabled={bulkSubmitting}
              className="bg-destructive hover:bg-destructive/90"
            >
              {bulkSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Confirm bulk refund
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
};
