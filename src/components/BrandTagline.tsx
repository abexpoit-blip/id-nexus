import { Sparkles } from "lucide-react";
import { useBrandSettings } from "@/hooks/useBrandSettings";

/**
 * Neon glass highlighted tagline banner.
 * Used on auth pages (Login + Signup) above the form card.
 */
export const BrandTagline = () => {
  const { settings } = useBrandSettings();
  return (
    <div
      className="relative mx-auto mb-5 flex items-center justify-center gap-2 overflow-hidden rounded-full border border-primary/40 bg-card/40 px-4 py-2 backdrop-blur-xl"
      style={{
        boxShadow:
          "0 0 28px -6px hsl(var(--primary) / 0.55), 0 0 60px -20px hsl(265 84% 62% / 0.6), inset 0 0 16px -8px hsl(var(--primary) / 0.4)",
      }}
    >
      {/* animated shine */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-primary/20 to-transparent opacity-60 animate-[shine_3.5s_ease-in-out_infinite]"
        style={{ animationName: "brand-shine" }}
      />
      <Sparkles className="h-3.5 w-3.5 text-primary drop-shadow-[0_0_6px_hsl(var(--primary))]" />
      <span
        className="relative text-[11px] font-semibold uppercase tracking-[0.22em] text-foreground"
        style={{ textShadow: "0 0 10px hsl(var(--primary) / 0.65)" }}
      >
        {settings.parent_brand}
      </span>
      <Sparkles className="h-3.5 w-3.5 text-secondary drop-shadow-[0_0_6px_hsl(265_84%_62%)]" />
      <style>{`
        @keyframes brand-shine {
          0% { transform: translateX(-100%); }
          60% { transform: translateX(100%); }
          100% { transform: translateX(100%); }
        }
      `}</style>
    </div>
  );
};

export default BrandTagline;