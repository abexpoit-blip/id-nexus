import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Crown, Trophy, Medal, Award } from "lucide-react";

interface TopSeller {
  seller_id: string;
  name: string;
  sales_lifetime: number;
  sales_30d: number;
  tier: "platinum" | "gold" | "silver" | "bronze" | "none";
}

const tierMeta: Record<string, { icon: any; label: string; cls: string }> = {
  platinum: { icon: Crown,  label: "Platinum", cls: "text-primary" },
  gold:     { icon: Trophy, label: "Gold",     cls: "text-warning" },
  silver:   { icon: Medal,  label: "Silver",   cls: "text-muted-foreground" },
  bronze:   { icon: Award,  label: "Bronze",   cls: "text-accent" },
};

export const TopSellersBadge = () => {
  const [sellers, setSellers] = useState<TopSeller[]>([]);
  useEffect(() => {
    api.get<{ sellers: TopSeller[] }>("/api/seller/top")
      .then((r) => setSellers((r.sellers ?? []).filter((s) => s.tier !== "none").slice(0, 6)))
      .catch(() => {});
  }, []);
  if (sellers.length === 0) return null;
  return (
    <Card className="mb-4 border-border/60 bg-gradient-card p-4">
      <div className="flex items-center justify-between mb-2">
        <div>
          <div className="font-display text-sm font-semibold">Trusted top sellers</div>
          <div className="text-xs text-muted-foreground">Earned by lifetime sales volume</div>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {sellers.map((s) => {
          const meta = tierMeta[s.tier] ?? tierMeta.bronze;
          const Icon = meta.icon;
          return (
            <Link key={s.seller_id} to={`/sellers/${s.seller_id}`}
              className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background/40 px-3 py-1 text-xs hover:border-primary/60 hover:bg-primary/5 transition">
              <Icon className={`h-3.5 w-3.5 ${meta.cls}`} />
              <span className="font-medium">{s.name}</span>
              <span className="text-muted-foreground">· {meta.label}</span>
            </Link>
          );
        })}
      </div>
    </Card>
  );
};

export default TopSellersBadge;