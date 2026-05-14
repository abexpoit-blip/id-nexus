import { useEffect, useState } from "react";
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
import { Loader2, ArrowLeft, Store } from "lucide-react";

const emailSchema = z.string().trim().email("Enter a valid email").max(255);
const passwordSchema = z.string().min(8, "At least 8 characters").max(72);

const SellerLogin = () => {
  const { user, roles, loading: authLoading, signIn, signOut, refresh } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (authLoading || !user) return;
    if (roles.includes("seller") || roles.includes("admin")) {
      navigate("/seller", { replace: true });
    } else if (roles.length > 0) {
      toast.error("This account is not a seller. Apply to become a seller first.");
      navigate("/dashboard", { replace: true });
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
      const userRoles = me.roles || [];
      if (!userRoles.includes("seller") && !userRoles.includes("admin")) {
        await signOut();
        throw new Error("This account is not a seller. Apply to become a seller first.");
      }
      await refresh();

      toast.success("Welcome back, Seller 🛍️");
      navigate("/seller", { replace: true });
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
      className="flex min-h-screen items-center justify-center bg-background bg-premium-ambient px-4 py-10"
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
          <div className="pill-gold mt-3">
            <Store className="h-3.5 w-3.5" /> Seller portal
          </div>
        </div>
        <Card className="glass-panel-strong border-0 p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="seller-email">Seller email</Label>
              <Input
                id="seller-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="seller@example.com"
                required
                autoComplete="email"
                className="mt-1.5"
              />
            </div>
            <div>
              <Label htmlFor="seller-password">Password</Label>
              <Input
                id="seller-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Your password"
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
              className="btn-gold w-full"
              size="lg"
            >
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Sign in to seller panel
            </Button>
            <p className="text-center text-xs text-muted-foreground">
              Restricted area. Buyers will be redirected to the buyer dashboard.
            </p>
            <div className="border-t border-border/40 pt-4 text-center text-sm text-muted-foreground">
              Not a seller yet?{" "}
              <Link to="/apply-seller" className="text-gold font-semibold underline-offset-2 hover:underline">
                Apply to become one
              </Link>
            </div>
          </form>
        </Card>
      </div>
    </div>
  );
};

export default SellerLogin;