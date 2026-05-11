import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Logo } from "@/components/Logo";
import { ShieldCheck, Loader2, ArrowLeft, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

const OWNER_EMAIL = "samexpoit@gmail.com";

const ClaimAdmin = () => {
  const { user, roles, loading, refresh } = useAuth();
  const navigate = useNavigate();
  const [working, setWorking] = useState(false);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) return <Navigate to={`/login?next=/claim-admin`} replace />;

  const emailMatches = (user.email ?? "").toLowerCase() === OWNER_EMAIL;
  const alreadyAdmin = roles.includes("admin");

  const claim = async () => {
    setWorking(true);
    try {
      const res = await api.post<{ ok: boolean; error?: string }>("/api/auth/claim-admin");
      if (!res?.ok) throw new Error(res?.error ?? "Failed to claim admin");
      await refresh();
      toast.success("✅ Admin role granted! Redirecting…");
      setTimeout(() => navigate("/admin", { replace: true }), 700);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed");
    } finally {
      setWorking(false);
    }
  };

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
          <Link to="/" className="flex items-center gap-3 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> Home
          </Link>
          <Logo size="sm" showTagline={false} />
        </div>
      </header>

      <main className="container max-w-xl py-16">
        <Card
          className="relative overflow-hidden border-primary/40 bg-gradient-card p-8 text-center"
          style={{ boxShadow: "0 0 40px -10px hsl(var(--primary) / 0.5)" }}
        >
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-brand shadow-glow">
            <ShieldCheck className="h-8 w-8 text-primary-foreground" />
          </div>
          <h1 className="font-display text-3xl font-bold">Claim admin access</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Secret one-click admin self-assignment. Restricted to the owner email only.
          </p>

          <div className="mt-6 rounded-lg border border-border/60 bg-card/40 p-4 text-left text-sm">
            <div className="text-muted-foreground">Signed in as</div>
            <div className="font-mono text-base">{user.email}</div>
          </div>

          {alreadyAdmin ? (
            <div className="mt-6 flex items-center justify-center gap-2 rounded-lg border border-success/40 bg-success/10 p-4 text-success">
              <CheckCircle2 className="h-5 w-5" />
              <span>You already have admin access.</span>
            </div>
          ) : !emailMatches ? (
            <div className="mt-6 rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
              এই page-এ access শুধু owner-এর জন্য। আপনার current email allowed list-এ নেই।
            </div>
          ) : (
            <Button
              onClick={claim}
              disabled={working}
              size="lg"
              className="mt-6 w-full bg-gradient-brand text-primary-foreground shadow-glow"
            >
              {working ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-2 h-4 w-4" />}
              Grant me admin role
            </Button>
          )}

          {alreadyAdmin && (
            <Button onClick={() => navigate("/admin")} className="mt-4 w-full" variant="outline">
              Go to Admin panel
            </Button>
          )}
        </Card>
      </main>
    </div>
  );
};

export default ClaimAdmin;