import { useEffect, useRef, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { z } from "zod";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Clock, XCircle, Loader2, Store, Lock, Sparkles, ShieldCheck, Send, CheckCircle2, Copy } from "lucide-react";
import { toast } from "sonner";

interface Application {
  id: string;
  status: "pending" | "approved" | "rejected";
  telegram_username: string | null;
  reason: string | null;
  admin_note: string | null;
  created_at: string;
  reviewed_at: string | null;
}

const emailSchema = z.string().trim().email("Enter a valid email").max(255);
const passwordSchema = z.string().min(8, "Password min 8 characters").max(72);
const nameSchema = z.string().trim().min(2, "Name too short").max(60);

const SellerApply = () => {
  const { user, roles, loading: authLoading, signUp } = useAuth();
  const navigate = useNavigate();
  const [app, setApp] = useState<Application | null>(null);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [tgUsername, setTgUsername] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [intakeEnabled, setIntakeEnabled] = useState<boolean>(true);
  const prevStatusRef = useRef<Application["status"] | null>(null);

  const isSeller = roles.includes("seller") || roles.includes("admin");
  const isPublic = !user;

  const load = async () => {
    if (!user) {
      try {
        const { enabled } = await api.get<{ enabled: boolean }>("/api/seller/apply-enabled");
        setIntakeEnabled(enabled);
      } catch { /* ignore */ }
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [{ application }, { enabled }] = await Promise.all([
        api.get<{ application: Application | null }>("/api/seller/application"),
        api.get<{ enabled: boolean }>("/api/seller/apply-enabled").catch(() => ({ enabled: true })),
      ]);
      setIntakeEnabled(enabled);
      if (application) {
        setApp(application);
        setTgUsername(application.telegram_username ?? "");
        setReason(application.reason ?? "");
      }
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // Toast + redirect when admin approves/rejects in the background
  useEffect(() => {
    const prev = prevStatusRef.current;
    const curr = app?.status ?? null;
    if (prev && curr && prev !== curr) {
      if (curr === "approved") {
        toast.success("Approved! Opening seller dashboard…");
        setTimeout(() => navigate("/seller", { replace: true }), 1500);
      } else if (curr === "rejected") {
        toast.error("Application rejected. You can update and re-apply below.");
      }
    }
    prevStatusRef.current = curr;
  }, [app?.status, navigate]);

  const validateHandle = () => {
    const handle = tgUsername.trim().replace(/^@/, "").toLowerCase();
    if (handle.length < 3 || !/^[a-z0-9_]{3,32}$/.test(handle)) {
      toast.error("Contact handle: 3-32 chars, only a-z, 0-9, _");
      return null;
    }
    return handle;
  };

  // Public: signup + submit application in one step
  const submitPublic = async () => {
    if (!intakeEnabled) return toast.error("Seller applications are currently closed.");
    setSubmitting(true);
    try {
      const cleanEmail = emailSchema.parse(email);
      const cleanPwd = passwordSchema.parse(password);
      const cleanName = nameSchema.parse(displayName);
      const handle = validateHandle();
      if (!handle) { setSubmitting(false); return; }

      await signUp(cleanEmail, cleanPwd, cleanName);
      const pubBody: Record<string, string> = {
        display_name: cleanName,
        telegram_username: handle,
      };
      const pubReason = reason.trim();
      if (pubReason) pubBody.reason = pubReason;
      await api.post("/api/seller/apply", pubBody);
      toast.success("Application submitted! Admin will review shortly.");
      load();
    } catch (e: any) {
      if (e?.issues?.[0]?.message) toast.error(e.issues[0].message);
      else if (e?.message === "email_taken")
        toast.error("Email already registered. Please sign in first.");
      else toast.error(e instanceof ApiError ? e.message : e?.message || "Submit failed");
    } finally {
      setSubmitting(false);
    }
  };

  // Authenticated: re-submit / first-time submit for current user
  const submit = async () => {
    if (!intakeEnabled) {
      return toast.error("Seller applications are currently closed by the admin.");
    }
    const handle = validateHandle();
    if (!handle) return;
    setSubmitting(true);
    try {
      const body: Record<string, string> = { telegram_username: handle };
      const trimmedReason = reason.trim();
      if (trimmedReason) body.reason = trimmedReason;
      await api.post("/api/seller/apply", body);
      toast.success(app?.status === "rejected" ? "Re-submitted — admin will review again." : "Application submitted!");
      load();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Submit failed");
    } finally {
      setSubmitting(false);
    }
  };

  if (authLoading)
    return <div className="flex min-h-screen items-center justify-center bg-background"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  if (isSeller) return <Navigate to="/seller" replace />;

  return (
    <div
      className="min-h-screen bg-background bg-premium-ambient text-foreground"
    >
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-xl">
        <div className="container flex h-16 items-center justify-between">
          <div className="flex items-center gap-4">
            <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">
              <ArrowLeft className="inline h-4 w-4" /> Home
            </Link>
            <Logo size="sm" showTagline={false} />
            <span className="pill-gold">Seller application</span>
          </div>
          {isPublic && (
            <Link to="/seller-login" className="text-gold text-sm font-semibold hover:underline">
              Already approved? Login
            </Link>
          )}
        </div>
      </header>

      <main className="container max-w-2xl py-10">
        <div className="mb-6 flex items-center gap-3">
          <div
            className="rounded-xl p-3"
            style={{
              backgroundImage: "var(--gradient-gold)",
              boxShadow: "0 12px 30px -10px hsl(var(--brand-gold) / 0.55)",
            }}
          >
            <Store className="h-6 w-6" style={{ color: "hsl(224 47% 6%)" }} />
          </div>
          <div>
            <h1 className="font-display text-2xl font-bold md:text-3xl">Become a seller</h1>
            <p className="text-sm text-muted-foreground">
              {isPublic
                ? "Create your account and apply in one step. Admin reviews manually."
                : "Apply to upload and sell accounts on Nexus X."}
            </p>
          </div>
        </div>

        {loading ? (
          <div className="flex h-32 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
        ) : !intakeEnabled && !(app && app.status === "approved") ? (
          <Card className="glass-panel border-destructive/40 bg-destructive/5 p-6">
            <div className="flex items-start gap-3">
              <Lock className="mt-1 h-5 w-5 text-destructive" />
              <div>
                <div className="font-display text-lg font-semibold text-destructive">Applications closed</div>
                <p className="mt-1 text-sm text-muted-foreground">
                  The admin has temporarily disabled new seller applications. Please check back later.
                </p>
              </div>
            </div>
          </Card>
        ) : app && app.status === "pending" ? (
          <Card className="relative overflow-hidden border-0 p-0">
            {/* Premium gold-noir backdrop */}
            <div
              className="pointer-events-none absolute inset-0"
              style={{
                backgroundImage:
                  "radial-gradient(120% 80% at 0% 0%, hsl(var(--brand-gold) / 0.18), transparent 60%), radial-gradient(120% 80% at 100% 100%, hsl(var(--primary) / 0.18), transparent 60%), linear-gradient(180deg, hsl(224 47% 7%), hsl(224 47% 4%))",
              }}
            />
            <div className="pointer-events-none absolute inset-0 ring-1 ring-inset ring-white/5 rounded-[inherit]" />

            <div className="relative p-6 md:p-8">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-[0.22em]"
                  style={{
                    backgroundImage: "var(--gradient-gold)",
                    color: "hsl(224 47% 6%)",
                  }}
                >
                  <ShieldCheck className="h-3.5 w-3.5" />
                  Manual verification required
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-warning/40 bg-warning/10 px-3 py-1 text-[11px] font-semibold text-warning">
                  <Clock className="h-3 w-3" /> Pending review
                </span>
              </div>

              <h2 className="font-display mt-4 text-2xl font-bold text-foreground md:text-3xl">
                Welcome to Nexus X — one final step.
              </h2>
              <p className="mt-2 max-w-xl text-sm text-muted-foreground">
                Your seller account was created successfully. To unlock the seller console,
                upload stock and receive payouts, you must <strong className="text-foreground">contact our admin on Telegram</strong> for
                identity &amp; trust verification. This protects buyers and keeps the marketplace clean.
              </p>

              {/* Telegram CTA */}
              <div
                className="mt-6 flex flex-col gap-3 rounded-2xl border border-border/60 bg-background/50 p-4 backdrop-blur md:flex-row md:items-center md:justify-between"
              >
                <div className="flex items-center gap-3">
                  <div
                    className="flex h-12 w-12 items-center justify-center rounded-xl"
                    style={{
                      backgroundImage: "linear-gradient(135deg, #229ED9, #1b6fa8)",
                      boxShadow: "0 10px 24px -10px rgba(34,158,217,0.55)",
                    }}
                  >
                    <Send className="h-6 w-6 text-white" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                      Contact admin on Telegram
                    </div>
                    <div className="font-display text-lg font-bold leading-tight">@NexusXPro</div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      navigator.clipboard.writeText("https://t.me/NexusXPro");
                      toast.success("Telegram link copied");
                    }}
                  >
                    <Copy className="mr-1.5 h-3.5 w-3.5" /> Copy link
                  </Button>
                  <Button
                    asChild
                    className="btn-gold"
                    size="sm"
                  >
                    <a href="https://t.me/NexusXPro" target="_blank" rel="noopener noreferrer">
                      <Send className="mr-1.5 h-4 w-4" />
                      Open Telegram
                    </a>
                  </Button>
                </div>
              </div>

              {/* Steps */}
              <ol className="mt-6 grid gap-3 md:grid-cols-3">
                {[
                  { t: "Message admin", d: "Send hello on Telegram with your registered email." },
                  { t: "Quick verification", d: "Admin checks identity & seller intent (a few minutes to hours)." },
                  { t: "Get instant access", d: "This page auto-redirects to your seller dashboard the moment you're approved." },
                ].map((s, i) => (
                  <li
                    key={s.t}
                    className="rounded-xl border border-border/60 bg-background/40 p-3"
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className="flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold"
                        style={{
                          backgroundImage: "var(--gradient-gold)",
                          color: "hsl(224 47% 6%)",
                        }}
                      >
                        {i + 1}
                      </span>
                      <div className="text-sm font-semibold">{s.t}</div>
                    </div>
                    <p className="mt-1.5 text-xs text-muted-foreground">{s.d}</p>
                  </li>
                ))}
              </ol>

              <div className="mt-6 grid gap-2 rounded-xl border border-border/40 bg-background/30 p-4 text-sm">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                  Submitted {new Date(app.created_at).toLocaleString()}
                </div>
                <div><span className="text-muted-foreground">Your contact:</span> <strong>@{app.telegram_username}</strong></div>
                {app.reason && <div><span className="text-muted-foreground">Reason:</span> {app.reason}</div>}
              </div>

              <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" />
                Listening for admin decision — auto-redirect on approval…
              </div>
            </div>
          </Card>
        ) : app && app.status === "approved" ? (
          <Card className="glass-panel border-success/40 bg-success/5 p-6">
            <div className="flex items-start gap-3">
              <Sparkles className="mt-1 h-5 w-5 text-success" />
              <div className="flex-1">
                <div className="font-display text-lg font-semibold text-success">Approved — welcome aboard!</div>
                <p className="mt-1 text-sm text-muted-foreground">
                  You can now upload stock, track sales, and request payouts.
                </p>
                {app.admin_note && (
                  <p className="mt-2 rounded-md border border-success/30 bg-background/40 p-2 text-xs">
                    <span className="font-semibold">Admin note:</span> {app.admin_note}
                  </p>
                )}
                <Button className="btn-gold mt-4" onClick={() => navigate("/seller")}>
                  Open Seller Dashboard
                </Button>
              </div>
            </div>
          </Card>
        ) : (
          <Card className="glass-panel-strong border-0 p-6">
            {app?.status === "rejected" && (
              <div className="mb-5 flex items-start gap-3 rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm">
                <XCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-destructive" />
                <div>
                  <div className="font-semibold text-destructive">Previous application rejected</div>
                  {app.admin_note && <div className="mt-1 text-destructive/90"><strong>Reason:</strong> {app.admin_note}</div>}
                  <div className="mt-1 text-xs text-muted-foreground">You can update and re-submit below.</div>
                </div>
              </div>
            )}

            <div className="space-y-4">
              <div>
                <Label htmlFor="fullname">Full name <span className="text-destructive">*</span></Label>
                <Input id="fullname" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="As on your ID" maxLength={120} className="mt-1.5" />
              </div>
              <div>
                <Label htmlFor="email">Email <span className="text-destructive">*</span></Label>
                <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" className="mt-1.5" disabled={!isPublic} />
              </div>
              {isPublic && (
                <div>
                  <Label htmlFor="password">Password <span className="text-destructive">*</span></Label>
                  <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Min 8 characters" autoComplete="new-password" minLength={8} maxLength={72} className="mt-1.5" />
                  <p className="mt-1 text-xs text-muted-foreground">You'll log in with this email + password once approved.</p>
                </div>
              )}
              <div>
                <Label htmlFor="phone">Phone number <span className="text-destructive">*</span></Label>
                <Input id="phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+8801XXXXXXXXX" maxLength={40} className="mt-1.5" autoComplete="tel" />
                <p className="mt-1 text-xs text-muted-foreground">Include country code. Used only by admin for verification.</p>
              </div>

              <div>
                <Label htmlFor="tg">Telegram ID <span className="text-destructive">*</span></Label>
                <Input
                  id="tg"
                  value={tgUsername}
                  onChange={(e) => setTgUsername(e.target.value)}
                  placeholder="@yourname"
                  maxLength={33}
                  className="mt-1.5"
                />
                <p className="mt-1 text-xs text-muted-foreground">Your Telegram username — admin will reach you here for verification.</p>
              </div>
              <div>
                <Label htmlFor="reason">Why do you want to sell? (optional)</Label>
                <Textarea
                  id="reason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Tell us about your stock source, experience, daily volume..."
                  rows={4}
                  className="mt-1.5"
                  maxLength={1000}
                />
              </div>
              <Button
                onClick={isPublic ? submitPublic : submit}
                disabled={submitting}
                className="btn-gold w-full"
                size="lg"
              >
                {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isPublic
                  ? "Create account & submit"
                  : app?.status === "rejected"
                  ? "Re-submit application"
                  : "Submit application"}
              </Button>
              <p className="text-center text-xs text-muted-foreground">
                Admin review usually takes a few hours. Status updates appear here automatically.
              </p>
            </div>
          </Card>
        )}
      </main>
    </div>
  );
};

export default SellerApply;