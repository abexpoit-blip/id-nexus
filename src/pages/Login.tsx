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
import { Loader2, ArrowLeft, ShoppingBag, Store } from "lucide-react";

const emailSchema = z.string().trim().email("Enter a valid email").max(255);
const passwordSchema = z.string().min(8, "At least 8 characters").max(72);

type RoleChoice = "buyer" | "seller";

const Login = () => {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [roleChoice, setRoleChoice] = useState<RoleChoice>("buyer");
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
      const isAdmin = userRoles.includes("admin");
      const hasSeller = userRoles.includes("seller");
      const hasBuyer = userRoles.includes("buyer");

      if (roleChoice === "seller" && !hasSeller && !isAdmin) {
        await supabase.auth.signOut();
        throw new Error("This account is not a Seller. Apply via Register → Seller.");
      }
      if (roleChoice === "buyer" && !hasBuyer && !isAdmin) {
        await supabase.auth.signOut();
        throw new Error("This account is a Seller, not a Buyer. Switch to the Seller tab.");
      }

      const welcomeName =
        signedIn.user_metadata?.display_name ||
        signedIn.email?.split("@")[0] ||
        "Shovon";
      toast.success(`স্বাগতম, ${welcomeName} 👋  (${roleChoice})`);
      navigate(roleChoice === "seller" ? "/seller" : "/dashboard", { replace: true });
    } catch (err: any) {
      if (err?.issues?.[0]?.message) toast.error(err.issues[0].message);
      else if (err?.message?.includes("Invalid login")) toast.error("Invalid email or password.");
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
        <Card className="border-border/60 bg-gradient-card p-6 shadow-card">
          <div className="mb-5 text-center">
            <h1 className="font-display text-2xl font-bold">Sign in</h1>
            <p className="mt-1 text-sm text-muted-foreground">Welcome back to Nexus X</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label className="mb-2 block text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                Sign in as
              </Label>
              <div className="grid grid-cols-2 gap-2 rounded-xl border border-border/60 bg-background/40 p-1.5">
                <button
                  type="button"
                  onClick={() => setRoleChoice("buyer")}
                  className={`flex items-center justify-center gap-2 rounded-lg px-3 py-3 text-sm font-medium transition-all ${
                    roleChoice === "buyer"
                      ? "bg-gradient-brand text-primary-foreground shadow-glow"
                      : "text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                  }`}
                >
                  <ShoppingBag className="h-4 w-4" />
                  Buyer
                </button>
                <button
                  type="button"
                  onClick={() => setRoleChoice("seller")}
                  className={`flex items-center justify-center gap-2 rounded-lg px-3 py-3 text-sm font-medium transition-all ${
                    roleChoice === "seller"
                      ? "bg-gradient-brand text-primary-foreground shadow-glow"
                      : "text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                  }`}
                >
                  <Store className="h-4 w-4" />
                  Seller
                </button>
              </div>
            </div>

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
              Sign in as {roleChoice}
            </Button>

            <p className="text-center text-sm text-muted-foreground">
              Don't have an account?{" "}
              <Link to="/register" className="font-semibold text-primary underline-offset-2 hover:underline">
                Create one
              </Link>
            </p>
          </form>
        </Card>
      </div>
    </div>
  );
};

export default Login;
