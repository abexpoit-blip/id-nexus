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
  ShieldCheck,
  Zap,
  RefreshCcw,
  Bot,
  Wallet,
  Globe,
  Upload,
  ArrowRight,
  CheckCircle2,
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
          <a href="#" className="flex items-center gap-2">
            <Logo size="md" />
          </a>
          <nav className="hidden items-center gap-7 text-sm text-muted-foreground md:flex">
            <a href="#categories" className="transition hover:text-foreground">Categories</a>
            <a href="#how" className="transition hover:text-foreground">How it works</a>
            <a href="#sellers" className="transition hover:text-foreground">For Sellers</a>
            <a href="#faq" className="transition hover:text-foreground">FAQ</a>
          </nav>
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
              <Link to="/login">Login</Link>
            </Button>
            <Button asChild size="sm" className="bg-gradient-brand text-primary-foreground shadow-glow hover:opacity-90">
              <Link to="/register">Get started</Link>
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
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary"></span>
              Trusted reseller marketplace · Bangladesh
            </div>
            <h1 className="font-display text-4xl font-bold leading-[1.05] tracking-tight md:text-6xl lg:text-7xl">
              Buy & resell{" "}
              <span className="bg-gradient-brand bg-clip-text text-transparent">
                Facebook Ad accounts
              </span>{" "}
              & VPN — instantly.
            </h1>
            <p className="mt-6 max-w-xl text-base text-muted-foreground md:text-lg">
              Agency-approved Facebook ad IDs and verified VPN access for Bangladeshi resellers.
              Instant Excel delivery, replacement protection, and a Telegram bot to manage every order on the go.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button size="lg" className="bg-gradient-brand text-primary-foreground shadow-glow hover:opacity-90">
                Browse stock <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
              <Button size="lg" variant="outline" className="border-border/80 bg-card/40 backdrop-blur">
                Become a seller
              </Button>
            </div>

            <div className="mt-10 grid max-w-lg grid-cols-3 gap-4">
              {[
                { k: "1.2k+", v: "IDs in stock" },
                { k: "98%", v: "Replacement OK" },
                { k: "24/7", v: "Bot delivery" },
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
                  <div className="text-xs uppercase tracking-widest text-muted-foreground">Live stock</div>
                  <div className="font-display text-xl font-semibold">Today's pricing</div>
                </div>
                <span className="rounded-full bg-success/15 px-3 py-1 text-xs font-medium text-success">
                  Live
                </span>
              </div>
              <div className="space-y-3">
                {[
                  { name: "FB ID — 61xxx", price: "৳ 120", stock: 384, tag: "Standard" },
                  { name: "FB ID — 1000xxx", price: "৳ 180", stock: 217, tag: "Premium" },
                  { name: "VPN — 7 days", price: "৳ 99", stock: "∞", tag: "Subscription" },
                  { name: "VPN — 30 days", price: "৳ 299", stock: "∞", tag: "Subscription" },
                ].map((p) => (
                  <div
                    key={p.name}
                    className="flex items-center justify-between rounded-lg border border-border/50 bg-background/40 p-3 transition hover:border-primary/40"
                  >
                    <div>
                      <div className="text-sm font-medium">{p.name}</div>
                      <div className="text-xs text-muted-foreground">{p.tag} · stock {p.stock}</div>
                    </div>
                    <div className="text-right">
                      <div className="font-display text-base font-semibold text-primary">{p.price}</div>
                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">/ pc</div>
                    </div>
                  </div>
                ))}
              </div>
              <Button className="mt-5 w-full bg-gradient-brand text-primary-foreground hover:opacity-90">
                Open dashboard
              </Button>
            </Card>
          </div>
        </div>
      </section>

      {/* Categories */}
      <section id="categories" className="container py-20">
        <div className="mb-12 max-w-2xl">
          <div className="text-xs uppercase tracking-widest text-primary">What we sell</div>
          <h2 className="mt-3 font-display text-3xl font-bold md:text-4xl">
            Two ID categories. One trusted source.
          </h2>
          <p className="mt-3 text-muted-foreground">
            Separate pricing for each category, set live by admin. All accounts are dedupe-checked
            globally, so no UID is ever sold twice.
          </p>
        </div>
        <div className="grid gap-6 md:grid-cols-3">
          {[
            {
              icon: ShieldCheck,
              title: "61xxx Accounts",
              desc: "Verified standard ad accounts ready for spending. Ideal for early-stage agencies.",
              tag: "Standard",
            },
            {
              icon: Zap,
              title: "1000xxx Accounts",
              desc: "Premium agency-approved IDs with higher trust score and consistent uptime.",
              tag: "Premium",
            },
            {
              icon: Globe,
              title: "VPN Access",
              desc: "Weekly & monthly plans. Manual fulfillment by admin within minutes of payment.",
              tag: "Service",
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

      {/* How it works */}
      <section id="how" className="border-y border-border/60 bg-muted/20 py-20">
        <div className="container">
          <div className="mb-12 max-w-2xl">
            <div className="text-xs uppercase tracking-widest text-primary">How it works</div>
            <h2 className="mt-3 font-display text-3xl font-bold md:text-4xl">
              From top-up to delivery in minutes.
            </h2>
          </div>
          <div className="grid gap-6 md:grid-cols-4">
            {[
              { icon: Wallet, t: "1. Top up", d: "Add balance via bKash / Nagad. Admin approves manually." },
              { icon: Zap, t: "2. Buy ID", d: "Pick category & quantity. Pay from balance — instant." },
              { icon: Bot, t: "3. Get delivery", d: "Excel + copy options on website and Telegram bot." },
              { icon: RefreshCcw, t: "4. Replacement", d: "Bad ID? Submit within 2h (1–2 pcs) or 6h (3+) for swap." },
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

      {/* Sellers */}
      <section id="sellers" className="container py-20">
        <div className="grid gap-10 lg:grid-cols-2 lg:items-center">
          <div>
            <div className="text-xs uppercase tracking-widest text-secondary">For sellers</div>
            <h2 className="mt-3 font-display text-3xl font-bold md:text-4xl">
              Upload Excel. Get paid. Track every report.
            </h2>
            <p className="mt-4 text-muted-foreground">
              Drop your <code className="rounded bg-muted px-1.5 py-0.5 text-xs">.xlsx</code> file —
              we parse, dedupe UIDs globally and show you a clean preview before stock goes live.
              Daily cutoff at 11:50 PM BDT (admin-configurable).
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
            <Button size="lg" className="mt-8 bg-gradient-brand text-primary-foreground shadow-glow hover:opacity-90">
              Apply as seller
            </Button>
          </div>
          <Card className="border-border/60 bg-gradient-card p-6 shadow-card">
            <div className="rounded-lg border border-dashed border-primary/40 bg-background/40 p-10 text-center">
              <Upload className="mx-auto h-10 w-10 text-primary" />
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
              Common questions
            </h2>
          </div>
          <Accordion type="single" collapsible className="w-full">
            {[
              {
                q: "Are these accounts agency-approved?",
                a: "Yes — we hold the documentation for our reseller and ad-account approval. All listings are intended for legitimate Facebook advertising use.",
              },
              {
                q: "How fast is delivery?",
                a: "Instant. Once you pay from balance, the IDs appear in your dashboard as a downloadable Excel file and inside the Telegram bot.",
              },
              {
                q: "What if an ID has a problem?",
                a: "Report within 2 hours for orders of 1–2 IDs, or 6 hours for orders of 3+ IDs. We verify the UID belongs to your order and swap it from the same seller's stock.",
              },
              {
                q: "Which payment methods do you accept?",
                a: "bKash and Nagad (manual approval) at launch. Cryptomus crypto payments are coming next.",
              },
              {
                q: "How do I link the Telegram bot?",
                a: "After signup you'll see a one-time code in your dashboard. Send /start <code> to our bot and your account is permanently linked.",
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
            <h2 className="font-display text-3xl font-bold md:text-5xl">
              Ready to scale your agency?
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-muted-foreground">
              Join hundreds of Bangladeshi resellers already buying and selling on Nexus X.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Button size="lg" className="bg-gradient-brand text-primary-foreground shadow-glow hover:opacity-90">
                Create free account
              </Button>
              <Button size="lg" variant="outline" className="border-border/80">
                Talk to support
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
