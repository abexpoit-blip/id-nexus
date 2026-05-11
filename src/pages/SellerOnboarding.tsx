import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Logo } from "@/components/Logo";
import {
  ArrowLeft, ArrowRight, CheckCircle2, Loader2, Sparkles, Store, Upload, User2,
} from "lucide-react";
import { toast } from "sonner";

interface Category {
  id: string;
  name: string;
  slug: string;
  price_bdt: number;
}

const STEPS = [
  { key: "profile", label: "Profile", icon: User2 },
  { key: "category", label: "Category", icon: Store },
  { key: "upload", label: "First upload", icon: Upload },
] as const;

const SellerOnboarding = () => {
  const { user, roles, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [stepIdx, setStepIdx] = useState(0);
  const [displayName, setDisplayName] = useState("");
  const [linkCode, setLinkCode] = useState<string>("");
  const [tgChatId, setTgChatId] = useState<number | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [pickedCategory, setPickedCategory] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [refreshingTg, setRefreshingTg] = useState(false);

  const isSeller = roles.includes("seller") || roles.includes("admin");

  // Load profile + categories
  useEffect(() => {
    if (!user) return;
    (async () => {
      const [{ data: prof }, { data: cats }] = await Promise.all([
        supabase
          .from("profiles")
          .select("display_name, telegram_link_code, telegram_chat_id")
          .eq("id", user.id)
          .maybeSingle(),
        supabase
          .from("categories")
          .select("id, name, slug, price_bdt")
          .eq("is_active", true)
          .eq("kind", "fb_account")
          .order("sort_order"),
      ]);
      setDisplayName(prof?.display_name ?? "");
      setLinkCode(prof?.telegram_link_code ?? "");
      setTgChatId(prof?.telegram_chat_id ?? null);
      setCategories((cats ?? []) as Category[]);
    })();
  }, [user?.id]);

  // Realtime: when bot links Telegram, advance automatically
  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel(`onboarding-profile-${user.id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "profiles", filter: `id=eq.${user.id}` },
        (payload) => {
          const next = (payload.new ?? {}) as { telegram_chat_id?: number | null };
          if (next.telegram_chat_id) {
            setTgChatId(next.telegram_chat_id);
            toast.success("Telegram linked! ✅");
          }
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user?.id]);

  const refreshTg = async () => {
    if (!user) return;
    setRefreshingTg(true);
    const { data } = await supabase
      .from("profiles")
      .select("telegram_chat_id")
      .eq("id", user.id)
      .maybeSingle();
    setTgChatId(data?.telegram_chat_id ?? null);
    setRefreshingTg(false);
    if (data?.telegram_chat_id) toast.success("Telegram linked!");
    else toast.message("Bot এখনো link পায়নি — /start <code> পাঠিয়েছেন?");
  };

  const saveProfile = async () => {
    if (!user) return;
    const name = displayName.trim();
    if (name.length < 2) return toast.error("Display name minimum 2 characters");
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({ display_name: name })
      .eq("id", user.id);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Profile saved");
    setStepIdx(1);
  };

  const finish = async () => {
    if (!pickedCategory) return toast.error("একটা category বেছে নিন");
    setFinishing(true);
    const { error } = await supabase.rpc("mark_seller_onboarded");
    setFinishing(false);
    if (error) return toast.error(error.message);
    toast.success("🎉 Onboarding complete! Redirecting to upload…");
    sessionStorage.setItem("seller_default_category", pickedCategory);
    setTimeout(() => navigate("/seller", { replace: true }), 600);
  };

  const progress = useMemo(() => ((stepIdx + 1) / STEPS.length) * 100, [stepIdx]);

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  if (!isSeller) return <Navigate to="/apply-seller" replace />;

  const StepIcon = STEPS[stepIdx].icon;

  return (
    <div
      className="min-h-screen bg-background text-foreground"
      style={{
        backgroundImage:
          "radial-gradient(ellipse at top, hsl(265 84% 62% / 0.18), transparent 55%), radial-gradient(ellipse at bottom, hsl(174 84% 50% / 0.12), transparent 55%)",
      }}
    >
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-xl">
        <div className="container flex h-16 items-center justify-between">
          <Link to="/seller" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> Skip to dashboard
          </Link>
          <Logo size="sm" showTagline={false} />
          <Badge variant="outline" className="gap-1"><Sparkles className="h-3 w-3" /> Seller setup</Badge>
        </div>
      </header>

      <main className="container max-w-3xl py-8 md:py-12">
        {/* Stepper */}
        <div className="mb-6">
          <div className="mb-3 flex items-center justify-between">
            {STEPS.map((s, i) => {
              const Icon = s.icon;
              const active = i === stepIdx;
              const done = i < stepIdx;
              return (
                <div key={s.key} className="flex flex-1 items-center gap-2">
                  <div
                    className={`flex h-9 w-9 items-center justify-center rounded-full border-2 transition-all ${
                      active
                        ? "border-primary bg-primary/15 text-primary shadow-glow"
                        : done
                          ? "border-success bg-success/15 text-success"
                          : "border-border bg-card text-muted-foreground"
                    }`}
                  >
                    {done ? <CheckCircle2 className="h-5 w-5" /> : <Icon className="h-4 w-4" />}
                  </div>
                  <span className={`hidden text-xs md:inline ${active ? "font-semibold text-foreground" : "text-muted-foreground"}`}>
                    {s.label}
                  </span>
                  {i < STEPS.length - 1 && <div className="mx-1 h-px flex-1 bg-border" />}
                </div>
              );
            })}
          </div>
          <div className="h-1 w-full overflow-hidden rounded-full bg-border/60">
            <div className="h-full bg-gradient-brand transition-all" style={{ width: `${progress}%` }} />
          </div>
        </div>

        <Card
          className="border-primary/30 bg-gradient-card p-6 md:p-8"
          style={{ boxShadow: "0 0 40px -16px hsl(var(--primary) / 0.5)" }}
        >
          <div className="mb-5 flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-brand shadow-glow">
              <StepIcon className="h-6 w-6 text-primary-foreground" />
            </div>
            <div>
              <div className="text-xs uppercase tracking-widest text-muted-foreground">
                Step {stepIdx + 1} / {STEPS.length}
              </div>
              <h1 className="font-display text-2xl font-bold">{STEPS[stepIdx].label}</h1>
            </div>
          </div>

          {/* STEP 0: Profile */}
          {stepIdx === 0 && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Buyer-দের কাছে আপনার seller name কী দেখাবে সেটা ঠিক করুন।
              </p>
              <div>
                <Label htmlFor="dn">Display name</Label>
                <Input
                  id="dn"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="e.g. Shovon Store"
                  className="mt-1.5"
                />
              </div>
              <div className="flex justify-end">
                <Button onClick={saveProfile} disabled={saving} className="bg-gradient-brand text-primary-foreground shadow-glow">
                  {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Save & continue <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          {/* STEP 1: Telegram */}
          {stepIdx === 1 && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Order/payout notification পেতে Telegram connect করুন। এই code-টা bot-কে পাঠাতে হবে।
              </p>
              <div className="rounded-xl border border-primary/40 bg-card/60 p-4 text-center">
                <div className="text-xs uppercase tracking-widest text-muted-foreground">Your link code</div>
                <div className="mt-1 select-all font-mono text-2xl font-bold text-primary">{linkCode || "—"}</div>
                <div className="mt-2 text-xs text-muted-foreground">
                  Telegram bot-এ গিয়ে পাঠান: <span className="font-mono">/start {linkCode}</span>
                </div>
              </div>

              <div
                className={`rounded-lg border p-4 text-sm ${
                  tgChatId
                    ? "border-success/40 bg-success/10 text-success"
                    : "border-warning/40 bg-warning/10 text-warning"
                }`}
              >
                {tgChatId ? (
                  <span className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4" /> Telegram linked ✅</span>
                ) : (
                  <span>⏳ এখনো link হয়নি। Bot-এ message পাঠানোর পর "Refresh" চাপুন।</span>
                )}
              </div>

              <div className="flex flex-wrap justify-between gap-2">
                <Button variant="outline" onClick={() => setStepIdx(0)}>
                  <ArrowLeft className="mr-2 h-4 w-4" /> Back
                </Button>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={refreshTg} disabled={refreshingTg}>
                    {refreshingTg && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Refresh status
                  </Button>
                  <Button onClick={() => setStepIdx(2)} className="bg-gradient-brand text-primary-foreground shadow-glow">
                    {tgChatId ? "Continue" : "Skip for now"} <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* STEP 2: Category */}
          {stepIdx === 2 && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                আপনি প্রথমে কোন category-তে ID upload করতে চান? পরে যেকোনো সময় বদলাতে পারবেন।
              </p>
              {categories.length === 0 ? (
                <div className="rounded-lg border border-border/60 bg-card/40 p-6 text-center text-sm text-muted-foreground">
                  এখনো কোনো active category নেই। Admin add করার পর refresh করুন।
                </div>
              ) : (
                <div className="grid gap-3 md:grid-cols-2">
                  {categories.map((c) => {
                    const active = pickedCategory === c.id;
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => setPickedCategory(c.id)}
                        className={`group rounded-xl border-2 p-4 text-left transition-all ${
                          active
                            ? "border-primary bg-primary/10 shadow-glow"
                            : "border-border bg-card/40 hover:border-primary/50"
                        }`}
                      >
                        <div className="flex items-start justify-between">
                          <div>
                            <div className="font-display text-base font-bold">{c.name}</div>
                            <div className="mt-1 text-xs text-muted-foreground">{c.slug}</div>
                          </div>
                          <Badge variant="outline" className="border-primary/40 text-primary">
                            ৳{c.price_bdt}
                          </Badge>
                        </div>
                        {active && (
                          <div className="mt-3 flex items-center gap-1 text-xs text-success">
                            <CheckCircle2 className="h-3 w-3" /> Selected
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
              <div className="flex justify-between">
                <Button variant="outline" onClick={() => setStepIdx(1)}>
                  <ArrowLeft className="mr-2 h-4 w-4" /> Back
                </Button>
                <Button
                  onClick={() => setStepIdx(3)}
                  disabled={!pickedCategory}
                  className="bg-gradient-brand text-primary-foreground shadow-glow"
                >
                  Continue <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          {/* STEP 3: First upload guide */}
          {stepIdx === 3 && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                সব ready! Seller dashboard-এ গেলে এই category পূর্বনির্ধারিত থাকবে। CSV/XLSX file-এ এই columns রাখুন:
              </p>
              <div className="rounded-lg border border-border/60 bg-card/40 p-4">
                <div className="font-mono text-sm">
                  <span className="text-primary">uid</span>, <span className="text-primary">password</span>,
                  <span className="text-muted-foreground"> two_fa</span>,
                  <span className="text-muted-foreground"> email</span>,
                  <span className="text-muted-foreground"> email_password</span>
                </div>
                <div className="mt-2 text-xs text-muted-foreground">
                  <strong className="text-foreground">uid</strong> ও <strong className="text-foreground">password</strong> বাধ্যতামূলক, বাকিগুলো optional।
                </div>
              </div>

              <div className="rounded-lg border border-success/40 bg-success/10 p-4 text-sm">
                <div className="font-semibold text-success">✓ আপনার setup-এর summary</div>
                <ul className="mt-2 space-y-1 text-muted-foreground">
                  <li>• Display name: <span className="text-foreground">{displayName || "—"}</span></li>
                  <li>• Telegram: {tgChatId ? <span className="text-success">Linked ✅</span> : <span className="text-warning">Not linked</span>}</li>
                  <li>• Default category: <span className="text-foreground">{categories.find(c => c.id === pickedCategory)?.name ?? "—"}</span></li>
                </ul>
              </div>

              <div className="flex justify-between">
                <Button variant="outline" onClick={() => setStepIdx(2)}>
                  <ArrowLeft className="mr-2 h-4 w-4" /> Back
                </Button>
                <Button onClick={finish} disabled={finishing} size="lg" className="bg-gradient-brand text-primary-foreground shadow-glow">
                  {finishing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                  Finish & start uploading
                </Button>
              </div>
            </div>
          )}
        </Card>
      </main>
    </div>
  );
};

export default SellerOnboarding;