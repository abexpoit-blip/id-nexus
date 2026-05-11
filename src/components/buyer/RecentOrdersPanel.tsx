import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Download, Copy, FileSpreadsheet, ShoppingBag, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface OrderRow {
  id: string;
  created_at: string;
  quantity: number;
  total_bdt: number;
  unit_price_bdt: number;
  category_name: string;
}

interface AccountRow {
  uid: string;
  password: string;
  two_fa: string | null;
  email: string | null;
  email_password: string | null;
}

const formatTime = (iso: string) => new Date(iso).toLocaleString();

const csvEscape = (v: string | null | undefined) => {
  if (v === null || v === undefined) return "";
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const buildCsv = (rows: AccountRow[]) => {
  const header = ["UID", "Password", "2FA", "Email", "Email Password"];
  const lines = [header.join(",")];
  rows.forEach((r) => {
    lines.push([r.uid, r.password, r.two_fa, r.email, r.email_password].map(csvEscape).join(","));
  });
  return lines.join("\n");
};

const downloadFile = (content: string, filename: string, mime: string) => {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

interface Props {
  userId: string;
}

export const RecentOrdersPanel = ({ userId }: Props) => {
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const since = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
      const { data, error } = await supabase
        .from("orders")
        .select("id, created_at, quantity, total_bdt, unit_price_bdt, category_id, categories(name)")
        .eq("buyer_id", userId)
        .gte("created_at", since)
        .order("created_at", { ascending: false });
      if (error) {
        toast.error("Could not load recent orders");
        setLoading(false);
        return;
      }
      setOrders(
        (data ?? []).map((o: any) => ({
          id: o.id,
          created_at: o.created_at,
          quantity: o.quantity,
          total_bdt: Number(o.total_bdt),
          unit_price_bdt: Number(o.unit_price_bdt),
          category_name: o.categories?.name ?? "—",
        })),
      );
      setLoading(false);
    };
    load();
  }, [userId]);

  const fetchAccounts = async (orderId: string): Promise<AccountRow[] | null> => {
    const { data, error } = await supabase
      .from("order_items")
      .select("accounts(uid, password, two_fa, email, email_password)")
      .eq("order_id", orderId);
    if (error) {
      toast.error("Could not load order details");
      return null;
    }
    return (data ?? [])
      .map((row: any) => row.accounts)
      .filter(Boolean) as AccountRow[];
  };

  const handleDownload = async (order: OrderRow) => {
    setBusyId(order.id);
    const rows = await fetchAccounts(order.id);
    setBusyId(null);
    if (!rows || rows.length === 0) {
      toast.error("No accounts found for this order");
      return;
    }
    const csv = buildCsv(rows);
    const stamp = new Date(order.created_at).toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const filename = `${order.category_name.replace(/\s+/g, "_")}_${stamp}_${order.id.slice(0, 8)}.csv`;
    downloadFile(csv, filename, "text/csv;charset=utf-8");
    toast.success(`Downloaded ${rows.length} accounts as CSV`);
  };

  const handleCopy = async (order: OrderRow) => {
    setBusyId(order.id);
    const rows = await fetchAccounts(order.id);
    setBusyId(null);
    if (!rows || rows.length === 0) {
      toast.error("No accounts found");
      return;
    }
    const text = rows.map((r) => `${r.uid}:${r.password}`).join("\n");
    await navigator.clipboard.writeText(text);
    toast.success(`Copied ${rows.length} UID:PASS lines`);
  };

  return (
    <Card className="mt-6 border-border/60 bg-gradient-card p-6 shadow-card">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 font-display text-lg font-semibold">
            <FileSpreadsheet className="h-5 w-5 text-primary" />
            Delivered orders (last 48 hours)
          </div>
          <p className="text-sm text-muted-foreground">
            Download CSV or copy UID:PASS for each delivered order.
          </p>
        </div>
        <Badge variant="outline" className="border-primary/40 text-primary">
          {orders.length} order{orders.length === 1 ? "" : "s"}
        </Badge>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-8 text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading orders…
        </div>
      ) : orders.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-md border border-dashed border-border/60 py-10 text-center text-sm text-muted-foreground">
          <ShoppingBag className="h-8 w-8 opacity-50" />
          No orders in the last 48 hours.
          <Link to="/browse" className="text-primary underline-offset-4 hover:underline">
            Browse stock →
          </Link>
        </div>
      ) : (
        <div className="space-y-2">
          {orders.map((o) => (
            <div
              key={o.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border/60 bg-background/40 px-4 py-3"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{o.category_name}</span>
                  <Badge variant="outline" className="text-xs">
                    {o.quantity} × ৳{o.unit_price_bdt}
                  </Badge>
                  <Badge className="bg-success/20 text-success hover:bg-success/20">
                    ৳{o.total_bdt.toFixed(2)}
                  </Badge>
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {formatTime(o.created_at)} · #{o.id.slice(0, 8)}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleCopy(o)}
                  disabled={busyId === o.id}
                >
                  <Copy className="mr-2 h-3.5 w-3.5" /> Copy UID:PASS
                </Button>
                <Button
                  size="sm"
                  onClick={() => handleDownload(o)}
                  disabled={busyId === o.id}
                  className="bg-gradient-brand text-primary-foreground hover:opacity-90"
                >
                  {busyId === o.id ? (
                    <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Download className="mr-2 h-3.5 w-3.5" />
                  )}
                  Download CSV
                </Button>
                <Button size="sm" variant="ghost" asChild>
                  <Link to={`/orders/${o.id}`}>View</Link>
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
};
