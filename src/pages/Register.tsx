import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { z } from "zod";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Logo } from "@/components/Logo";
import { BrandTagline } from "@/components/BrandTagline";
import { toast } from "sonner";
import { Loader2, ArrowLeft, Store, Info } from "lucide-react";

const emailSchema = z.string().trim().email("Enter a valid email").max(255);
const passwordSchema = z.string().min(8, "At least 8 characters").max(72);
const nameSchema = z.string().trim().min(2, "Name too short").max(60);

const Register = () => {
  const { user, loading: authLoading, signUp } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!authLoading && user) navigate("/apply-seller", { replace: true });
  }, [user, authLoading, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const cleanEmail = emailSchema.parse(email);
      const cleanPassword = passwordSchema.parse(password);
      const cleanName = nameSchema.parse(displayName);

      await signUp(cleanEmail, cleanPassword, cleanName);
      toast.success("Account created! Complete your seller application.");
      navigate("/apply-seller", { replace: true });
    } catch (err: any) {
      if (err?.issues?.[0]?.message) toast.error(err.issues[0].message);
      else if (err?.message === "email_taken") toast.error("Email already registered. Sign in instead.");
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
            <div className="mx-auto mb-3 inline-flex items-center justify-center rounded-xl bg-gradient-brand p-3 shadow-glow">
              <Store className="h-5 w-5 text-primary-foreground" />
            </div>
            <h1 className="font-display text-2xl font-bold">Become a seller</h1>
            <p className="mt-1 text-sm text-muted-foreground">Create your account, then apply for admin approval.</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 p-3 text-xs">
              <Info className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-warning" />
              <span className="text-muted-foreground">
                All accounts require <strong className="text-foreground">admin approval</strong>. After signup you'll fill a short application — review usually takes a few hours.
              </span>
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
              Create account & apply
            </Button>

            <p className="text-center text-sm text-muted-foreground">
              Already approved?{" "}
              <Link to="/seller-login" className="font-semibold text-primary underline-offset-2 hover:underline">
                Seller login
              </Link>
            </p>
          </form>
        </Card>
      </div>
    </div>
  );
};

export default Register;
