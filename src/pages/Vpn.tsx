import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { ShoppingCart, Loader2, Globe, ShieldCheck, Sparkles, Crown } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/AppShell";

interface PlanCategory {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  price_bdt: number;
  kind: "fb_account" | "vpn";
  brand_id: string | null;
  duration_days: number | null;
  stock?: number;
}

interface Brand {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  description: string | null;
  sort_order: number;
}

const Vpn = () => {
  const { user, profile, roles, refresh } = useAuth();
  const navigate = useNavigate();
  const [brands, setBrands] = useState<Brand[]>([]);
  const [plans, setPlans] = useState<PlanCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<PlanCategory | null>(null);
  const [qty, setQty] = useState<number>(1);
  const [placing, setPlacing] = useState(false);
  const balance = Number(profile?.balance_bdt ?? 0);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [brandsR, catsR] = await Promise.all([
        api.get<{ brands: Brand[] }>("/api/vpn/brands"),
        api.get<{ categories: any[] }>("/api/categories"),
      ]);
      setBrands(brandsR.brands || []);
      setPlans(
        (catsR.categories || [])
          .filter((c: any) => c.kind === "vpn")
          .map((c: any) => ({
            id: c.id,
            slug: c.slug,
            name: c.name,
            description: c.description,
            price_bdt: Number(c.price_bdt),
            kind: c.kind,
            brand_id: c.brand_id,
            duration_days: c.duration_days,
            stock: Number(c.available || 0),
          })),
      );
    } catch {
      toast.error("Failed to load VPN plans");
    }
    setLoading(false);
  };

  useEffect(() => {
    loadAll();
    const t = setInterval(loadAll, 45_000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const openBuy = (cat: PlanCategory) => {
    if (!user) {
      navigate("/login");
      return;
    }
    setSelected(cat);
    setQty(1);
  };

  // Group plans by brand. Plans without a brand_id fall under "Other VPNs".
  const grouped = useMemo(() => {
    const map: Record<string, PlanCategory[]> = {};
    for (const p of plans) {
      const key = p.brand_id ?? "__other__";
      (map[key] ||= []).push(p);
    }
    // Sort each brand's plans by duration ascending
    for (const k of Object.keys(map)) {
      map[k].sort((a, b) => (a.duration_days ?? 0) - (b.duration_days ?? 0));
    }
    return map;
  }, [plans]);

  const visibleBrands = useMemo(
    () => brands.filter((b) => (grouped[b.id] ?? []).length > 0),
    [brands, grouped],
  );
  const otherPlans = grouped["__other__"] ?? [];

  const placeOrder = async () => {
    if (!selected) return;
    if (qty < 1 || qty > (selected.stock ?? 0)) {
      toast.error("Invalid quantity");
      return;
    }
    const total = qty * Number(selected.price_bdt);
    if (balance < total) {
      toast.error("Insufficient balance — please top up.");
      return;
    }
    setPlacing(true);
    try {
      const result: any = await api.post("/api/orders", {
        category_id: selected.id,
        quantity: qty,
      });
      toast.success(
        `Order placed! ${result.quantity} VPN account${result.quantity > 1 ? "s" : ""} delivered for ৳${result.total}`,
      );
      setSelected(null);
      await refresh();
      navigate(`/vpn-orders/${result.order_id}`);
    } catch (e: any) {
      const msg = e?.message || "Order failed";
      if (msg.includes("Insufficient")) toast.error("Insufficient balance");
      else if (msg.includes("Not enough stock")) toast.error("Not enough stock — try a smaller quantity");
      else toast.error(msg);
    } finally {
      setPlacing(false);
    }
  };

  return (
    <AppShell
      mode={roles.includes("seller") && !roles.includes("buyer") ? "seller" : "buyer"}
      title="Premium VPN services"
      subtitle="Trusted brands · Instant delivery · 7 / 15 / 30 day plans. VPN purchases are final — no replacements."
      actions={
        <div className="text-sm">
          <span className="text-muted-foreground">Balance:</span>{" "}
          <span className="font-display font-semibold text-primary">৳ {balance.toFixed(2)}</span>
        </div>
      }
    >
      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : visibleBrands.length === 0 && otherPlans.length === 0 ? (
        <Card className="p-8 text-center text-muted-foreground">
          No VPN services available right now. Check back soon.
        </Card>
      ) : (
        <div className="space-y-8">
          {visibleBrands.map((brand) => {
            const planList = grouped[brand.id] ?? [];
            return <BrandSection key={brand.id} brand={brand} plans={planList} onBuy={openBuy} />;
          })}
          {otherPlans.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Globe className="h-5 w-5 text-muted-foreground" />
                <h2 className="font-display text-xl font-semibold">Other VPNs</h2>
              </div>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {otherPlans.map((p) => (
                  <PlanCard key={p.id} plan={p} onBuy={openBuy} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="bg-card">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Crown className="h-4 w-4 text-primary" />
              Buy {selected?.name}
            </DialogTitle>
            <DialogDescription>
              Pay from your wallet. Delivery is instant.{" "}
              <span className="text-warning font-medium">VPN purchases are final — no replacements.</span>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-md bg-muted/40 p-3">
                <div className="text-xs text-muted-foreground">Unit price</div>
                <div className="font-display text-lg font-semibold">
                  ৳ {Number(selected?.price_bdt ?? 0).toFixed(2)}
                </div>
              </div>
              <div className="rounded-md bg-muted/40 p-3">
                <div className="text-xs text-muted-foreground">Available</div>
                <div className="font-display text-lg font-semibold">{selected?.stock ?? 0}</div>
              </div>
            </div>
            <div>
              <label className="text-sm font-medium">Quantity</label>
              <Input
                type="number"
                min={1}
                max={selected?.stock ?? 1}
                value={qty}
                onChange={(e) => setQty(Math.max(1, parseInt(e.target.value || "1", 10)))}
                className="mt-1.5"
              />
            </div>
            <div className="rounded-md border border-border/60 bg-background/40 p-3">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Total</span>
                <span className="font-display text-lg font-semibold text-primary">
                  ৳ {(qty * Number(selected?.price_bdt ?? 0)).toFixed(2)}
                </span>
              </div>
              <div className="mt-1 flex justify-between text-xs">
                <span className="text-muted-foreground">Your balance</span>
                <span>৳ {balance.toFixed(2)}</span>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setSelected(null)} disabled={placing}>
              Cancel
            </Button>
            <Button
              onClick={placeOrder}
              disabled={placing || (selected?.stock ?? 0) === 0}
              className="bg-gradient-brand text-primary-foreground hover:opacity-90"
            >
              {placing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Confirm purchase
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
};

const BrandSection = ({
  brand,
  plans,
  onBuy,
}: {
  brand: Brand;
  plans: PlanCategory[];
  onBuy: (p: PlanCategory) => void;
}) => {
  const totalStock = plans.reduce((s, p) => s + (p.stock ?? 0), 0);
  return (
    <Card className="overflow-hidden border-border/60 bg-gradient-card shadow-card">
      <div className="flex flex-col gap-4 border-b border-border/40 p-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-border/40 bg-background/60 shadow-inner">
            {brand.logo_url ? (
              <img
                src={brand.logo_url}
                alt={`${brand.name} logo`}
                width={64}
                height={64}
                loading="lazy"
                className="h-full w-full object-contain"
              />
            ) : (
              <ShieldCheck className="h-8 w-8 text-primary" />
            )}
          </div>
          <div>
            <h2 className="font-display text-xl font-semibold">{brand.name}</h2>
            {brand.description && (
              <p className="mt-0.5 text-sm text-muted-foreground line-clamp-1">{brand.description}</p>
            )}
          </div>
        </div>
        <Badge
          className={
            totalStock > 0
              ? "bg-success/20 text-success hover:bg-success/20"
              : "bg-muted text-muted-foreground"
          }
        >
          {totalStock} total in stock
        </Badge>
      </div>
      <div className="grid gap-3 p-4 sm:p-6 md:grid-cols-3">
        {plans.map((plan) => (
          <PlanCard key={plan.id} plan={plan} onBuy={onBuy} />
        ))}
      </div>
    </Card>
  );
};

const PlanCard = ({ plan, onBuy }: { plan: PlanCategory; onBuy: (p: PlanCategory) => void }) => {
  const isMonth = plan.duration_days === 30;
  return (
    <div
      className={`relative rounded-xl border p-4 transition hover:-translate-y-0.5 ${
        isMonth
          ? "border-primary/40 bg-gradient-to-br from-primary/10 via-card to-card shadow-glow"
          : "border-border/60 bg-background/40"
      }`}
    >
      {isMonth && (
        <div className="absolute -top-2 right-3 flex items-center gap-1 rounded-full bg-gradient-brand px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary-foreground shadow">
          <Sparkles className="h-3 w-3" /> Best value
        </div>
      )}
      <div className="flex items-baseline justify-between">
        <div className="font-display text-lg font-semibold">
          {plan.duration_days ? `${plan.duration_days} days` : plan.name}
        </div>
        <Badge variant="outline" className="text-[10px]">
          {plan.stock ?? 0} left
        </Badge>
      </div>
      <div className="mt-2 flex items-end gap-1">
        <span className="font-display text-3xl font-bold text-primary">
          ৳{Number(plan.price_bdt).toFixed(0)}
        </span>
        <span className="mb-1 text-xs text-muted-foreground">/ account</span>
      </div>
      <Button
        size="sm"
        onClick={() => onBuy(plan)}
        disabled={(plan.stock ?? 0) === 0}
        className="mt-3 w-full bg-gradient-brand text-primary-foreground hover:opacity-90"
      >
        <ShoppingCart className="mr-1.5 h-4 w-4" />
        {(plan.stock ?? 0) === 0 ? "Out of stock" : "Buy now"}
      </Button>
    </div>
  );
};

export default Vpn;