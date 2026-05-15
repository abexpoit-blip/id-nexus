import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { z } from "zod";
import { authApi } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Logo } from "@/components/Logo";
import { toast } from "sonner";
import { Loader2, ArrowLeft, ShieldCheck } from "lucide-react";

const emailSchema = z.string().trim().email("Enter a valid email").max(255);
const passwordSchema = z.string().min(8, "At least 8 characters").max(72);

const AdminLogin = () => {
  const { user, roles, loading: authLoading, signIn, signOut, refresh } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [wiping, setWiping] = useState(false);
  const wipedRef = useRef(false);

  // Hard wipe of every browser-side session artifact (cookies, storage, caches).
  const hardWipe = async () => {
    try { await authApi.logout(); } catch { /* ignore */ }
    try { await signOut(); } catch { /* ignore */ }
    try {
      // Best-effort cookie clear for non-httpOnly cookies on this host.
      document.cookie.split(";").forEach((c) => {
        const name = c.split("=")[0]?.trim();
        if (!name) return;
        const host = window.location.hostname;
        const variants = [host, `.${host}`, host.split(".").slice(-2).join("."), `.${host.split(".").slice(-2).join(".")}`];
        for (const d of variants) {
          document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; domain=${d}`;
        }
        document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
      });
    } catch { /* ignore */ }
    try { localStorage.clear(); } catch { /* ignore */ }
    try { sessionStorage.clear(); } catch { /* ignore */ }
    try {
      if ("caches" in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }
    } catch { /* ignore */ }
  };

  useEffect(() => {
    if (authLoading || !user) return;
    if (roles.includes("admin")) {
      navigate("/admin", { replace: true });
    } else if (!wipedRef.current) {
      // Logged in but not admin — wipe everything so admin creds can be used.
      wipedRef.current = true;
      setWiping(true);
      hardWipe().finally(() => {
        setWiping(false);
        toast.message("Non-admin session cleared. Please sign in with your admin account.");
      });
    }
  }, [user, roles, authLoading, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const cleanEmail = emailSchema.parse(email);
      const cleanPassword = passwordSchema.parse(password);

      await signIn(cleanEmail, cleanPassword);
      const me = await authApi.me();
      if (!me.roles?.includes("admin")) {
        await signOut();
        throw new Error("This account does not have admin access.");
      }
      await refresh();

      toast.success("Welcome, Admin");
      navigate("/admin", { replace: true });
    } catch (err: any) {
      if (err?.issues?.[0]?.message) {
        toast.error(err.issues[0].message);
      } else if (err?.message === "invalid_credentials") {
        toast.error("Invalid email or password.");
      } else {
        toast.error(err?.message || "Something went wrong");
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="flex min-h-screen items-center justify-center bg-background px-4 py-10"
      style={{
        backgroundImage:
          "radial-gradient(ellipse at top, hsl(0 84% 60% / 0.18), transparent 55%), radial-gradient(ellipse at bottom, hsl(265 84% 62% / 0.12), transparent 55%)",
      }}
    >
      <div className="w-full max-w-md">
        <Link
          to="/"
          className="mb-6 inline-flex items-center gap-2 text-sm text-muted-foreground transition hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Back to home
        </Link>
        <div className="mb-6 text-center">
          <Logo size="lg" />
          <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-destructive/40 bg-destructive/10 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-destructive">
            <ShieldCheck className="h-3.5 w-3.5" /> Admin access
          </div>
        </div>
        <Card className="border-border/60 bg-gradient-card p-6 shadow-card">
          {wiping && (
            <div className="mb-4 flex items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Clearing previous non-admin session…
            </div>
          )}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="admin-email">Admin email</Label>
              <Input
                id="admin-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@nexusx.app"
                required
                autoComplete="email"
                className="mt-1.5"
              />
            </div>
            <div>
              <Label htmlFor="admin-password">Password</Label>
              <Input
                id="admin-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Your admin password"
                required
                autoComplete="current-password"
                minLength={8}
                maxLength={72}
                className="mt-1.5"
              />
            </div>
            <Button
              type="submit"
              disabled={submitting}
              className="w-full bg-gradient-brand text-primary-foreground shadow-glow hover:opacity-90"
              size="lg"
            >
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Sign in to admin panel
            </Button>
            <p className="text-center text-xs text-muted-foreground">
              Restricted area. Non-admin accounts will be signed out automatically.
            </p>
          </form>
        </Card>
      </div>
    </div>
  );
};

export default AdminLogin;