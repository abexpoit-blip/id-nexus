import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Wallet, TrendingUp, Sparkles, Clock, Inbox, CheckCircle2, XCircle, Loader2, ArrowUpRight } from "lucide-react";
import { Link } from "react-router-dom";

interface WalletData {
  balance_bdt: number;
  lifetime_earned_bdt: number;
  last7_earned_bdt: number;
  last30_earned_bdt: number;
  pipeline: {
    uploaded: number;
    collected: number;
    completed: number;
    rejected: number;
    pending_units: number;
  };
  recent_ledger: Array<{
    id: string;
    kind: string;
    amount_bdt: string | number;
    balance_after: string | number;
    note: string | null;
    created_at: string;
  }>;
}

const fmt = (n: number) =>
  new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(n || 0);

export function SellerWalletCard({ refreshKey = 0 }: { refreshKey?: number }) {
  const [data, setData] = useState<WalletData | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      const w = await api.get<WalletData>("/api/seller/wallet");
      setData(w);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, [refreshKey]);

  const pipe = data?.pipeline;
  const totalActive = (pipe?.uploaded ?? 0) + (pipe?.collected ?? 0) + (pipe?.completed ?? 0) + (pipe?.rejected ?? 0);
  const pct = (n: number) => (totalActive > 0 ? Math.round((n / totalActive) * 100) : 0);

  return (
    <div className="mb-6 grid gap-4 lg:grid-cols-3">
      {/* Premium balance hero */}
      <Card className="relative overflow-hidden border-0 p-6 lg:col-span-1
        bg-[linear-gradient(135deg,hsl(var(--primary))_0%,hsl(var(--primary)/0.85)_45%,hsl(var(--secondary))_100%)]
        text-primary-foreground shadow-[0_20px_60px_-20px_hsl(var(--primary)/0.55)]">
        <div aria-hidden className="pointer-events-none absolute -top-16 -right-12 h-48 w-48 rounded-full bg-white/15 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute -bottom-20 -left-10 h-56 w-56 rounded-full bg-white/10 blur-3xl" />
        <div className="relative z-10 flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] opacity-80">
              <Wallet className="h-3.5 w-3.5" /> Seller wallet
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="font-display text-4xl font-bold tabular-nums">
                ৳ {loading ? "—" : fmt(Number(data?.balance_bdt ?? 0))}
              </span>
            </div>
            <div className="mt-1 text-xs opacity-80">Available balance (BDT)</div>
          </div>
          <div className="rounded-full bg-white/15 p-2 backdrop-blur">
            <Sparkles className="h-5 w-5" />
          </div>
        </div>

        <div className="relative z-10 mt-6 grid grid-cols-3 gap-2 text-xs">
          <div className="rounded-xl bg-white/10 p-3 backdrop-blur">
            <div className="opacity-75">7d</div>
            <div className="mt-0.5 font-display text-base font-semibold tabular-nums">
              ৳{fmt(Number(data?.last7_earned_bdt ?? 0))}
            </div>
          </div>
          <div className="rounded-xl bg-white/10 p-3 backdrop-blur">
            <div className="opacity-75">30d</div>
            <div className="mt-0.5 font-display text-base font-semibold tabular-nums">
              ৳{fmt(Number(data?.last30_earned_bdt ?? 0))}
            </div>
          </div>
          <div className="rounded-xl bg-white/10 p-3 backdrop-blur">
            <div className="opacity-75">Lifetime</div>
            <div className="mt-0.5 font-display text-base font-semibold tabular-nums">
              ৳{fmt(Number(data?.lifetime_earned_bdt ?? 0))}
            </div>
          </div>
        </div>

        <Link
          to="/wallet"
          className="relative z-10 mt-5 inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1.5 text-xs font-medium backdrop-blur transition hover:bg-white/25"
        >
          Open wallet <ArrowUpRight className="h-3 w-3" />
        </Link>
      </Card>

      {/* Status pipeline */}
      <Card className="glass-panel border-0 p-6 lg:col-span-2">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-muted-foreground">
              <TrendingUp className="h-3.5 w-3.5" /> Upload status pipeline
            </div>
            <div className="mt-1 font-display text-lg font-semibold">
              {loading ? <Loader2 className="inline h-4 w-4 animate-spin" /> : `${totalActive} batches tracked`}
            </div>
          </div>
          <div className="text-right text-xs text-muted-foreground">
            Pending units<br />
            <span className="font-display text-base font-semibold text-foreground tabular-nums">
              {pipe?.pending_units ?? 0}
            </span>
          </div>
        </div>

        {/* Visual pipeline bar */}
        <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-muted/40">
          <div className="bg-amber-500 transition-all" style={{ width: `${pct(pipe?.uploaded ?? 0)}%` }} />
          <div className="bg-sky-500 transition-all" style={{ width: `${pct(pipe?.collected ?? 0)}%` }} />
          <div className="bg-emerald-500 transition-all" style={{ width: `${pct(pipe?.completed ?? 0)}%` }} />
          <div className="bg-destructive transition-all" style={{ width: `${pct(pipe?.rejected ?? 0)}%` }} />
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <PipelineStat icon={<Inbox className="h-4 w-4" />} label="Uploaded" value={pipe?.uploaded ?? 0} dot="bg-amber-500" hint="Awaiting admin" />
          <PipelineStat icon={<Clock className="h-4 w-4" />} label="Collected" value={pipe?.collected ?? 0} dot="bg-sky-500" hint="Admin downloaded" />
          <PipelineStat icon={<CheckCircle2 className="h-4 w-4" />} label="Completed" value={pipe?.completed ?? 0} dot="bg-emerald-500" hint="Paid out" />
          <PipelineStat icon={<XCircle className="h-4 w-4" />} label="Rejected" value={pipe?.rejected ?? 0} dot="bg-destructive" hint="No credit" />
        </div>
      </Card>
    </div>
  );
}

function PipelineStat({
  icon, label, value, dot, hint,
}: { icon: React.ReactNode; label: string; value: number; dot: string; hint: string }) {
  return (
    <div className="rounded-xl border border-border/50 bg-card/40 p-3 transition hover:border-primary/40 hover:bg-card/60">
      <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-muted-foreground">
        <span className={`h-1.5 w-1.5 rounded-full ${dot}`} /> {icon} {label}
      </div>
      <div className="mt-1.5 font-display text-2xl font-bold tabular-nums">{value}</div>
      <div className="text-[11px] text-muted-foreground">{hint}</div>
    </div>
  );
}

/** Status badge for a single audit row */
export function UploadStatusBadge({ audit }: { audit: any }) {
  const status = audit?.review_status as string;
  let label = "Uploaded";
  let cls = "bg-amber-500/15 text-amber-500 border-amber-500/30";
  let Icon: any = Inbox;
  if (status === "approved") { label = "Completed"; cls = "bg-emerald-500/15 text-emerald-500 border-emerald-500/30"; Icon = CheckCircle2; }
  else if (status === "rejected") { label = "Rejected"; cls = "bg-destructive/15 text-destructive border-destructive/30"; Icon = XCircle; }
  else if (audit?.collected_at) { label = "Collected"; cls = "bg-sky-500/15 text-sky-500 border-sky-500/30"; Icon = Clock; }
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${cls}`}>
      <Icon className="h-3 w-3" /> {label}
    </span>
  );
}