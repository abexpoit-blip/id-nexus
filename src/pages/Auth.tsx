import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Logo } from "@/components/Logo";
import { toast } from "sonner";
import { Loader2, ArrowLeft, ShoppingBag, Store } from "lucide-react";

const emailSchema = z.string().trim().email("Enter a valid email").max(255);
const passwordSchema = z
  .string()
  .min(8, "At least 8 characters")
  .max(72, "Too long");
const nameSchema = z.string().trim().min(2, "Name too short").max(60);

type RoleChoice = "buyer" | "seller";

const Auth = () => {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  const [mode, setMode] = useState<"signin" | "signup">("signin");
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

      if (mode === "signup") {
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
        toast.success("Buyer account created — welcome to Nexus X!");
        navigate("/dashboard", { replace: true });
      } else {
        // Sign in: enforce that the account holds the chosen role
        const { error } = await supabase.auth.signInWithPassword({
          email: cleanEmail,
          password: cleanPassword,
        });
        if (error) throw error;

        // Verify role matches selection
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
          throw new Error("This account is not a Seller. Apply to become one after signing in as Buyer.");
        }
        if (roleChoice === "buyer" && !hasBuyer && !isAdmin) {
          await supabase.auth.signOut();
          throw new Error("This account is a Seller, not a Buyer. Switch to the Seller tab to sign in.");
        }

        toast.success(`Signed in as ${roleChoice}`);
        navigate(roleChoice === "seller" ? "/seller" : "/dashboard", { replace: true });
      }
    } catch (err: any) {
      if (err?.issues?.[0]?.message) {
        toast.error(err.issues[0].message);
      } else if (err?.message?.includes("already registered")) {
        toast.error("This email is already registered. Try signing in.");
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
          "radial-gradient(ellipse at top, hsl(265 84% 62% / 0.18), transparent 55%), radial-gradient(ellipse at bottom, hsl(174 84% 50% / 0.12), transparent 55%)",
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
          <Logo size="lg" showTagline />
        </div>
        <Card className="border-border/60 bg-gradient-card p-6 shadow-card">
          <Tabs value={mode} onValueChange={(v) => setMode(v as "signin" | "signup")}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="signin">Sign in</TabsTrigger>
              <TabsTrigger value="signup">Create account</TabsTrigger>
            </TabsList>

            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              {/* Role selector — premium pill toggle, mandatory on sign-in */}
              <div>
                <Label className="mb-2 block text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                  {mode === "signin" ? "Sign in as" : "I want to register as"}
                </Label>
                <div className="grid grid-cols-2 gap-2 rounded-xl border border-border/60 bg-background/40 p-1.5">
                  <button
                    type="button"
                    onClick={() => setRoleChoice("buyer")}
                    className={`group flex items-center justify-center gap-2 rounded-lg px-3 py-3 text-sm font-medium transition-all ${
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
                    disabled={mode === "signup"}
                    className={`group flex items-center justify-center gap-2 rounded-lg px-3 py-3 text-sm font-medium transition-all ${
                      roleChoice === "seller"
                        ? "bg-gradient-brand text-primary-foreground shadow-glow"
                        : "text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                    } ${mode === "signup" ? "cursor-not-allowed opacity-50" : ""}`}
                  >
                    <Store className="h-4 w-4" />
                    Seller
                  </button>
                </div>
                {mode === "signup" && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    All new accounts start as <strong>Buyer</strong>. After signing in you can apply to become a Seller (admin approval required).
                  </p>
                )}
              </div>

              <TabsContent value="signup" className="m-0 space-y-4">
                <div>
                  <Label htmlFor="name">Display name</Label>
                  <Input
                    id="name"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Your name"
                    required={mode === "signup"}
                    maxLength={60}
                    className="mt-1.5"
                  />
                </div>
              </TabsContent>

              <div>
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                  autoComplete="email"
                  className="mt-1.5"
                />
              </div>
              <div>
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={mode === "signup" ? "Min 8 characters" : "Your password"}
                  required
                  autoComplete={mode === "signup" ? "new-password" : "current-password"}
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
                {mode === "signup"
                  ? "Create buyer account"
                  : `Sign in as ${roleChoice}`}
              </Button>

              <p className="text-center text-xs text-muted-foreground">
                By continuing you agree to our Terms & Privacy.
                {mode === "signin" && (
                  <> · Want to sell?{" "}
                    <Link to="/apply-seller" className="text-primary underline-offset-2 hover:underline">
                      Apply here
                    </Link>
                  </>
                )}
              </p>
            </form>
          </Tabs>
        </Card>
      </div>
    </div>
  );
};

export default Auth;