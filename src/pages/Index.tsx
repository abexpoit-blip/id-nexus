import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Upload,
  Wallet,
  ShieldCheck,
  Clock,
  TrendingUp,
  CheckCircle2,
  ArrowRight,
  Sparkles,
  FileSpreadsheet,
  HandCoins,
  Lock,
} from "lucide-react";
import heroBg from "@/assets/hero-bg.jpg";
import { Logo } from "@/components/Logo";
import { BrandFooter } from "@/components/BrandFooter";

const Index = () => {
  return (
    <div className="min-h-screen bg-background text-foreground font-sans">
      {/* Top nav */}
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/70 backdrop-blur-xl">
        <div className="container flex h-16 items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <Logo size="md" />
          </Link>
          <nav className="hidden items-center gap-7 text-sm text-muted-foreground md:flex">
            <a href="#why" className="transition hover:text-foreground">Why sell</a>
            <a href="#earn" className="transition hover:text-foreground">Earnings</a>
            <a href="#how" className="transition hover:text-foreground">How it works</a>
            <a href="#faq" className="transition hover:text-foreground">FAQ</a>
          </nav>
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
              <Link to="/seller-login">Seller login</Link>
            </Button>
            <Button asChild size="sm" className="bg-gradient-brand text-primary-foreground shadow-glow hover:opacity-90">
              <Link to="/register">Apply as seller</Link>
            </Button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section
        className="relative overflow-hidden border-b border-border/60"
        style={{
          backgroundImage: `linear-gradient(180deg, hsl(224 47% 6% / 0.55), hsl(224 47% 6% / 0.95)), url(${heroBg})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      >
        <div className="container relative grid gap-12 py-20 md:py-32 lg:grid-cols-12 lg:items-center">
          <div className="lg:col-span-7">
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-border/80 bg-card/60 px-3 py-1 text-xs text-muted-foreground backdrop-blur">
              <Sparkles className="h-3 w-3 text-primary" />
              Now onboarding sellers · Bangladesh
            </div>
            <h1 className="font-display text-4xl font-bold leading-[1.05] tracking-tight md:text-6xl lg:text-7xl">
              Sell your stock on{" "}
              <span className="bg-gradient-brand bg-clip-text text-transparent">
                Nexus X
              </span>{" "}
              — get paid in BDT.
            </h1>
            <p className="mt-6 max-w-xl text-base text-muted-foreground md:text-lg">
              Bangladesh's premium reseller network for Facebook ad accounts. Upload your Excel,
              we handle dedupe, delivery and disputes. You focus on stock — we focus on payouts.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild size="lg" className="bg-gradient-brand text-primary-foreground shadow-glow hover:opacity-90">
                <Link to="/register">
                  Apply as seller <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="border-border/80 bg-card/40 backdrop-blur">
                <Link to="/seller-login">Seller login</Link>
              </Button>
            </div>

            <div className="mt-10 grid max-w-lg grid-cols-3 gap-4">
              {[
                { k: "100%", v: "Manual approval" },
                { k: "BDT", v: "Direct payout" },
                { k: "24/7", v: "Auto delivery" },
              ].map((s) => (
                <div key={s.v} className="rounded-xl border border-border/60 bg-card/40 p-4 backdrop-blur">
                  <div className="font-display text-2xl font-bold text-foreground">{s.k}</div>
                  <div className="text-xs text-muted-foreground">{s.v}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="lg:col-span-5">
            <Card className="overflow-hidden border-border/60 bg-gradient-card p-6 shadow-card">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <div className="text-xs uppercase tracking-widest text-muted-foreground">Seller dashboard</div>
                  <div className="font-display text-xl font-semibold">Today's payout</div>
                </div>
                <span className="rounded-full bg-success/15 px-3 py-1 text-xs font-medium text-success">
                  Live
                </span>
              </div>
              <div className="space-y-3">
                {[
                  { name: "Stock uploaded", val: "412 IDs", tag: "Today" },
                  { name: "Sold today", val: "297 IDs", tag: "72% rate" },
                  { name: "Pending balance", val: "Eligible", tag: "Cutoff 11:50 PM" },
                  { name: "Withdraw on request", val: "bKash · Nagad", tag: "Instant" },
                ].map((p) => (
                  <div
                    key={p.name}
                    className="flex items-center justify-between rounded-lg border border-border/50 bg-background/40 p-3 transition hover:border-primary/40"
                  >
                    <div>
                      <div className="text-sm font-medium">{p.name}</div>
                      <div className="text-xs text-muted-foreground">{p.tag}</div>
                    </div>
                    <div className="text-right">
                      <div className="font-display text-sm font-semibold text-primary">{p.val}</div>
                    </div>
                  </div>
                ))}
              </div>
              <Button asChild className="mt-5 w-full bg-gradient-brand text-primary-foreground hover:opacity-90">
                <Link to="/register">Start your application</Link>
              </Button>
            </Card>
          </div>
        </div>
      </section>

      {/* Why sell */}
      <section id="why" className="container py-20">
        <div className="mb-12 max-w-2xl">
          <div className="text-xs uppercase tracking-widest text-primary">Why Nexus X</div>
          <h2 className="mt-3 font-display text-3xl font-bold md:text-4xl">
            Built for Bangladeshi sellers — not random buyers.
          </h2>
          <p className="mt-3 text-muted-foreground">
            We are an invite-only seller network. Every seller is hand-approved by admin so the
            marketplace stays clean, payouts stay fast, and your stock never competes with low-trust uploads.
          </p>
        </div>
        <div className="grid gap-6 md:grid-cols-3">
          {[
            {
              icon: ShieldCheck,
              title: "Admin-approved only",
              desc: "Every seller passes manual review. No spammers, no duplicate stock farms — only verified Bangladeshi resellers.",
              tag: "Trust",
            },
            {
              icon: HandCoins,
              title: "Direct BDT payout",
              desc: "Withdraw any time to bKash or Nagad. No hidden fees, no USD conversion games. Admin processes manually within hours.",
              tag: "Earnings",
            },
            {
              icon: TrendingUp,
              title: "Sell rate dashboard",
              desc: "See exactly what's selling, what's stuck, and your daily payout in one screen. Optimise your stock in real time.",
              tag: "Insight",
            },
          ].map((c) => (
            <Card
              key={c.title}
              className="group relative overflow-hidden border-border/60 bg-gradient-card p-6 shadow-card transition hover:-translate-y-1 hover:shadow-glow"
            >
              <div className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-lg bg-gradient-brand text-primary-foreground">
                <c.icon className="h-5 w-5" />
              </div>
              <div className="mb-1 text-[10px] uppercase tracking-widest text-muted-foreground">
                {c.tag}
              </div>
              <h3 className="font-display text-xl font-semibold">{c.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{c.desc}</p>
            </Card>
          ))}
        </div>
      </section>

      {/* How it works for sellers */}
      <section id="how" className="border-y border-border/60 bg-muted/20 py-20">
        <div className="container">
          <div className="mb-12 max-w-2xl">
            <div className="text-xs uppercase tracking-widest text-primary">How it works</div>
            <h2 className="mt-3 font-display text-3xl font-bold md:text-4xl">
              From application to first payout — in under 24 hours.
            </h2>
          </div>
          <div className="grid gap-6 md:grid-cols-4">
            {[
              { icon: Lock, t: "1. Apply", d: "Fill the short application — name, contact handle, why you want to sell. Takes 2 minutes." },
              { icon: ShieldCheck, t: "2. Get approved", d: "Admin reviews manually and grants seller access. Usually within a few hours." },
              { icon: Upload, t: "3. Upload Excel", d: "Drop your .xlsx — we parse and dedupe UIDs globally so nothing is sold twice." },
              { icon: Wallet, t: "4. Get paid in BDT", d: "Track sold IDs in real time. Request withdraw to bKash or Nagad anytime." },
            ].map((s, i) => (
              <div key={s.t} className="relative rounded-xl border border-border/60 bg-card/60 p-6">
                <div className="absolute right-4 top-4 font-display text-4xl font-bold text-muted/30">
                  0{i + 1}
                </div>
                <s.icon className="h-6 w-6 text-primary" />
                <div className="mt-4 font-display text-base font-semibold">{s.t}</div>
                <p className="mt-1 text-sm text-muted-foreground">{s.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Earnings / dashboard preview */}
      <section id="earn" className="container py-20">
        <div className="grid gap-10 lg:grid-cols-2 lg:items-center">
          <div>
            <div className="text-xs uppercase tracking-widest text-secondary">Seller dashboard</div>
            <h2 className="mt-3 font-display text-3xl font-bold md:text-4xl">
              Upload Excel. Get paid. Track every report.
            </h2>
            <p className="mt-4 text-muted-foreground">
              Drop your <code className="rounded bg-muted px-1.5 py-0.5 text-xs">.xlsx</code> file —
              we parse, dedupe UIDs globally and show you a clean preview before stock goes live.
              Daily cutoff at 11:50 PM BDT.
            </p>
            <ul className="mt-6 space-y-3 text-sm">
              {[
                "Live paid / unpaid balance with one-click withdraw",
                "Replacement notifications for any of your IDs",
                "Today's submissions, sell rate, and stock counter",
                "Tutorial videos straight from the dashboard",
              ].map((b) => (
                <li key={b} className="flex items-start gap-3">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary" />
                  <span className="text-muted-foreground">{b}</span>
                </li>
              ))}
            </ul>
            <Button asChild size="lg" className="mt-8 bg-gradient-brand text-primary-foreground shadow-glow hover:opacity-90">
              <Link to="/register">Apply as seller <ArrowRight className="ml-2 h-4 w-4" /></Link>
            </Button>
          </div>
          <Card className="border-border/60 bg-gradient-card p-6 shadow-card">
            <div className="rounded-lg border border-dashed border-primary/40 bg-background/40 p-10 text-center">
              <FileSpreadsheet className="mx-auto h-10 w-10 text-primary" />
              <div className="mt-4 font-display text-lg font-semibold">Drop your stock file</div>
              <div className="text-sm text-muted-foreground">
                .xlsx with UID, password, 2FA columns
              </div>
              <div className="mt-6 grid grid-cols-3 gap-3 text-left">
                <div className="rounded-md bg-background/60 p-3">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Parsed</div>
                  <div className="font-display text-lg font-semibold">512</div>
                </div>
                <div className="rounded-md bg-background/60 p-3">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Accepted</div>
                  <div className="font-display text-lg font-semibold text-success">498</div>
                </div>
                <div className="rounded-md bg-background/60 p-3">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Duplicates</div>
                  <div className="font-display text-lg font-semibold text-warning">14</div>
                </div>
              </div>
            </div>
          </Card>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="border-t border-border/60 bg-muted/20 py-20">
        <div className="container max-w-3xl">
          <div className="mb-10 text-center">
            <div className="text-xs uppercase tracking-widest text-primary">FAQ</div>
            <h2 className="mt-3 font-display text-3xl font-bold md:text-4xl">
              Seller questions
            </h2>
          </div>
          <Accordion type="single" collapsible className="w-full">
            {[
              {
                q: "Who can become a seller?",
                a: "Bangladeshi resellers with a steady supply of Facebook ad accounts (61xxx or 1000xxx). Every application is reviewed manually by admin — we don't auto-approve anyone.",
              },
              {
                q: "How long does approval take?",
                a: "Usually a few hours during business hours, max 24 hours. You'll get a notification once admin reviews. If rejected, you'll see the reason and can re-apply.",
              },
              {
                q: "How and when do I get paid?",
                a: "Sold IDs move from 'Pending' to 'Paid' balance after the daily cutoff (11:50 PM BDT). You can request a withdraw to bKash or Nagad anytime — admin processes manually within hours.",
              },
              {
                q: "What about replacements?",
                a: "Buyers can report bad IDs within 2h (1–2 IDs) or 6h (3+ IDs). If verified, we swap from your stock and the original sale is reversed. Honest sellers rarely see issues.",
              },
              {
                q: "Is there a buyer marketplace I can browse?",
                a: "Not right now — we're focused on building a strong seller network first. Buyer access will open later. For now, the platform is seller-only.",
              },
            ].map((item, i) => (
              <AccordionItem key={i} value={`item-${i}`} className="border-border/60">
                <AccordionTrigger className="text-left font-display text-base font-medium hover:text-primary">
                  {item.q}
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground">{item.a}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </section>

      {/* CTA */}
      <section className="container py-20">
        <Card className="relative overflow-hidden border-border/60 bg-gradient-card p-10 text-center shadow-card md:p-16">
          <div className="absolute inset-0 bg-gradient-brand opacity-10" />
          <div className="relative">
            <Clock className="mx-auto mb-4 h-8 w-8 text-primary" />
            <h2 className="font-display text-3xl font-bold md:text-5xl">
              Seller spots are limited.
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-muted-foreground">
              We hand-pick every seller to keep the network clean and payouts fast.
              Apply now while the intake is still open.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Button asChild size="lg" className="bg-gradient-brand text-primary-foreground shadow-glow hover:opacity-90">
                <Link to="/register">Apply as seller <ArrowRight className="ml-2 h-4 w-4" /></Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="border-border/80">
                <Link to="/seller-login">Already approved? Login</Link>
              </Button>
            </div>
          </div>
        </Card>
      </section>

      {/* Footer */}
      <BrandFooter />
    </div>
  );
};

export default Index;
