import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { BrandFooter } from "@/components/BrandFooter";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Wallet,
  ShoppingBag,
  RefreshCcw,
  Upload,
  ArrowUpRight,
  Sparkles,
  Crown,
  Shield,
  TrendingUp,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { RecentOrdersPanel } from "@/components/buyer/RecentOrdersPanel";
import { AppShell } from "@/components/layout/AppShell";

interface Profile {
  display_name: string | null;
  email: string | null;
  balance_bdt: number;
}

const Dashboard = () => {
  const { user, roles } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ orders: 0, pendingReplacements: 0, lifetimeSpent: 0 });

  useEffect(() => {
    if (!user) return;
    supabase
      .from("profiles")
      .select("display_name, email, balance_bdt")
      .eq("id", user.id)
      .single()
      .then(({ data, error }) => {
        if (error) toast.error("Could not load profile");
        else setProfile(data as Profile);
        setLoading(false);
      });
  }, [user]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const [ordersRes, repsRes, ledgerRes] = await Promise.all([
        supabase
          .from("orders")
          .select("id", { count: "exact", head: true })
          .eq("buyer_id", user.id),
        supabase
          .from("replacement_items")
          .select("id", { count: "exact", head: true })
          .eq("buyer_id", user.id)
          .eq("outcome", "pending"),
        supabase
          .from("balance_ledger")
          .select("amount_bdt")
          .eq("user_id", user.id)
          .eq("kind", "purchase"),
      ]);
      if (cancelled) return;
      const lifetime = (ledgerRes.data ?? []).reduce(
        (sum, r: { amount_bdt: number }) => sum + Math.abs(Number(r.amount_bdt) || 0),
        0,
      );
      setStats({
        orders: ordersRes.count ?? 0,
        pendingReplacements: repsRes.count ?? 0,
        lifetimeSpent: lifetime,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const isSeller = roles.includes("seller");
  const isAdmin = roles.includes("admin");
  const primaryRole = isAdmin ? "admin" : isSeller ? "seller" : "buyer";

  // Simple loyalty tier from lifetime spend
  const tier =
    stats.lifetimeSpent >= 50000
      ? { name: "Diamond", color: "text-cyan-300", icon: Crown }
      : stats.lifetimeSpent >= 10000
      ? { name: "Gold", color: "text-amber-300", icon: Crown }
      : stats.lifetimeSpent >= 1000
      ? { name: "Silver", color: "text-slate-200", icon: Shield }
      : { name: "Member", color: "text-muted-foreground", icon: Sparkles };
  const TierIcon = tier.icon;

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <AppShell
      mode="buyer"
      title={`Welcome back, ${profile?.display_name ?? "trader"}.`}
      subtitle="Manage your purchases, replacements, and wallet from here."
    >
        {/* Hero balance card — premium */}
        <Card className="relative overflow-hidden rounded-2xl border-border/60 bg-gradient-card p-6 shadow-card md:p-8">
          {/* Decorative glow */}
          <div
            aria-hidden
            className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full opacity-40 blur-3xl"
            style={{ background: "var(--gradient-brand)" }}
          />
          <div className="pointer-events-none absolute inset-0 opacity-[0.04] [background-image:radial-gradient(hsl(var(--foreground))_1px,transparent_1px)] [background-size:18px_18px]" />

          <div className="relative grid gap-6 md:grid-cols-[1.4fr,1fr] md:items-center">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge className="gap-1 border-0 bg-gradient-brand text-primary-foreground shadow-glow">
                  <TierIcon className="h-3 w-3" /> {tier.name}
                </Badge>
                <span className="text-xs uppercase tracking-widest text-muted-foreground">
                  Wallet balance
                </span>
              </div>
              <div className="mt-3 flex items-baseline gap-2">
                <span className="font-display text-5xl font-bold tracking-tight md:text-6xl">
                  ৳{Number(profile?.balance_bdt ?? 0).toLocaleString("en-BD", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                Lifetime spent · ৳{stats.lifetimeSpent.toLocaleString("en-BD", { maximumFractionDigits: 0 })}
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
                <Button
                  onClick={() => navigate("/wallet")}
                  className="gap-2 bg-gradient-brand text-primary-foreground shadow-glow transition-all hover:opacity-95 hover:shadow-[0_0_80px_-10px_hsl(var(--primary)/0.6)]"
                >
                  <Wallet className="h-4 w-4" /> Top up wallet
                </Button>
                <Button variant="outline" onClick={() => navigate("/browse")} className="gap-2">
                  <ShoppingBag className="h-4 w-4" /> Browse stock <ArrowUpRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>

            {/* Mini stats column */}
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-border/60 bg-background/40 p-4 backdrop-blur">
                <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground">
                  <ShoppingBag className="h-3.5 w-3.5" /> Orders
                </div>
                <div className="mt-1 font-display text-2xl font-bold">{stats.orders}</div>
              </div>
              <div className="rounded-xl border border-border/60 bg-background/40 p-4 backdrop-blur">
                <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground">
                  <RefreshCcw className="h-3.5 w-3.5" /> Pending
                </div>
                <div className={`mt-1 font-display text-2xl font-bold ${stats.pendingReplacements > 0 ? "text-warning" : ""}`}>
                  {stats.pendingReplacements}
                </div>
              </div>
              <div className="col-span-2 rounded-xl border border-border/60 bg-background/40 p-4 backdrop-blur">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground">
                    <Zap className="h-3.5 w-3.5" /> Quick actions
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button size="sm" variant="ghost" className="h-8 px-2 text-xs" onClick={() => navigate("/vpn")}>
                    VPN plans
                  </Button>
                  <Button size="sm" variant="ghost" className="h-8 px-2 text-xs" onClick={() => navigate("/replacements")}>
                    Replacements
                  </Button>
                  <Button size="sm" variant="ghost" className="h-8 px-2 text-xs" onClick={() => navigate("/wallet")}>
                    History
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </Card>

        {/* Secondary stat strip */}
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <Card className="group flex items-center gap-3 border-border/60 bg-gradient-card p-4 shadow-card transition-all hover:border-primary/40 hover:shadow-glow">
            <div className="rounded-lg bg-secondary/20 p-2.5 text-secondary"><ShoppingBag className="h-4 w-4" /></div>
            <div className="min-w-0 flex-1">
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Total orders</div>
              <div className="font-display text-xl font-semibold">{stats.orders}</div>
            </div>
          </Card>
          <Card className="group flex items-center gap-3 border-border/60 bg-gradient-card p-4 shadow-card transition-all hover:border-warning/40 hover:shadow-glow">
            <div className="rounded-lg bg-warning/20 p-2.5 text-warning"><RefreshCcw className="h-4 w-4" /></div>
            <div className="min-w-0 flex-1">
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Pending replacements</div>
              <div className="font-display text-xl font-semibold">{stats.pendingReplacements}</div>
            </div>
            <Button size="sm" variant="ghost" className="h-8 shrink-0 px-2 text-xs" onClick={() => navigate("/replacements")}>
              Open
            </Button>
          </Card>
          <Card className="group flex items-center gap-3 border-border/60 bg-gradient-card p-4 shadow-card transition-all hover:border-primary/40 hover:shadow-glow">
            <div className="rounded-lg bg-primary/20 p-2.5 text-primary"><TrendingUp className="h-4 w-4" /></div>
            <div className="min-w-0 flex-1">
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Lifetime spent</div>
              <div className="font-display text-xl font-semibold">৳{stats.lifetimeSpent.toLocaleString("en-BD", { maximumFractionDigits: 0 })}</div>
            </div>
          </Card>
        </div>

        {/* Telegram link card */}
        <Card className="mt-6 overflow-hidden border-border/60 bg-gradient-card p-6 shadow-card">
          <div className="grid gap-6 md:grid-cols-[1fr,auto] md:items-center">
            <div>
              <div className="flex items-center gap-2">
                <Bot className="h-5 w-5 text-primary" />
                <div className="font-display text-lg font-semibold">Telegram bot</div>
                {profile?.telegram_chat_id ? (
                  <Badge className="bg-success/20 text-success hover:bg-success/20">
                    <CheckCircle2 className="mr-1 h-3 w-3" /> Linked
                  </Badge>
                ) : (
                  <Badge variant="outline" className="border-warning/40 text-warning">
                    Not linked
                  </Badge>
                )}
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                Open our Telegram bot and send the command below to permanently link this account.
                Bot delivers orders, replacements, and balance updates in real time.
              </p>
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <code className="rounded-md border border-border bg-background/60 px-3 py-2 font-mono text-sm">
                  /start {profile?.telegram_link_code}
                </code>
                <Button size="sm" variant="outline" onClick={copyTgCode}>
                  <Copy className="mr-2 h-3.5 w-3.5" /> Copy
                </Button>
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border/40 pt-4">
                <span className="text-xs uppercase tracking-widest text-muted-foreground">Message template</span>
                <Button
                  size="sm"
                  variant={template === "compact" ? "default" : "outline"}
                  onClick={() => setTemplate("compact")}
                  className={template === "compact" ? "bg-gradient-brand text-primary-foreground hover:opacity-90" : ""}
                >
                  Compact (UID:PASS only)
                </Button>
                <Button
                  size="sm"
                  variant={template === "detailed" ? "default" : "outline"}
                  onClick={() => setTemplate("detailed")}
                  className={template === "detailed" ? "bg-gradient-brand text-primary-foreground hover:opacity-90" : ""}
                >
                  Detailed (with header & 2FA)
                </Button>
              </div>
            </div>
          </div>
        </Card>

        {/* Role-specific quick actions */}
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <Card className="border-border/60 bg-gradient-card p-6 shadow-card">
            <ShoppingBag className="h-5 w-5 text-primary" />
            <div className="mt-3 font-display text-lg font-semibold">Buyer area</div>
            <p className="mt-1 text-sm text-muted-foreground">
              Browse 61xxx & 1000xxx Facebook accounts and VPN plans.
            </p>
            <Button
              size="sm"
              onClick={() => navigate("/browse")}
              className="mt-4 bg-gradient-brand text-primary-foreground hover:opacity-90"
            >
              Browse stock
            </Button>
          </Card>

          <Card className="border-border/60 bg-gradient-card p-6 shadow-card">
            <Upload className="h-5 w-5 text-secondary" />
            <div className="mt-3 font-display text-lg font-semibold">Seller area</div>
            <p className="mt-1 text-sm text-muted-foreground">
              {isSeller
                ? "Upload your .xlsx stock and track payouts."
                : "Want to sell? Apply for a seller account — admin will review your request."}
            </p>
            <Button
              size="sm"
              variant="outline"
              className="mt-4"
              onClick={() => navigate(isSeller || isAdmin ? "/seller" : "/dashboard")}
              disabled={!isSeller && !isAdmin}
            >
              {isSeller ? "Open seller dashboard" : "Apply as seller"}
            </Button>
          </Card>
        </div>

        {isAdmin && (
          <Card className="mt-6 border-primary/40 bg-gradient-card p-6 shadow-card">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="font-display text-lg font-semibold">Admin tools</div>
                <p className="text-sm text-muted-foreground">
                  Resolve replacement requests, manage roles, top-ups, and more.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={() => navigate("/admin/audit")}>
                  Audit log
                </Button>
                <Button
                  onClick={() => navigate("/admin")}
                  className="bg-gradient-brand text-primary-foreground hover:opacity-90"
                >
                  Open admin panel
                </Button>
              </div>
            </div>
          </Card>
        )}

        {user && (
          <RecentOrdersPanel
            userId={user.id}
            telegramLinked={!!profile?.telegram_chat_id}
            template={template}
          />
        )}
      <BrandFooter />
    </AppShell>
  );
};

export default Dashboard;