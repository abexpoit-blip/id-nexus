import { Crown } from "lucide-react";
import { useBrandSettings } from "@/hooks/useBrandSettings";

/**
 * Premium glass + gold tagline pill.
 * Gold gradient hairline border drawn via padding-box / border-box mask trick.
 */
export const BrandTagline = () => {
  const { settings } = useBrandSettings();
  return (
    <div className="relative mx-auto mb-5 inline-flex w-fit items-center justify-center">
      {/* Outer gold halo */}
      <div
        aria-hidden
        className="pointer-events-none absolute -inset-1 rounded-full opacity-60 blur-md"
        style={{ background: "var(--gradient-gold)" }}
      />
      <div
        className="relative flex items-center gap-2.5 overflow-hidden rounded-full px-5 py-2 backdrop-blur-2xl"
        style={{
          background:
            "linear-gradient(180deg, hsl(0 0% 100% / 0.06), hsl(224 40% 9% / 0.85))",
          border: "1px solid transparent",
          backgroundClip: "padding-box, border-box",
          backgroundOrigin: "padding-box, border-box",
          backgroundImage:
            "linear-gradient(180deg, hsl(0 0% 100% / 0.06), hsl(224 40% 9% / 0.85)), var(--gradient-gold)",
          boxShadow:
            "0 8px 32px -12px hsl(var(--brand-gold-deep) / 0.55), inset 0 1px 0 hsl(0 0% 100% / 0.08)",
        }}
      >
        {/* shine sweep */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -translate-x-full"
          style={{
            background:
              "linear-gradient(110deg, transparent 30%, hsl(var(--brand-gold-soft) / 0.35) 50%, transparent 70%)",
            animation: "brand-shine-gold 4.5s ease-in-out infinite",
          }}
        />
        <Crown
          className="h-3.5 w-3.5"
          style={{
            color: "hsl(var(--brand-gold))",
            filter:
              "drop-shadow(0 0 6px hsl(var(--brand-gold) / 0.85))",
          }}
        />
        <span
          className="relative font-display text-[11px] font-semibold uppercase tracking-[0.28em]"
          style={{
            background: "var(--gradient-gold)",
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
            color: "transparent",
            textShadow: "0 0 14px hsl(var(--brand-gold) / 0.35)",
          }}
        >
          {settings.parent_brand}
        </span>
        <style>{`
          @keyframes brand-shine-gold {
            0% { transform: translateX(-100%); }
            55% { transform: translateX(100%); }
            100% { transform: translateX(100%); }
          }
        `}</style>
      </div>
    </div>
  );
};

export default BrandTagline;