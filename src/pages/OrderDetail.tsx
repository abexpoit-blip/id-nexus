import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ArrowLeft, Copy, Download, Loader2, RefreshCcw, Clock, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import { useNavigate } from "react-router-dom";

interface OrderRow {
  id: string;
  quantity: number;
  unit_price_bdt: number;
  total_bdt: number;
  status: string;
  created_at: string;
  category_id: string;
}

interface AccountRow {
  uid: string;
  password: string;
  two_fa: string | null;
  email: string | null;
  email_password: string | null;
}

const OrderDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [order, setOrder] = useState<OrderRow | null>(null);
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [categoryName, setCategoryName] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState<number>(Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!id) return;
    const load = async () => {
      const { data: orderData, error: oErr } = await supabase
        .from("orders")
        .select("id, quantity, unit_price_bdt, total_bdt, status, created_at, category_id")
        .eq("id", id)
        .single();
      if (oErr || !orderData) {
        toast.error("Order not found");
        setLoading(false);
        return;
      }
      setOrder(orderData as OrderRow);

      const [{ data: items }, { data: cat }] = await Promise.all([
        supabase
          .from("order_items")
          .select("account_id, accounts(uid, password, two_fa, email, email_password)")
          .eq("order_id", id),
        supabase.from("categories").select("name").eq("id", orderData.category_id).single(),
      ]);

      setAccounts(
        (items ?? [])
          .map((it: any) => it.accounts)
          .filter(Boolean) as AccountRow[],
      );
      setCategoryName(cat?.name ?? "");
      setLoading(false);
    };
    load();
  }, [id]);

  const copyAll = () => {
    const text = accounts
      .map((a) =>
        [a.uid, a.password, a.two_fa ?? "", a.email ?? "", a.email_password ?? ""]
          .filter(Boolean)
          .join("|"),
      )
      .join("\n");
    navigator.clipboard.writeText(text);
    toast.success("Copied all accounts");
  };

  const downloadExcel = () => {
    const ws = XLSX.utils.json_to_sheet(
      accounts.map((a) => ({
        UID: a.uid,
        Password: a.password,
        "2FA": a.two_fa ?? "",
        Email: a.email ?? "",
        "Email Password": a.email_password ?? "",
      })),
    );
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Order");
    XLSX.writeFile(wb, `order-${order?.id.slice(0, 8)}.xlsx`);
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }
  if (!order) return null;

  // Replacement window: 2h for orders <=10 IDs, 6h for larger
  const windowHours = order.quantity <= 10 ? 2 : 6;
  const orderTime = new Date(order.created_at).getTime();
  const expiresAt = orderTime + windowHours * 60 * 60 * 1000;
  const remainingMs = Math.max(0, expiresAt - now);
  const expired = remainingMs <= 0;
  const remainingH = Math.floor(remainingMs / (60 * 60 * 1000));
  const remainingM = Math.floor((remainingMs % (60 * 60 * 1000)) / (60 * 1000));

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-xl">
        <div className="container flex h-16 items-center justify-between">
          <div className="flex items-center gap-4">
            <Link to="/dashboard" className="text-sm text-muted-foreground hover:text-foreground">
              <ArrowLeft className="inline h-4 w-4" /> Dashboard
            </Link>
            <Logo size="sm" showTagline={false} />
          </div>
        </div>
      </header>

      <main className="container py-8">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl font-bold">Order #{order.id.slice(0, 8)}</h1>
            <p className="text-sm text-muted-foreground">
              {categoryName} · {new Date(order.created_at).toLocaleString()}
            </p>
          </div>
          <Badge className="bg-success/20 capitalize text-success hover:bg-success/20">{order.status}</Badge>
        </div>

        <div className="mb-6 grid gap-4 md:grid-cols-3">
          <Card className="border-border/60 bg-gradient-card p-4">
            <div className="text-xs uppercase tracking-widest text-muted-foreground">Quantity</div>
            <div className="mt-1 font-display text-2xl font-semibold">{order.quantity}</div>
          </Card>
          <Card className="border-border/60 bg-gradient-card p-4">
            <div className="text-xs uppercase tracking-widest text-muted-foreground">Unit price</div>
            <div className="mt-1 font-display text-2xl font-semibold">৳ {Number(order.unit_price_bdt).toFixed(2)}</div>
          </Card>
          <Card className="border-border/60 bg-gradient-card p-4">
            <div className="text-xs uppercase tracking-widest text-muted-foreground">Total paid</div>
            <div className="mt-1 font-display text-2xl font-semibold text-primary">৳ {Number(order.total_bdt).toFixed(2)}</div>
          </Card>
        </div>

        <div className="mb-4 flex flex-wrap gap-2">
          <Button onClick={copyAll} variant="outline">
            <Copy className="mr-2 h-4 w-4" /> Copy all
          </Button>
          <Button onClick={downloadExcel} className="bg-gradient-brand text-primary-foreground hover:opacity-90">
            <Download className="mr-2 h-4 w-4" /> Download Excel
          </Button>
          {expired ? (
            <Button
              variant="outline"
              disabled
              className="border-muted/40 text-muted-foreground"
              title={`Replacement window of ${windowHours}h has expired`}
            >
              <Clock className="mr-2 h-4 w-4" /> 6 hour expired
            </Button>
          ) : (
            <Button
              variant="outline"
              onClick={() => navigate("/replacements")}
              className="border-warning/40 text-warning hover:text-warning"
            >
              <RefreshCcw className="mr-2 h-4 w-4" /> Report bad IDs
              <span className="ml-2 rounded bg-warning/15 px-1.5 py-0.5 text-[10px] font-medium">
                {remainingH}h {remainingM}m left
              </span>
            </Button>
          )}
        </div>

        <div className={`mb-4 flex items-center gap-2 rounded-md border px-3 py-2 text-xs ${
          expired ? "border-muted bg-muted/30 text-muted-foreground" : "border-warning/30 bg-warning/5 text-warning"
        }`}>
          {expired ? <CheckCircle2 className="h-4 w-4" /> : <Clock className="h-4 w-4" />}
          {expired ? (
            <span>
              Replacement window of <b>{windowHours} hours</b> has expired for this order.
              Reports filed now will be marked out-of-window.
            </span>
          ) : (
            <span>
              You have <b>{remainingH}h {remainingM}m</b> left to report bad IDs from this order
              (window: {windowHours} hours after purchase).
            </span>
          )}
        </div>

        <Card className="overflow-hidden border-border/60 bg-gradient-card">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>UID</TableHead>
                  <TableHead>Password</TableHead>
                  <TableHead>2FA</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Email pass</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {accounts.map((a, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-mono text-xs">{a.uid}</TableCell>
                    <TableCell className="font-mono text-xs">{a.password}</TableCell>
                    <TableCell className="font-mono text-xs">{a.two_fa ?? "—"}</TableCell>
                    <TableCell className="font-mono text-xs">{a.email ?? "—"}</TableCell>
                    <TableCell className="font-mono text-xs">{a.email_password ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      </main>
    </div>
  );
};

export default OrderDetail;