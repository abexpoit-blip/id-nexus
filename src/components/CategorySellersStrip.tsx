import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { Gem, Crown, Medal, Award } from "lucide-react";

interface CatSeller {
  seller_id: string;
  name: string;
  available: number;
  sales_lifetime: number;
  tier: "vip" | "gold" | "silver" | "bronze" | "none";
}

const tierIcon: Record<string, { icon: any; cls: string }> = {
  vip:    { icon: Gem,    cls: "text-primary" },
  gold:   { icon: Crown,  cls: "text-warning" },
  silver: { icon: Medal,  cls: "text-muted-foreground" },
  bronze: { icon: Award,  cls: "text-accent" },
  none:   { icon: Award,  cls: "text-muted-foreground" },
};

export const CategorySellersStrip = ({ categoryId }: { categoryId: string }) => {
  const [sellers, setSellers] = useState<CatSeller[]>([]);
  useEffect(() => {
    api.get<{ sellers: CatSeller[] }>(`/api/categories/${categoryId}/sellers`)
      .then((r) => setSellers((r.sellers ?? []).slice(0, 4)))
      .catch(() => {});
  }, [categoryId]);
  if (sellers.length === 0) return null;
  return (
    <div className="mt-3 flex flex-wrap items-center gap-1">
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground mr-1">Stocked by</span>
      {sellers.map((s) => {
        const meta = tierIcon[s.tier] ?? tierIcon.none;
        const Icon = meta.icon;
        return (
          <Link key={s.seller_id} to={`/sellers/${s.seller_id}`}
            className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-background/40 px-2 py-0.5 text-[10px] hover:border-primary/60">
            <Icon className={`h-3 w-3 ${meta.cls}`} />
            <span>{s.name}</span>
            <span className="text-muted-foreground">·{s.available}</span>
          </Link>
        );
      })}
    </div>
  );
};

export default CategorySellersStrip;