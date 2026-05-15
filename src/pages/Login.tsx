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
import { BrandTagline } from "@/components/BrandTagline";
import { toast } from "sonner";
import { Loader2, ArrowLeft, Store } from "lucide-react";

const emailSchema = z.string().trim().email("Enter a valid email").max(255);
const passwordSchema = z.string().min(8, "At least 8 characters").max(72);

const Login = () => {
  const { user, loading: authLoading, signIn, signOut, refresh } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!authLoading && user) navigate("/dashboard", { replace: true });
  }, [user, authLoading, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const cleanEmail = emailSchema.parse(email);
      const cleanPassword = passwordSchema.parse(password);

      await signIn(cleanEmail, cleanPassword);
      const me = await authApi.me();
      const userRoles = me.roles || [];
      const isAdmin = userRoles.includes("admin");
      const hasSeller = userRoles.includes("seller");

      // Sellers / admins must use their dedicated portals.
      if (!isAdmin && hasSeller) {
        await signOut();
        throw new Error("Sellers must sign in via the Seller portal at /seller-login.");
      }
      await refresh();
      const welcomeName =
        me.profile?.display_name ||
        me.user?.email?.split("@")[0] ||
        "there";
      const bdTime = new Intl.DateTimeFormat("en-GB", {
        timeZone: "Asia/Dhaka",
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
        day: "2-digit",
        month: "short",
      }).format(new Date());
      toast.success(`স্বাগতম, ${welcomeName} 👋`, {
        description: `🇧🇩 Login time: ${bdTime} (BD)`,
      });
      navigate(isAdmin ? "/admin" : "/dashboard", { replace: true });
    } catch (err: any) {
      if (err?.issues?.[0]?.message) toast.error(err.issues[0].message);
      else if (err?.message === "invalid_credentials") toast.error("Invalid email or password.");
      else toast.error(err?.message || "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="flex min-h-screen items-center justify-center bg-background px-4 py-10"
      style={{
        backgroundImage:
          "radial-gradient(ellipse at top, hsl(265 84% 62% / 0.18), transparent 55%), radial-gradient(ellipse at bottom, hsl(174 84% 50% / 0.12), transparent 55%)",
      }}
    >
      <div className="w-full max-w-md">
        <Link to="/" className="mb-6 inline-flex items-center gap-2 text-sm text-muted-foreground transition hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Back to home
        </Link>
        <div className="mb-6 text-center">
          <Logo size="lg" showTagline />
        </div>
        <BrandTagline />
        <Card className="border-border/60 bg-gradient-card p-6 shadow-card">
          <div className="mb-5 text-center">
            <h1 className="font-display text-2xl font-bold">Sign in</h1>
            <p className="mt-1 text-sm text-muted-foreground">Welcome back to Nexus X</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required autoComplete="email" className="mt-1.5" />
            </div>
            <div>
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Your password" required autoComplete="current-password" minLength={8} maxLength={72} className="mt-1.5" />
            </div>

            <Button type="submit" disabled={submitting} className="w-full bg-gradient-brand text-primary-foreground shadow-glow hover:opacity-90" size="lg">
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Sign in
            </Button>

            <p className="text-center text-sm text-muted-foreground">
              Want to sell on Nexus X?{" "}
              <Link to="/apply-seller" className="font-semibold text-primary underline-offset-2 hover:underline">
                Apply as seller
              </Link>
            </p>

            <div className="border-t border-border/40 pt-4">
              <Link
                to="/seller-login"
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-border/60 bg-background/40 px-3 py-2 text-xs font-semibold text-muted-foreground transition hover:bg-muted/40 hover:text-foreground"
              >
                <Store className="h-3.5 w-3.5" /> Seller portal
              </Link>
            </div>
          </form>
        </Card>
      </div>
    </div>
  );
};

export default Login;
