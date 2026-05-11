import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/layout/AppShell";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, Copy, Download, ShieldCheck, Calendar, ArrowLeft } from "lucide-react";
import { toast } from "sonner";

interface AccountRow {
  uid: string;
  password: string;
  two_fa: string | null;
  email: string | null;
  email_password: string | null;
}

const VpnOrderDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [order, setOrder] = useState<any>(null);
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [brandLogo, setBrandLogo] = useState<string | null>(null);
  const [brandName, setBrandName] = useState<string>("");
  const [categoryName, setCategoryName] = useState<string>("");
  const [durationDays, setDurationDays] = useState<number | null>(null);

  useEffect(() => {
    if (!id) return;
    (async () => {
      const { data: o, error } = await supabase
        .from("orders")
        .select("id, quantity, unit_price_bdt, total_bdt, status, created_at, category_id")
        .eq("id", id)
        .maybeSingle();
      if (error || !o) { toast.error("Order not found"); setLoading(false); return; }
      setOrder(o);

      const [{ data: items }, { data: cat }] = await Promise.all([
        supabase
          .from("order_items")
          .select("accounts(uid, password, two_fa, email, email_password)")
          .eq("order_id", id),
        supabase
          .from("categories")
          .select("name, duration_days, brand_id, vpn_brands(name, logo_url)")
          .eq("id", o.category_id)
          .maybeSingle(),
      ]);

      setAccounts((items ?? []).map((it: any) => it.accounts).filter(Boolean));
      if (cat) {
        setCategoryName((cat as any).name);
        setDurationDays((cat as any).duration_days);
        const brand = (cat as any).vpn_brands;
        if (brand) { setBrandName(brand.name); setBrandLogo(brand.logo_url); }
      }
      setLoading(false);
    })();
  }, [id]);

  const expiresAt = useMemo(() => {
    if (!order || !durationDays) return null;
    return new Date(new Date(order.created_at).getTime() + durationDays * 86_400_000);
  }, [order, durationDays]);

  const deliveryText = useMemo(() => {
    if (!order) return "";
    const header = `${brandName || categoryName}${durationDays ? ` — ${durationDays} days` : ""}`;
    const body = accounts
      .map((a, i) => {
        const lines = [`#${i + 1}`];
        if (a.email) lines.push(`Email: ${a.email}`);
        lines.push(`Username: ${a.uid}`);
        lines.push(`Password: ${a.password}`);
        if (a.two_fa) lines.push(`2FA: ${a.two_fa}`);
        if (a.email_password) lines.push(`Email pwd: ${a.email_password}`);
        return lines.join("\n");
      })
      .join("\n\n");
    const footer = expiresAt ? `\n\nExpires: ${expiresAt.toLocaleDateString()}` : "";
    return `${header}\n${"─".repeat(28)}\n${body}${footer}`;
  }, [order, accounts, brandName, categoryName, durationDays, expiresAt]);

  const copyAll = async () => {
    try { await navigator.clipboard.writeText(deliveryText); toast.success("Copied to clipboard"); }
    catch { toast.error("Copy failed"); }
  };

  const downloadTxt = () => {
    const blob = new Blob([deliveryText], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `vpn-${(brandName || "order").toLowerCase().replace(/\s+/g, "-")}-${id?.slice(0, 8)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <AppShell mode="buyer" title="VPN order" subtitle="Your premium VPN credentials">
      <Button variant="ghost" size="sm" onClick={() => navigate("/vpn")} className="mb-4">
        <ArrowLeft className="mr-1.5 h-4 w-4" /> Back to VPN
      </Button>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
      ) : !order ? (
        <Card className="p-8 text-center text-muted-foreground">Order not found.</Card>
      ) : (
        <div className="space-y-6">
          <Card className="overflow-hidden border-border/60 bg-gradient-card shadow-card">
            <div className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-4">
                <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-border/40 bg-background/60">
                  {brandLogo ? (
                    <img src={brandLogo} alt={brandName} width={64} height={64} loading="lazy" className="h-full w-full object-contain" />
                  ) : (
                    <ShieldCheck className="h-8 w-8 text-primary" />
                  )}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h1 className="font-display text-2xl font-bold">{brandName || categoryName}</h1>
                    {durationDays && <Badge className="bg-primary/20 text-primary hover:bg-primary/20">{durationDays} days</Badge>}
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Ordered {new Date(order.created_at).toLocaleString()}
                  </p>
                </div>
              </div>
              <div className="text-right">
                <div className="text-xs uppercase tracking-wider text-muted-foreground">Total paid</div>
                <div className="font-display text-2xl font-bold text-primary">৳ {Number(order.total_bdt).toFixed(2)}</div>
              </div>
            </div>
            {expiresAt && (
              <div className="flex items-center gap-2 border-t border-border/40 bg-background/30 px-6 py-3 text-sm">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">Expires</span>
                <span className="font-medium">{expiresAt.toLocaleDateString()}</span>
              </div>
            )}
          </Card>

          <Card className="border-border/60 bg-gradient-card p-6 shadow-card">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-display text-lg font-semibold">Credentials</h2>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={copyAll}>
                  <Copy className="mr-1.5 h-4 w-4" /> Copy all
                </Button>
                <Button size="sm" variant="outline" onClick={downloadTxt}>
                  <Download className="mr-1.5 h-4 w-4" /> .txt
                </Button>
              </div>
            </div>
            <pre className="whitespace-pre-wrap rounded-lg border border-border/40 bg-background/60 p-4 font-mono text-sm leading-relaxed">
{deliveryText}
            </pre>
            <p className="mt-3 text-xs text-muted-foreground">
              ⚠ VPN orders are final — no replacements. Save these credentials immediately.
            </p>
          </Card>
        </div>
      )}
    </AppShell>
  );
};

export default VpnOrderDetail;