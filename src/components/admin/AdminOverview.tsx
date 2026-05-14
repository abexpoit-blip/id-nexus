import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  TrendingUp,
  Users,
  Wallet,
  Clock,
  ShoppingCart,
  UserCheck,
  AlertTriangle,
  Loader2,
  RefreshCcw,
} from "lucide-react";

interface Stats {
  revenue_today: number;
  revenue_7d: number;
  revenue_30d: number;
  pending_topups: number;
  pending_withdraws: number;
  pending_replacements: number;
  total_users: number;
  total_sellers: number;
  total_admins: number;
  today_signups: number;
  today_orders: number;
  today_order_revenue: number;
  total_platform_balance: number;
}

const fmt = (n: number) => `৳${Number(n ?? 0).toLocaleString("en-BD", { maximumFractionDigits: 2 })}`;
const num = (n: number) => Number(n ?? 0).toLocaleString("en-US");

export const AdminOverview = ({ onJump }: { onJump?: (section: string) => void }) => {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const data = await api.get<Stats>("/api/admin/overview");
      setStats(data);
    } catch { /* ignore */ }
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  if (loading || !stats) {
    return (
      <div className="flex h-48 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Colorful hero strip */}
      <Card className="relative overflow-hidden border-0 p-6
        bg-[linear-gradient(135deg,hsl(265_84%_62%/0.18),hsl(174_84%_50%/0.18)_50%,hsl(330_90%_60%/0.18))]">
        <div aria-hidden className="pointer-events-none absolute -top-16 -right-12 h-48 w-48 rounded-full bg-primary/20 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute -bottom-16 -left-10 h-56 w-56 rounded-full bg-secondary/20 blur-3xl" />
        <div className="relative z-10 flex items-center justify-between gap-4">
          <div>
            <div className="pill-gold mb-2">Live</div>
            <h2 className="font-display text-2xl font-bold md:text-3xl">
              <span className="heading-gradient">Platform overview</span>
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Real-time KPIs across revenue, users, and pending workload.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={load} className="border-primary/40">
            <RefreshCcw className="mr-2 h-4 w-4" /> Refresh
          </Button>
        </div>
        <div className="rainbow-strip mt-5 h-1 w-full rounded-full opacity-90" />
      </Card>

      {/* Revenue row */}
      <div className="grid gap-3 md:grid-cols-3">
        <KpiCard
          title="Revenue today"
          value={fmt(stats.revenue_today)}
          subtitle={`${num(stats.today_orders)} order${stats.today_orders === 1 ? "" : "s"}`}
          icon={TrendingUp}
          tone="cyan"
        />
        <KpiCard
          title="Revenue (7 days)"
          value={fmt(stats.revenue_7d)}
          icon={TrendingUp}
          tone="violet"
        />
        <KpiCard
          title="Revenue (30 days)"
          value={fmt(stats.revenue_30d)}
          icon={TrendingUp}
          tone="emerald"
        />
      </div>

      {/* Pending workload — clickable */}
      <div>
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Awaiting your action
        </h3>
        <div className="grid gap-3 md:grid-cols-3">
          <ActionCard
            title="Pending top-ups"
            count={stats.pending_topups}
            icon={Wallet}
            tone="amber"
            onClick={() => onJump?.("payments")}
          />
          <ActionCard
            title="Pending withdraws"
            count={stats.pending_withdraws}
            icon={Clock}
            tone="sky"
            onClick={() => onJump?.("payments")}
          />
          <ActionCard
            title="Pending replacements"
            count={stats.pending_replacements}
            icon={AlertTriangle}
            tone="rose"
            onClick={() => onJump?.("replacements")}
          />
        </div>
      </div>

      {/* People + balance */}
      <div className="grid gap-3 md:grid-cols-4">
        <KpiCard
          title="Total users"
          value={num(stats.total_users)}
          subtitle={`+${num(stats.today_signups)} today`}
          icon={Users}
          tone="violet"
        />
        <KpiCard
          title="Sellers"
          value={num(stats.total_sellers)}
          icon={ShoppingCart}
          tone="cyan"
        />
        <KpiCard
          title="Admins"
          value={num(stats.total_admins)}
          icon={UserCheck}
          tone="rose"
        />
        <KpiCard
          title="Platform balance"
          value={fmt(stats.total_platform_balance)}
          subtitle="Sum of all user wallets"
          icon={Wallet}
          tone="emerald"
        />
      </div>
    </div>
  );
};

type Tone = "cyan" | "violet" | "amber" | "emerald" | "rose" | "sky";
const toneTile: Record<Tone, string> = {
  cyan: "tile-cyan", violet: "tile-violet", amber: "tile-amber",
  emerald: "tile-emerald", rose: "tile-rose", sky: "tile-sky",
};
const toneChip: Record<Tone, string> = {
  cyan: "chip-cyan", violet: "chip-violet", amber: "chip-amber",
  emerald: "chip-emerald", rose: "chip-rose", sky: "chip-sky",
};

const KpiCard = ({
  title, value, subtitle, icon: Icon, tone = "cyan",
}: { title: string; value: string; subtitle?: string; icon: typeof TrendingUp; tone?: Tone }) => (
  <div className={`kpi-tile ${toneTile[tone]}`}>
    <div className="flex items-start justify-between gap-3">
      <div className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">{title}</div>
      <span className={`icon-chip ${toneChip[tone]}`}><Icon className="h-4 w-4" /></span>
    </div>
    <div className="mt-3 font-display text-2xl font-bold tabular-nums">{value}</div>
    {subtitle && <div className="mt-1 text-xs text-muted-foreground">{subtitle}</div>}
  </div>
);

const ActionCard = ({
  title, count, icon: Icon, tone, onClick,
}: { title: string; count: number; icon: typeof Clock; tone: Tone; onClick?: () => void }) => (
  <button
    type="button"
    onClick={onClick}
    className={`kpi-tile ${toneTile[tone]} group cursor-pointer text-left ${count > 0 ? "" : "opacity-75"}`}
  >
    <div className="flex items-center justify-between gap-3">
      <div>
        <div className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">{title}</div>
        <div className="mt-1 font-display text-3xl font-bold tabular-nums">{num(count)}</div>
      </div>
      <span className={`icon-chip ${toneChip[tone]}`}><Icon className="h-5 w-5" /></span>
    </div>
    {count > 0 && (
      <Badge variant="outline" className="mt-3 border-border/60 text-[10px] group-hover:border-primary/40">
        Click to review →
      </Badge>
    )}
  </button>
);

export default AdminOverview;