import { memo } from "react";
import { Link } from "react-router-dom";
import { Logo } from "@/components/Logo";
import { useBrandSettings } from "@/hooks/useBrandSettings";
import {
  ShieldCheck,
  HandCoins,
  Clock,
  Sparkles,
  Send,
  ArrowUpRight,
  Lock,
  CheckCircle2,
} from "lucide-react";

/**
 * Premium glass + gold footer used across landing & app shells.
 * Features brand story, trust pillars, quick links, and "Part of Basictrick MarketPlace" hero.
 */
const BrandFooterImpl = ({ compact = false }: { compact?: boolean }) => {
  const { settings } = useBrandSettings();
  const year = new Date().getFullYear();

  if (compact) {
    return (
      <footer className="relative mt-8 border-t border-border/50 bg-background/60 backdrop-blur-xl">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 -top-px h-px bg-gradient-to-r from-transparent via-[hsl(var(--brand-gold))]/60 to-transparent"
        />
        <div className="container flex flex-col items-center justify-between gap-3 py-5 text-xs md:flex-row">
          <div className="flex items-center gap-2 text-muted-foreground">
            <span className="font-display text-foreground/90">Nexus X</span>
            <span className="opacity-40">·</span>
            <span>Part of</span>
            <span
              className="bg-clip-text font-semibold tracking-wide text-transparent"
              style={{ backgroundImage: "var(--gradient-gold)" }}
            >
              Basictrick MarketPlace
            </span>
          </div>
          <a
            href={settings.developer_url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-muted-foreground transition hover:text-foreground"
          >
            Developed by
            <span
              className="bg-clip-text font-semibold text-transparent"
              style={{ backgroundImage: "var(--gradient-gold)" }}
            >
              {settings.developer_name}
            </span>
            <ArrowUpRight className="h-3 w-3" />
          </a>
        </div>
      </footer>
    );
  }

  return (
    <footer className="relative mt-20 overflow-hidden border-t border-border/60 bg-background">
      {/* Top gold divider */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-px"
        style={{ background: "var(--gradient-gold)", opacity: 0.55 }}
      />
      {/* Ambient glows */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-32 left-1/4 h-72 w-72 rounded-full opacity-[0.07] blur-3xl"
        style={{ background: "var(--gradient-gold)" }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-40 right-0 h-80 w-80 rounded-full opacity-[0.09] blur-3xl"
        style={{ background: "var(--gradient-brand)" }}
      />

      <div className="container relative pt-16 pb-10">
        {/* Hero band */}
        <div
          className="relative mb-12 overflow-hidden rounded-2xl border border-[hsl(var(--brand-gold))]/25 bg-card/40 px-6 py-8 backdrop-blur-xl md:px-10 md:py-10"
          style={{
            boxShadow:
              "inset 0 1px 0 hsl(var(--brand-gold-soft) / 0.25), 0 30px 80px -40px hsl(var(--brand-gold) / 0.35)",
          }}
        >
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-[0.04]"
            style={{ background: "var(--gradient-gold)" }}
          />
          <div className="relative grid gap-6 md:grid-cols-[1.4fr_1fr] md:items-center">
            <div>
              <span
                className="inline-flex items-center gap-1.5 rounded-full border border-[hsl(var(--brand-gold))]/40 bg-[hsl(var(--brand-gold))]/5 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.22em]"
                style={{ color: "hsl(var(--brand-gold-soft))" }}
              >
                <Sparkles className="h-3 w-3" />
                Premium Network
              </span>
              <h3 className="mt-4 font-display text-2xl font-bold leading-tight md:text-3xl">
                Nexus X is part of{" "}
                <span
                  className="bg-clip-text text-transparent"
                  style={{ backgroundImage: "var(--gradient-gold)" }}
                >
                  Basictrick MarketPlace
                </span>
              </h3>
              <p className="mt-2 max-w-xl text-sm text-muted-foreground md:text-base">
                Bangladesh's hand-picked seller network for Facebook ad accounts. Manual approval,
                direct BDT payouts, zero spam.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 md:justify-end">
              <a
                href={settings.developer_url}
                target="_blank"
                rel="noreferrer"
                className="group inline-flex items-center gap-2 rounded-full border border-[hsl(var(--brand-gold))]/40 bg-background/40 px-4 py-2 text-sm backdrop-blur transition hover:border-[hsl(var(--brand-gold))]/70 hover:bg-background/70"
              >
                <Send className="h-3.5 w-3.5" style={{ color: "hsl(var(--brand-gold-soft))" }} />
                <span className="text-muted-foreground">Talk to admin</span>
                <ArrowUpRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              </a>
            </div>
          </div>
        </div>

        {/* Columns */}
        <div className="grid gap-10 md:grid-cols-12">
          {/* Brand col */}
          <div className="md:col-span-5">
            <Logo size="md" showTagline={false} />
            <p className="mt-4 max-w-sm text-sm leading-relaxed text-muted-foreground">
              An invite-only reseller platform. Every seller is reviewed manually so the marketplace
              stays clean and payouts stay fast.
            </p>
            <div className="mt-5 grid grid-cols-3 gap-2">
              {[
                { icon: ShieldCheck, label: "Verified" },
                { icon: HandCoins, label: "BDT payout" },
                { icon: Lock, label: "Secure" },
              ].map((b) => (
                <div
                  key={b.label}
                  className="flex flex-col items-center justify-center gap-1 rounded-lg border border-border/50 bg-card/40 px-2 py-3 text-center backdrop-blur"
                >
                  <b.icon
                    className="h-4 w-4"
                    style={{ color: "hsl(var(--brand-gold-soft))" }}
                  />
                  <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                    {b.label}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Sellers col */}
          <div className="md:col-span-3">
            <div className="mb-4 text-[11px] font-semibold uppercase tracking-[0.2em] text-foreground/80">
              Sellers
            </div>
            <ul className="space-y-2.5 text-sm">
              {[
                { label: "Apply as seller", to: "/apply-seller" },
                { label: "Seller login", to: "/seller-login" },
                { label: "How it works", to: "/#how" },
                { label: "Earnings", to: "/#earn" },
              ].map((l) => (
                <li key={l.label}>
                  <Link
                    to={l.to}
                    className="group inline-flex items-center gap-1 text-muted-foreground transition hover:text-foreground"
                  >
                    <span>{l.label}</span>
                    <ArrowUpRight className="h-3 w-3 opacity-0 transition group-hover:opacity-60" />
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Trust col */}
          <div className="md:col-span-4">
            <div className="mb-4 text-[11px] font-semibold uppercase tracking-[0.2em] text-foreground/80">
              Trust pillars
            </div>
            <ul className="space-y-3 text-sm">
              {[
                { icon: ShieldCheck, t: "Admin-approved sellers only" },
                { icon: Clock, t: "Daily payout cutoff 11:50 PM BDT" },
                { icon: CheckCircle2, t: "Global UID dedupe — no double-sells" },
              ].map((b, i) => (
                <li key={i} className="flex items-start gap-2.5">
                  <span
                    className="mt-0.5 inline-flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-md border border-[hsl(var(--brand-gold))]/30 bg-[hsl(var(--brand-gold))]/5"
                  >
                    <b.icon
                      className="h-3 w-3"
                      style={{ color: "hsl(var(--brand-gold-soft))" }}
                    />
                  </span>
                  <span className="text-muted-foreground">{b.t}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-border/50 pt-6 text-xs md:flex-row">
          <div className="text-muted-foreground">
            © {year} Nexus X · All rights reserved
          </div>
          <a
            href={settings.developer_url}
            target="_blank"
            rel="noreferrer"
            className="group inline-flex items-center gap-2 rounded-full border border-border/50 bg-card/40 px-4 py-1.5 backdrop-blur transition hover:border-[hsl(var(--brand-gold))]/50"
          >
            <Sparkles
              className="h-3 w-3"
              style={{ color: "hsl(var(--brand-gold-soft))" }}
            />
            <span className="uppercase tracking-[0.18em] text-muted-foreground">
              Crafted by
            </span>
            <span
              className="bg-clip-text font-display font-bold text-transparent"
              style={{ backgroundImage: "var(--gradient-gold)" }}
            >
              {settings.developer_name}
            </span>
            <ArrowUpRight className="h-3 w-3 transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </a>
        </div>
      </div>
    </footer>
  );
};

export const BrandFooter = memo(BrandFooterImpl);

export default BrandFooter;
