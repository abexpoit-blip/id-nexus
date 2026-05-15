import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Gem, Crown, Medal, Award, ShieldCheck } from "lucide-react";

export type SellerTier = "vip" | "gold" | "silver" | "bronze" | "none";

interface Props {
  tier: SellerTier;
  salesLifetime: number;
  nextTier: string | null;
  nextThreshold: number | null;
}

const META: Record<SellerTier, {
  icon: any; label: string; ring: string; chipBg: string; chipText: string; gradient: string;
}> = {
  vip: {
    icon: Gem, label: "VIP",
    ring: "ring-primary/40",
    chipBg: "bg-primary/15", chipText: "text-primary",
    gradient: "from-[hsl(280_80%_25%)] via-[hsl(260_70%_18%)] to-[hsl(220_60%_10%)]",
  },
  gold: {
    icon: Crown, label: "Gold",
    ring: "ring-warning/40",
    chipBg: "bg-warning/15", chipText: "text-warning",
    gradient: "from-[hsl(38_85%_22%)] via-[hsl(32_70%_14%)] to-[hsl(20_50%_8%)]",
  },
  silver: {
    icon: Medal, label: "Silver",
    ring: "ring-muted-foreground/30",
    chipBg: "bg-muted", chipText: "text-muted-foreground",
    gradient: "from-[hsl(220_15%_28%)] via-[hsl(220_15%_18%)] to-[hsl(220_15%_10%)]",
  },
  bronze: {
    icon: Award, label: "Bronze",
    ring: "ring-accent/40",
    chipBg: "bg-accent/15", chipText: "text-accent",
    gradient: "from-[hsl(20_60%_22%)] via-[hsl(18_50%_14%)] to-[hsl(15_40%_8%)]",
  },
  none: {
    icon: ShieldCheck, label: "Unranked",
    ring: "ring-border",
    chipBg: "bg-muted", chipText: "text-muted-foreground",
    gradient: "from-[hsl(220_15%_18%)] via-[hsl(220_15%_12%)] to-[hsl(220_15%_8%)]",
  },
};

export const SellerTierBadge = ({ tier, salesLifetime, nextTier, nextThreshold }: Props) => {
  const meta = META[tier] ?? META.none;
  const Icon = meta.icon;
  const progress =
    nextThreshold && nextThreshold > 0
      ? Math.min(100, Math.round((salesLifetime / nextThreshold) * 100))
      : 100;
  const remaining = nextThreshold ? Math.max(0, nextThreshold - salesLifetime) : 0;

  return (
    <Card className={`relative overflow-hidden border-0 p-5 ring-1 ${meta.ring}`}>
      <div className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${meta.gradient} opacity-95`} />
      <div className="pointer-events-none absolute -top-16 -right-16 h-40 w-40 rounded-full bg-white/5 blur-3xl" />
      <div className="relative flex items-center gap-4">
        <div className={`flex h-14 w-14 items-center justify-center rounded-xl ${meta.chipBg} ring-1 ${meta.ring}`}>
          <Icon className={`h-7 w-7 ${meta.chipText}`} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-[0.22em] text-white/60">Seller tier</span>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${meta.chipBg} ${meta.chipText}`}>
              {meta.label}
            </span>
          </div>
          <div className="mt-1 font-display text-2xl font-bold text-white">
            {salesLifetime.toLocaleString()} <span className="text-sm font-normal text-white/60">lifetime sales</span>
          </div>
          {nextTier && nextThreshold ? (
            <>
              <div className="mt-3 flex items-center justify-between text-[11px] text-white/70">
                <span>{remaining} more sales to {nextTier.toUpperCase()}</span>
                <span>{salesLifetime} / {nextThreshold}</span>
              </div>
              <Progress value={progress} className="mt-1 h-1.5 bg-white/10" />
            </>
          ) : (
            <div className="mt-3 text-[11px] text-white/70">
              Highest tier reached. Maintain quality to keep VIP perks.
            </div>
          )}
        </div>
      </div>
    </Card>
  );
};

export default SellerTierBadge;