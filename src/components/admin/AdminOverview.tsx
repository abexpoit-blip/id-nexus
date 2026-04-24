import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
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
    const { data, error } = await supabase.rpc("admin_overview_stats");
    if (!error && data) setStats(data as unknown as Stats);
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
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-xl font-bold">Platform overview</h2>
          <p className="text-sm text-muted-foreground">Live KPIs across revenue, users, and pending workload.</p>
        </div>
        <Button variant="outline" size="sm" onClick={load}>
          <RefreshCcw className="mr-2 h-4 w-4" /> Refresh
        </Button>
      </div>

      {/* Revenue row */}
      <div className="grid gap-3 md:grid-cols-3">
        <KpiCard
          title="Revenue today"
          value={fmt(stats.revenue_today)}
          subtitle={`${num(stats.today_orders)} order${stats.today_orders === 1 ? "" : "s"}`}
          icon={TrendingUp}
          accent="primary"
        />
        <KpiCard
          title="Revenue (7 days)"
          value={fmt(stats.revenue_7d)}
          icon={TrendingUp}
          accent="primary"
        />
        <KpiCard
          title="Revenue (30 days)"
          value={fmt(stats.revenue_30d)}
          icon={TrendingUp}
          accent="primary"
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
            accent="warning"
            onClick={() => onJump?.("payments")}
          />
          <ActionCard
            title="Pending withdraws"
            count={stats.pending_withdraws}
            icon={Clock}
            accent="warning"
            onClick={() => onJump?.("payments")}
          />
          <ActionCard
            title="Pending replacements"
            count={stats.pending_replacements}
            icon={AlertTriangle}
            accent="destructive"
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
        />
        <KpiCard
          title="Sellers"
          value={num(stats.total_sellers)}
          icon={ShoppingCart}
        />
        <KpiCard
          title="Admins"
          value={num(stats.total_admins)}
          icon={UserCheck}
        />
        <KpiCard
          title="Platform balance"
          value={fmt(stats.total_platform_balance)}
          subtitle="Sum of all user wallets"
          icon={Wallet}
          accent="primary"
        />
      </div>
    </div>
  );
};

type Accent = "primary" | "warning" | "destructive" | "default";

const accentClass = (a: Accent | undefined) => {
  switch (a) {
    case "primary":
      return "text-primary";
    case "warning":
      return "text-warning";
    case "destructive":
      return "text-destructive";
    default:
      return "text-foreground";
  }
};

const KpiCard = ({
  title,
  value,
  subtitle,
  icon: Icon,
  accent,
}: {
  title: string;
  value: string;
  subtitle?: string;
  icon: typeof TrendingUp;
  accent?: Accent;
}) => (
  <Card className="border-border/60 bg-gradient-card p-4">
    <div className="flex items-start justify-between">
      <div className="text-xs uppercase tracking-widest text-muted-foreground">{title}</div>
      <Icon className={`h-4 w-4 ${accentClass(accent)}`} />
    </div>
    <div className={`mt-2 font-display text-2xl font-bold ${accentClass(accent)}`}>{value}</div>
    {subtitle && <div className="mt-1 text-xs text-muted-foreground">{subtitle}</div>}
  </Card>
);

const ActionCard = ({
  title,
  count,
  icon: Icon,
  accent,
  onClick,
}: {
  title: string;
  count: number;
  icon: typeof Clock;
  accent: Accent;
  onClick?: () => void;
}) => (
  <Card
    className={`group cursor-pointer border-border/60 bg-gradient-card p-4 transition hover:-translate-y-0.5 hover:shadow-glow ${
      count > 0 ? "" : "opacity-70"
    }`}
    onClick={onClick}
  >
    <div className="flex items-center justify-between">
      <div>
        <div className="text-xs uppercase tracking-widest text-muted-foreground">{title}</div>
        <div className={`mt-1 font-display text-3xl font-bold ${accentClass(accent)}`}>{num(count)}</div>
      </div>
      <div className={`rounded-lg p-2 ${count > 0 ? `bg-${accent}/15` : "bg-muted/30"}`}>
        <Icon className={`h-5 w-5 ${accentClass(accent)}`} />
      </div>
    </div>
    {count > 0 && (
      <Badge variant="outline" className="mt-3 border-border/60 text-xs group-hover:border-primary/40">
        Click to review →
      </Badge>
    )}
  </Card>
);

export default AdminOverview;