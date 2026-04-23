import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
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
  const { user, roles, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (authLoading || !user) return;
    if (roles.includes("admin")) {
      navigate("/admin", { replace: true });
    } else if (roles.length > 0) {
      // Logged in but not admin — bounce to their normal dashboard
      toast.error("This account does not have admin access.");
      navigate(roles.includes("seller") ? "/seller" : "/dashboard", { replace: true });
    }
  }, [user, roles, authLoading, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const cleanEmail = emailSchema.parse(email);
      const cleanPassword = passwordSchema.parse(password);

      const { error } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password: cleanPassword,
      });
      if (error) throw error;

      const { data: { user: signedIn } } = await supabase.auth.getUser();
      if (!signedIn) throw new Error("Sign-in failed");

      const { data: rolesRows } = await supabase
        .from("user_roles").select("role").eq("user_id", signedIn.id);
      const userRoles = (rolesRows ?? []).map((r) => r.role as string);

      if (!userRoles.includes("admin")) {
        await supabase.auth.signOut();
        throw new Error("This account does not have admin access.");
      }

      toast.success("Welcome, Admin");
      navigate("/admin", { replace: true });
    } catch (err: any) {
      if (err?.issues?.[0]?.message) {
        toast.error(err.issues[0].message);
      } else if (err?.message?.includes("Invalid login")) {
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