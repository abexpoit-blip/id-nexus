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
  Bot,
  Copy,
  CheckCircle2,
} from "lucide-react";
import { toast } from "sonner";
import { RecentOrdersPanel } from "@/components/buyer/RecentOrdersPanel";
import { AppShell } from "@/components/layout/AppShell";

interface Profile {
  display_name: string | null;
  email: string | null;
  balance_bdt: number;
  telegram_link_code: string;
  telegram_chat_id: number | null;
  buyer_settings: { telegram_template?: "compact" | "detailed" } | null;
}

const Dashboard = () => {
  const { user, roles } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("profiles")
      .select("display_name, email, balance_bdt, telegram_link_code, telegram_chat_id, buyer_settings")
      .eq("id", user.id)
      .single()
      .then(({ data, error }) => {
        if (error) toast.error("Could not load profile");
        else setProfile(data as Profile);
        setLoading(false);
      });
  }, [user]);

  const isSeller = roles.includes("seller");
  const isAdmin = roles.includes("admin");
  const primaryRole = isAdmin ? "admin" : isSeller ? "seller" : "buyer";

  const copyTgCode = () => {
    if (!profile) return;
    navigator.clipboard.writeText(`/start ${profile.telegram_link_code}`);
    toast.success("Telegram command copied");
  };

  const template: "compact" | "detailed" = profile?.buyer_settings?.telegram_template ?? "compact";

  const setTemplate = async (next: "compact" | "detailed") => {
    if (!user || !profile) return;
    const newSettings = { ...(profile.buyer_settings ?? {}), telegram_template: next };
    setProfile({ ...profile, buyer_settings: newSettings });
    const { error } = await supabase
      .from("profiles")
      .update({ buyer_settings: newSettings })
      .eq("id", user.id);
    if (error) {
      toast.error("Could not save template preference");
    } else {
      toast.success(`Telegram template set to ${next}`);
    }
  };

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
      subtitle="Manage your purchases, replacements, and Telegram bot link from here."
    >
        {/* Stat cards */}
        <div className="grid gap-4 md:grid-cols-3">
          <Card className="border-border/60 bg-gradient-card p-6 shadow-card">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-gradient-brand p-2 text-primary-foreground">
                <Wallet className="h-5 w-5" />
              </div>
              <div className="text-xs uppercase tracking-widest text-muted-foreground">
                Wallet balance
              </div>
            </div>
            <div className="mt-4 font-display text-3xl font-bold">
              ৳ {Number(profile?.balance_bdt ?? 0).toFixed(2)}
            </div>
            <Button
              size="sm"
              onClick={() => navigate("/wallet")}
              className="mt-4 w-full bg-gradient-brand text-primary-foreground hover:opacity-90"
            >
              Top up via bKash / Nagad
            </Button>
          </Card>

          <Card className="border-border/60 bg-gradient-card p-6 shadow-card">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-secondary/20 p-2 text-secondary">
                <ShoppingBag className="h-5 w-5" />
              </div>
              <div className="text-xs uppercase tracking-widest text-muted-foreground">
                Recent orders
              </div>
            </div>
            <div className="mt-4 font-display text-3xl font-bold">0</div>
            <p className="mt-1 text-xs text-muted-foreground">No orders yet — browse stock to start.</p>
          </Card>

          <Card className="border-border/60 bg-gradient-card p-6 shadow-card">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-warning/20 p-2 text-warning">
                <RefreshCcw className="h-5 w-5" />
              </div>
              <div className="text-xs uppercase tracking-widest text-muted-foreground">
                Replacements
              </div>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              Report bad IDs from your orders. 2h window for ≤10 IDs, 6h for larger.
            </p>
            <Button
              size="sm"
              variant="outline"
              className="mt-4 w-full"
              onClick={() => navigate("/replacements")}
            >
              <RefreshCcw className="mr-2 h-4 w-4" /> Open replacements
            </Button>
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