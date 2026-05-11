import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { ShoppingCart, Loader2, ShieldCheck, Zap, Globe } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/AppShell";

interface Category {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  price_bdt: number;
  kind: "fb_account" | "vpn";
  stock?: number;
}

const Browse = () => {
  const { user, profile, roles, refresh } = useAuth();
  const navigate = useNavigate();
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Category | null>(null);
  const [qty, setQty] = useState<number>(1);
  const [placing, setPlacing] = useState(false);

  const balance = Number(profile?.balance_bdt ?? 0);

  const loadAll = async () => {
    setLoading(true);
    try {
      const res = await api.get<{ categories: any[] }>("/api/categories");
      const fb = (res.categories ?? [])
        .filter((c) => c.kind === "fb_account")
        .map((c) => ({
          id: c.id,
          slug: c.slug,
          name: c.name,
          description: c.description,
          price_bdt: Number(c.price_bdt),
          kind: c.kind,
          stock: Number(c.available ?? 0),
        }));
      setCategories(fb);
    } catch {
      toast.error("Could not load categories");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
    const timer = setInterval(loadAll, 30_000);
    return () => clearInterval(timer);
  }, []);

  const openBuy = (cat: Category) => {
    if (!user) {
      navigate("/login");
      return;
    }
    setSelected(cat);
    setQty(1);
  };

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
      const result = await api.post<any>("/api/orders", {
        category_id: selected.id,
        quantity: qty,
      });
      toast.success(`Order placed! ${result.quantity} IDs delivered for ৳${result.total}`);
      setSelected(null);
      await Promise.all([refresh(), loadAll()]);
      navigate(`/orders/${result.order_id}`);
    } catch (err: any) {
      const msg = err?.message || "Order failed";
      if (msg.toLowerCase().includes("insufficient")) toast.error("Insufficient balance");
      else if (msg.toLowerCase().includes("stock")) toast.error("Not enough stock — try a smaller quantity");
      else toast.error(msg);
    } finally {
      setPlacing(false);
    }
  };

  const iconFor = (cat: Category) => {
    if (cat.kind === "vpn") return Globe;
    if (cat.slug.includes("1000")) return Zap;
    return ShieldCheck;
  };

  return (
    <AppShell
      mode={roles.includes("seller") && !roles.includes("buyer") ? "seller" : "buyer"}
      title="Browse stock"
      subtitle="Live prices set by admin. Stock updates as sellers upload."
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
        ) : categories.length === 0 ? (
          <Card className="p-8 text-center text-muted-foreground">No categories yet.</Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {categories.map((cat) => {
              const Icon = iconFor(cat);
              return (
                <Card
                  key={cat.id}
                  className="border-border/60 bg-gradient-card p-6 shadow-card transition hover:-translate-y-0.5 hover:shadow-glow"
                >
                  <div className="flex items-start justify-between">
                    <div className="rounded-lg bg-gradient-brand p-2 text-primary-foreground">
                      <Icon className="h-5 w-5" />
                    </div>
                    <Badge
                      className={
                        (cat.stock ?? 0) > 0
                          ? "bg-success/20 text-success hover:bg-success/20"
                          : "bg-muted text-muted-foreground"
                      }
                    >
                      {cat.stock ?? 0} in stock
                    </Badge>
                  </div>
                  <h3 className="mt-4 font-display text-lg font-semibold">{cat.name}</h3>
                  {cat.description && (
                    <p className="mt-1 text-sm text-muted-foreground line-clamp-2">{cat.description}</p>
                  )}
                  <div className="mt-4 flex items-end justify-between">
                    <div>
                      <div className="font-display text-2xl font-bold text-primary">
                        ৳ {Number(cat.price_bdt).toFixed(0)}
                      </div>
                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">per pc</div>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => openBuy(cat)}
                      disabled={(cat.stock ?? 0) === 0}
                      className="bg-gradient-brand text-primary-foreground hover:opacity-90"
                    >
                      <ShoppingCart className="mr-1.5 h-4 w-4" /> Buy
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>
        )}

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="bg-card">
          <DialogHeader>
            <DialogTitle>Buy {selected?.name}</DialogTitle>
            <DialogDescription>
              Pay from your wallet. Delivery is instant — IDs appear in your order page.
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

export default Browse;
