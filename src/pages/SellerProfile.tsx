import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "@/lib/api";
import { AppShell } from "@/components/layout/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Gem, Crown, Medal, Award, ShieldCheck, Loader2, ArrowLeft, Boxes } from "lucide-react";

interface SellerInfo {
  seller_id: string;
  display_name: string;
  email: string;
  joined_at: string;
  is_banned: boolean;
  sales_lifetime: number;
  sales_30d: number;
  revenue_lifetime: number;
  replacements_total: number;
  replacements_upheld: number;
  available_stock: number;
  tier: "vip" | "gold" | "silver" | "bronze" | "none";
  reliability_pct: number;
}

const tierMeta: Record<string, { icon: any; label: string; cls: string; bg: string }> = {
  vip:    { icon: Gem,    label: "VIP seller",    cls: "text-primary",          bg: "bg-primary/15" },
  gold:   { icon: Crown,  label: "Gold seller",   cls: "text-warning",          bg: "bg-warning/15" },
  silver: { icon: Medal,  label: "Silver seller", cls: "text-muted-foreground", bg: "bg-muted" },
  bronze: { icon: Award,  label: "Bronze seller", cls: "text-accent",           bg: "bg-accent/15" },
  none:   { icon: ShieldCheck, label: "New seller", cls: "text-muted-foreground", bg: "bg-muted" },
};

const SellerProfile = () => {
  const { id } = useParams<{ id: string }>();
  const [s, setS] = useState<SellerInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    api.get<{ seller: SellerInfo }>(`/api/seller/profile/${id}`)
      .then((r) => setS(r.seller))
      .catch((e) => setError(e?.message || "Failed to load seller"))
      .finally(() => setLoading(false));
  }, [id]);

  return (
    <AppShell mode="buyer" title="Seller profile" subtitle="Public reputation and stats">
      <div className="mb-4">
        <Button asChild variant="ghost" size="sm">
          <Link to="/browse"><ArrowLeft className="mr-1 h-4 w-4" /> Back to stock</Link>
        </Button>
      </div>

      {loading ? (
        <div className="flex h-40 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : error || !s ? (
        <Card className="p-8 text-center text-muted-foreground">{error ?? "Seller not found."}</Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="glass-panel-strong border-0 lg:col-span-2 p-6">
            <div className="flex items-start gap-4">
              <div className={`rounded-lg p-3 ${tierMeta[s.tier].bg}`}>
                {(() => { const Icon = tierMeta[s.tier].icon; return <Icon className={`h-7 w-7 ${tierMeta[s.tier].cls}`} />; })()}
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="font-display text-2xl font-bold">{s.display_name}</h2>
                <div className="mt-1 text-sm text-muted-foreground">
                  Member since {new Date(s.joined_at).toLocaleDateString()}
                </div>
                <div className={`mt-2 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${tierMeta[s.tier].bg} ${tierMeta[s.tier].cls}`}>
                  {tierMeta[s.tier].label}
                </div>
                {s.is_banned && (
                  <div className="mt-2 inline-flex items-center gap-1 rounded-full border border-destructive/40 bg-destructive/10 px-3 py-1 text-xs font-semibold text-destructive">
                    Suspended
                  </div>
                )}
              </div>
            </div>
          </Card>
          <Card className="glass-panel border-0 p-6">
            <div className="text-xs uppercase tracking-widest text-muted-foreground">Reliability</div>
            <div className="text-gold mt-2 font-display text-4xl font-bold">{s.reliability_pct}%</div>
            <p className="mt-2 text-xs text-muted-foreground">
              Share of accounts with no upheld replacement claim.
            </p>
          </Card>

          <Card className="glass-panel border-0 p-5">
            <div className="text-xs uppercase tracking-widest text-muted-foreground">Lifetime sales</div>
            <div className="text-gold mt-1 font-display text-2xl font-bold">{s.sales_lifetime}</div>
          </Card>
          <Card className="glass-panel border-0 p-5">
            <div className="text-xs uppercase tracking-widest text-muted-foreground">Sales (30d)</div>
            <div className="mt-1 font-display text-2xl font-bold">{s.sales_30d}</div>
          </Card>
          <Card className="glass-panel border-0 p-5">
            <div className="text-xs uppercase tracking-widest text-muted-foreground">Available stock</div>
            <div className="mt-1 flex items-center gap-2 font-display text-2xl font-bold">
              <Boxes className="h-5 w-5 text-muted-foreground" /> {s.available_stock}
            </div>
          </Card>

          <Card className="glass-panel border-0 lg:col-span-3 p-5">
            <div className="grid gap-4 md:grid-cols-3">
              <div>
                <div className="text-xs uppercase tracking-widest text-muted-foreground">Lifetime revenue</div>
                <div className="text-gold mt-1 font-display text-xl font-semibold">৳ {Number(s.revenue_lifetime).toFixed(0)}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-widest text-muted-foreground">Replacements filed</div>
                <div className="mt-1 font-display text-xl font-semibold">{s.replacements_total}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-widest text-muted-foreground">Replacements upheld</div>
                <div className="mt-1 font-display text-xl font-semibold text-warning">{s.replacements_upheld}</div>
              </div>
            </div>
          </Card>
        </div>
      )}
    </AppShell>
  );
};

export default SellerProfile;