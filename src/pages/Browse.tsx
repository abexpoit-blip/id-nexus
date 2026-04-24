import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
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
  const { user, roles } = useAuth();
  const navigate = useNavigate();
  const [categories, setCategories] = useState<Category[]>([]);
  const [balance, setBalance] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Category | null>(null);
  const [qty, setQty] = useState<number>(1);
  const [placing, setPlacing] = useState(false);

  const loadAll = async () => {
    setLoading(true);
    const [{ data: cats }, profileRes, stockRes] = await Promise.all([
      supabase
        .from("categories")
        .select("id, slug, name, description, price_bdt, kind")
        .eq("is_active", true)
        .order("sort_order", { ascending: true }),
      user
        ? supabase.from("profiles").select("balance_bdt").eq("id", user.id).single()
        : Promise.resolve({ data: null } as any),
      // Stock per category — works because RLS lets sellers/admins see only theirs.
      // For public stock count we use an RPC-free trick: count via head request grouped by category
      supabase.rpc("get_public_stock_counts" as any).then(
        (r: any) => r,
        () => ({ data: null }),
      ),
    ]);

    const stockMap: Record<string, number> = {};
    (stockRes?.data ?? []).forEach((row: any) => {
      stockMap[row.category_id] = Number(row.available);
    });

    setCategories((cats ?? []).map((c) => ({ ...c, stock: stockMap[c.id] ?? 0 } as Category)));
    if (profileRes && (profileRes as any).data) {
      setBalance(Number((profileRes as any).data.balance_bdt));
    }
    setLoading(false);
  };

  useEffect(() => {
    loadAll();
    const channel = supabase
      .channel("accounts-stock")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "accounts" },
        () => loadAll(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

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
    const { data, error } = await supabase.rpc("place_order", {
      p_category_id: selected.id,
      p_quantity: qty,
    });
    setPlacing(false);
    if (error) {
      const msg = error.message || "Order failed";
      if (msg.includes("Insufficient")) toast.error("Insufficient balance");
      else if (msg.includes("Not enough stock")) toast.error("Not enough stock — try a smaller quantity");
      else toast.error(msg);
      return;
    }
    const result = data as any;
    toast.success(`Order placed! ${result.quantity} IDs delivered for ৳${result.total}`);
    setSelected(null);
    navigate(`/orders/${result.order_id}`);
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
      subtitle="Live prices set by admin. Stock updates in real-time as sellers upload."
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

      {/* Buy dialog */}
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