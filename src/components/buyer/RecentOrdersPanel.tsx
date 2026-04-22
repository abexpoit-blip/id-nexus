import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Download, Copy, FileSpreadsheet, ShoppingBag, Loader2, Send, CheckCircle2, XCircle } from "lucide-react";
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

const formatTime = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleString();
};

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

type DeliveryStatus = "pending" | "sending" | "sent" | "failed";
interface DeliveryRow {
  status: DeliveryStatus;
  attempt_count: number;
  last_error: string | null;
  sent_at: string | null;
  last_attempt_at: string | null;
}
type StatusMap = Record<string, DeliveryRow>;

interface Props {
  userId: string;
  telegramLinked: boolean;
  template: "compact" | "detailed";
}

const buildTelegramText = (
  template: "compact" | "detailed",
  order: OrderRow,
  rows: AccountRow[],
) => {
  const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  if (template === "compact") {
    const lines = rows.map((r) => `${r.uid}:${r.password}`).join("\n");
    return `<pre>${escape(lines)}</pre>`;
  }
  // detailed
  const header =
    `<b>${escape(order.category_name)}</b> — ${rows.length} account${rows.length === 1 ? "" : "s"}\n` +
    `#${order.id.slice(0, 8)} · ৳${order.total_bdt.toFixed(2)}`;
  const body = rows
    .map((r) => {
      const parts = [`${r.uid}:${r.password}`];
      if (r.two_fa) parts.push(`2FA: ${r.two_fa}`);
      if (r.email) parts.push(`Email: ${r.email}${r.email_password ? ` | ${r.email_password}` : ""}`);
      return parts.join("\n");
    })
    .join("\n\n");
  return `${header}\n\n<pre>${escape(body)}</pre>`;
};

export const RecentOrdersPanel = ({ userId, telegramLinked, template }: Props) => {
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [statuses, setStatuses] = useState<StatusMap>({});

  const fetchStatuses = useCallback(async (orderIds: string[]) => {
    if (orderIds.length === 0) return;
    const { data } = await supabase
      .from("telegram_deliveries")
      .select("order_id, status, attempt_count, last_error, sent_at, last_attempt_at")
      .in("order_id", orderIds);
    const map: StatusMap = {};
    (data ?? []).forEach((r: any) => {
      map[r.order_id] = {
        status: r.status,
        attempt_count: r.attempt_count,
        last_error: r.last_error,
        sent_at: r.sent_at,
        last_attempt_at: r.last_attempt_at,
      };
    });
    setStatuses(map);
  }, []);

  const upsertStatus = async (
    orderId: string,
    patch: Partial<DeliveryRow> & { status: DeliveryStatus; bumpAttempt?: boolean },
  ) => {
    const prev = statuses[orderId];
    const nextAttempt = (prev?.attempt_count ?? 0) + (patch.bumpAttempt ? 1 : 0);
    const row: DeliveryRow = {
      status: patch.status,
      attempt_count: nextAttempt,
      last_error: patch.last_error ?? null,
      sent_at: patch.status === "sent" ? new Date().toISOString() : prev?.sent_at ?? null,
      last_attempt_at: new Date().toISOString(),
    };
    setStatuses((s) => ({ ...s, [orderId]: row }));
    await supabase.from("telegram_deliveries").upsert(
      {
        order_id: orderId,
        buyer_id: userId,
        status: row.status,
        attempt_count: row.attempt_count,
        last_error: row.last_error,
        sent_at: row.sent_at,
        last_attempt_at: row.last_attempt_at,
      },
      { onConflict: "order_id" },
    );
  };

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
      await fetchStatuses((data ?? []).map((o: any) => o.id));
    };
    load();
  }, [userId, fetchStatuses]);

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

  const handleTelegram = async (order: OrderRow) => {
    setBusyId(order.id);
    updateStatus(order.id, { status: "sending" });
    const rows = await fetchAccounts(order.id);
    if (!rows || rows.length === 0) {
      setBusyId(null);
      updateStatus(order.id, { status: "failed", error: "No accounts found" });
      toast.error("No accounts found");
      return;
    }
    // Compact, mobile-copy-friendly: only UID:PASS lines inside a code block.
    // <pre> renders monospace; tap-and-hold "Copy" in Telegram grabs the whole block cleanly.
    const lines = rows.map((r) => `${r.uid}:${r.password}`).join("\n");
    const text = `<pre>${lines}</pre>`;
    const { data, error } = await supabase.functions.invoke("notify-telegram", {
      body: { user_id: userId, text },
    });
    setBusyId(null);
    if (error) {
      updateStatus(order.id, { status: "failed", error: error.message });
      toast.error(error.message || "Telegram send failed");
      return;
    }
    if (data && (data as any).ok === false) {
      updateStatus(order.id, { status: "failed", error: "Telegram not linked" });
      toast.error("Link your Telegram account first (see Dashboard).");
      return;
    }
    updateStatus(order.id, { status: "sent" });
    toast.success(`Sent ${rows.length} credentials to your Telegram`);
  };

  return (
    <Card className="mt-6 border-border/60 bg-gradient-card p-6 shadow-card">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 font-display text-lg font-semibold">
            <FileSpreadsheet className="h-5 w-5 text-primary" />
            Delivered orders (last 48 hours)
          </div>
          <p className="text-sm text-muted-foreground">
            Download CSV (Excel-compatible) or copy UID:PASS for each order. Older orders remain accessible from the order page.
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
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span>{formatTime(o.created_at)} · #{o.id.slice(0, 8)}</span>
                  {(() => {
                    const s = statuses[o.id];
                    if (!s) return null;
                    if (s.status === "sending")
                      return (
                        <Badge variant="outline" className="border-primary/40 text-primary">
                          <Loader2 className="mr-1 h-3 w-3 animate-spin" /> Sending…
                        </Badge>
                      );
                    if (s.status === "sent")
                      return (
                        <Badge className="bg-success/20 text-success hover:bg-success/20">
                          <CheckCircle2 className="mr-1 h-3 w-3" /> Sent to Telegram
                          {s.at ? ` · ${new Date(s.at).toLocaleTimeString()}` : ""}
                        </Badge>
                      );
                    if (s.status === "failed")
                      return (
                        <Badge variant="destructive" title={s.error}>
                          <XCircle className="mr-1 h-3 w-3" /> Failed
                        </Badge>
                      );
                    return null;
                  })()}
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
                  variant="outline"
                  onClick={() => handleTelegram(o)}
                  disabled={busyId === o.id}
                >
                  {busyId === o.id && statuses[o.id]?.status === "sending" ? (
                    <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Send className="mr-2 h-3.5 w-3.5" />
                  )}
                  {statuses[o.id]?.status === "sent"
                    ? "Resend to Telegram"
                    : statuses[o.id]?.status === "failed"
                    ? "Retry Telegram"
                    : "Send to Telegram"}
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