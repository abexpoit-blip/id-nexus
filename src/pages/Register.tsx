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
import { Loader2, ArrowLeft, ShoppingBag, Store, Info } from "lucide-react";

const emailSchema = z.string().trim().email("Enter a valid email").max(255);
const passwordSchema = z.string().min(8, "At least 8 characters").max(72);
const nameSchema = z.string().trim().min(2, "Name too short").max(60);

type RoleChoice = "buyer" | "seller";

const Register = () => {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [roleChoice, setRoleChoice] = useState<RoleChoice>("buyer");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
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
      const cleanName = nameSchema.parse(displayName);

      const redirectUrl = `${window.location.origin}/dashboard`;
      const { error } = await supabase.auth.signUp({
        email: cleanEmail,
        password: cleanPassword,
        options: {
          emailRedirectTo: redirectUrl,
          data: { display_name: cleanName },
        },
      });
      if (error) throw error;

      if (roleChoice === "seller") {
        toast.success("Account created! Redirecting to seller application…");
        navigate("/apply-seller", { replace: true });
      } else {
        toast.success("Buyer account created — welcome to Nexus X!");
        navigate("/dashboard", { replace: true });
      }
    } catch (err: any) {
      if (err?.issues?.[0]?.message) toast.error(err.issues[0].message);
      else if (err?.message?.includes("already registered")) toast.error("Email already registered. Sign in instead.");
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
            <h1 className="font-display text-2xl font-bold">Create account</h1>
            <p className="mt-1 text-sm text-muted-foreground">Join Nexus X marketplace</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label className="mb-2 block text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                Register as
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
              {roleChoice === "seller" && (
                <div className="mt-3 flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 p-3 text-xs text-warning-foreground">
                  <Info className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-warning" />
                  <span>
                    Seller accounts require <strong>admin approval</strong>. After signup, you'll fill out a short application. You can browse as buyer in the meantime.
                  </span>
                </div>
              )}
            </div>

            <div>
              <Label htmlFor="name">Display name</Label>
              <Input id="name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Your name" required maxLength={60} className="mt-1.5" />
            </div>
            <div>
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required autoComplete="email" className="mt-1.5" />
            </div>
            <div>
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Min 8 characters" required autoComplete="new-password" minLength={8} maxLength={72} className="mt-1.5" />
            </div>

            <Button type="submit" disabled={submitting} className="w-full bg-gradient-brand text-primary-foreground shadow-glow hover:opacity-90" size="lg">
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {roleChoice === "seller" ? "Create account & apply" : "Create buyer account"}
            </Button>

            <p className="text-center text-sm text-muted-foreground">
              Already have an account?{" "}
              <Link to="/login" className="font-semibold text-primary underline-offset-2 hover:underline">
                Sign in
              </Link>
            </p>
          </form>
        </Card>
      </div>
    </div>
  );
};

export default Register;
