import { Logo } from "@/components/Logo";
import { Sparkles } from "lucide-react";

/**
 * Neon glass footer used across pages.
 * Highlights "Part of Basictrick MarketPlace" and developer credit.
 */
export const BrandFooter = ({ compact = false }: { compact?: boolean }) => {
  return (
    <footer className="relative mt-12 border-t border-border/60 bg-background/60 backdrop-blur-xl">
      {/* Neon glow underline */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 -top-px h-px bg-gradient-to-r from-transparent via-primary to-transparent opacity-80"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 -top-12 h-12 bg-gradient-to-b from-transparent to-primary/5"
      />

      <div className="container flex flex-col items-center justify-between gap-5 py-8 text-sm md:flex-row">
        <div className="flex items-center gap-3">
          <Logo size="sm" showTagline={false} />
          <span className="hidden h-6 w-px bg-border/60 md:block" />
          <span
            className="rounded-full border border-primary/40 bg-primary/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-primary shadow-[0_0_18px_-4px_hsl(var(--primary)/0.65)]"
            style={{ textShadow: "0 0 12px hsl(var(--primary) / 0.7)" }}
          >
            Part of Basictrick MarketPlace
          </span>
        </div>

        <div className="flex flex-col items-center gap-2 md:items-end">
          <a
            href="https://t.me/basictrickbd"
            target="_blank"
            rel="noreferrer"
            className="group inline-flex items-center gap-2 rounded-full border border-border/60 bg-card/40 px-4 py-1.5 backdrop-blur transition-all hover:border-primary/60 hover:bg-card/70"
            style={{ boxShadow: "0 0 24px -8px hsl(265 84% 62% / 0.55)" }}
          >
            <Sparkles className="h-3.5 w-3.5 text-primary drop-shadow-[0_0_6px_hsl(var(--primary))]" />
            <span className="text-[12px] uppercase tracking-[0.18em] text-muted-foreground">
              Developed by
            </span>
            <span
              className="bg-gradient-brand bg-clip-text font-display text-base font-bold text-transparent"
              style={{ filter: "drop-shadow(0 0 8px hsl(265 84% 62% / 0.55))" }}
            >
              Shovon
            </span>
          </a>
          {!compact && (
            <span className="text-[11px] text-muted-foreground">
              © {new Date().getFullYear()} Nexus X · All rights reserved
            </span>
          )}
        </div>
      </div>
    </footer>
  );
};

export default BrandFooter;