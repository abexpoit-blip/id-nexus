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
import { Loader2, ArrowLeft } from "lucide-react";

const emailSchema = z.string().trim().email("Enter a valid email").max(255);
const passwordSchema = z
  .string()
  .min(8, "At least 8 characters")
  .max(72, "Too long");
const nameSchema = z.string().trim().min(2, "Name too short").max(60);
const tgSchema = z
  .string()
  .trim()
  .transform((v) => v.replace(/^@/, "").toLowerCase())
  .pipe(z.string().regex(/^[a-z0-9_]{3,32}$/, "Telegram username: 3-32 chars (a-z, 0-9, _)"));
const sellerPasswordSchema = z.string().min(4, "At least 4 characters").max(72);

const Auth = () => {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  const [mode, setMode] = useState<"signin" | "signup" | "seller">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [tgUsername, setTgUsername] = useState("");
  const [sellerPassword, setSellerPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!authLoading && user) navigate("/dashboard", { replace: true });
  }, [user, authLoading, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (mode === "seller") {
        const cleanTg = tgSchema.parse(tgUsername);
        const cleanPw = sellerPasswordSchema.parse(sellerPassword);
        const { data, error } = await supabase.functions.invoke("seller-signup", {
          body: { telegram_username: cleanTg, password: cleanPw, display_name: cleanTg },
        });
        if (error) throw new Error(error.message);
        if ((data as any)?.error) throw new Error((data as any).error);
        const synthEmail = (data as any).email as string;
        const { error: siErr } = await supabase.auth.signInWithPassword({
          email: synthEmail,
          password: cleanPw,
        });
        if (siErr) throw siErr;
        toast.success(`Seller account created — welcome @${cleanTg}`);
        navigate("/seller", { replace: true });
        return;
      }

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
        toast.success("Account created! Welcome to Nexus X.");
        navigate("/dashboard", { replace: true });
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: cleanEmail,
          password: cleanPassword,
        });
        if (error) throw error;
        toast.success("Signed in.");
        navigate("/dashboard", { replace: true });
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
                {mode === "signup" ? "Create account" : "Sign in"}
              </Button>

              <p className="text-center text-xs text-muted-foreground">
                By continuing you agree to our Terms & Privacy.
              </p>
            </form>
          </Tabs>
        </Card>
      </div>
    </div>
  );
};

export default Auth;