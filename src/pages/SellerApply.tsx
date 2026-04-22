import { useEffect, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Clock, CheckCircle2, XCircle, Loader2, Store } from "lucide-react";
import { toast } from "sonner";

interface Application {
  id: string;
  status: "pending" | "approved" | "rejected";
  telegram_username: string | null;
  reason: string | null;
  admin_note: string | null;
  created_at: string;
  reviewed_at: string | null;
}

const SellerApply = () => {
  const { user, roles, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [app, setApp] = useState<Application | null>(null);
  const [loading, setLoading] = useState(true);
  const [tgUsername, setTgUsername] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const isSeller = roles.includes("seller") || roles.includes("admin");

  const load = async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase
      .from("seller_applications")
      .select("id, status, telegram_username, reason, admin_note, created_at, reviewed_at")
      .eq("user_id", user.id)
      .maybeSingle();
    if (data) {
      setApp(data as Application);
      setTgUsername(data.telegram_username ?? "");
      setReason(data.reason ?? "");
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
    if (!user) return;
    const ch = supabase
      .channel("apply-" + user.id)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "seller_applications", filter: `user_id=eq.${user.id}` },
        load,
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const submit = async () => {
    const tg = tgUsername.trim().replace(/^@/, "").toLowerCase();
    if (tg.length < 3 || !/^[a-z0-9_]{3,32}$/.test(tg)) {
      return toast.error("Telegram username: 3-32 chars, only a-z, 0-9, _");
    }
    setSubmitting(true);
    const { error } = await supabase.rpc("submit_seller_application", {
      p_telegram_username: tg,
      p_reason: reason.trim() || null,
    });
    setSubmitting(false);
    if (error) return toast.error(error.message);
    toast.success(app?.status === "rejected" ? "Re-submitted — admin will review again." : "Application submitted!");
    load();
  };

  if (authLoading) return <div className="flex min-h-screen items-center justify-center bg-background"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  if (!user) return <Navigate to="/auth" replace />;
  if (isSeller) return <Navigate to="/seller" replace />;

  return (
    <div
      className="min-h-screen bg-background text-foreground"
      style={{
        backgroundImage:
          "radial-gradient(ellipse at top, hsl(265 84% 62% / 0.18), transparent 55%), radial-gradient(ellipse at bottom, hsl(174 84% 50% / 0.12), transparent 55%)",
      }}
    >
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-xl">
        <div className="container flex h-16 items-center justify-between">
          <div className="flex items-center gap-4">
            <Link to="/dashboard" className="text-sm text-muted-foreground hover:text-foreground">
              <ArrowLeft className="inline h-4 w-4" /> Dashboard
            </Link>
            <Logo size="sm" showTagline={false} />
            <Badge variant="outline">Seller application</Badge>
          </div>
        </div>
      </header>

      <main className="container max-w-2xl py-10">
        <div className="mb-6 flex items-center gap-3">
          <div className="rounded-xl bg-gradient-brand p-3 shadow-glow">
            <Store className="h-6 w-6 text-primary-foreground" />
          </div>
          <div>
            <h1 className="font-display text-2xl font-bold md:text-3xl">Become a seller</h1>
            <p className="text-sm text-muted-foreground">Apply to upload and sell accounts on Nexus X.</p>
          </div>
        </div>

        {loading ? (
          <div className="flex h-32 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
        ) : app && app.status === "pending" ? (
          <Card className="border-warning/40 bg-warning/5 p-6">
            <div className="flex items-start gap-3">
              <Clock className="mt-1 h-5 w-5 text-warning" />
              <div>
                <div className="font-display text-lg font-semibold text-warning">Application pending review</div>
                <p className="mt-1 text-sm text-muted-foreground">
                  Submitted {new Date(app.created_at).toLocaleString()}. An admin will approve or reject your request soon. You'll get a notification.
                </p>
                <div className="mt-4 grid gap-2 text-sm">
                  <div><span className="text-muted-foreground">Telegram:</span> <strong>@{app.telegram_username}</strong></div>
                  {app.reason && <div><span className="text-muted-foreground">Reason:</span> {app.reason}</div>}
                </div>
              </div>
            </div>
          </Card>
        ) : app && app.status === "approved" ? (
          <Card className="border-success/40 bg-success/5 p-6">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="mt-1 h-5 w-5 text-success" />
              <div className="flex-1">
                <div className="font-display text-lg font-semibold text-success">Approved!</div>
                <p className="mt-1 text-sm text-muted-foreground">You can now access the Seller Dashboard.</p>
                <Button className="mt-4 bg-gradient-brand text-primary-foreground shadow-glow" onClick={() => navigate("/seller")}>
                  Open Seller Dashboard
                </Button>
              </div>
            </div>
          </Card>
        ) : (
          <Card className="border-border/60 bg-gradient-card p-6">
            {app?.status === "rejected" && (
              <div className="mb-5 flex items-start gap-3 rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm">
                <XCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-destructive" />
                <div>
                  <div className="font-semibold text-destructive">Previous application rejected</div>
                  {app.admin_note && <div className="mt-1 text-destructive/90"><strong>Reason:</strong> {app.admin_note}</div>}
                  <div className="mt-1 text-xs text-muted-foreground">You can update and re-submit below.</div>
                </div>
              </div>
            )}

            <div className="space-y-4">
              <div>
                <Label htmlFor="tg">Telegram username <span className="text-destructive">*</span></Label>
                <Input
                  id="tg"
                  value={tgUsername}
                  onChange={(e) => setTgUsername(e.target.value)}
                  placeholder="@yourname"
                  maxLength={33}
                  className="mt-1.5"
                />
                <p className="mt-1 text-xs text-muted-foreground">Used for order/payout coordination via the Telegram bot.</p>
              </div>
              <div>
                <Label htmlFor="reason">Why do you want to sell? (optional)</Label>
                <Textarea
                  id="reason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Tell us about your stock source, experience, daily volume..."
                  rows={4}
                  className="mt-1.5"
                  maxLength={1000}
                />
              </div>
              <Button
                onClick={submit}
                disabled={submitting}
                className="w-full bg-gradient-brand text-primary-foreground shadow-glow"
                size="lg"
              >
                {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {app?.status === "rejected" ? "Re-submit application" : "Submit application"}
              </Button>
              <p className="text-center text-xs text-muted-foreground">
                Admin review usually takes a few hours. You'll keep your buyer account either way.
              </p>
            </div>
          </Card>
        )}
      </main>
    </div>
  );
};

export default SellerApply;