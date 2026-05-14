import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Wallet, TrendingUp, Sparkles, Clock, Inbox, CheckCircle2, XCircle, ArrowUpRight } from "lucide-react";
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
    <div className="mb-6 grid gap-3 sm:gap-4 lg:grid-cols-3">
      {/* Premium balance hero — obsidian + gold aurora */}
      <Card className="group relative overflow-hidden border border-amber-300/20 p-5 sm:p-6 lg:col-span-1
        bg-[radial-gradient(120%_120%_at_0%_0%,#1a1530_0%,#0b0a1f_55%,#050410_100%)]
        text-white shadow-[0_30px_80px_-30px_rgba(201,168,76,0.45),0_10px_40px_-15px_rgba(99,102,241,0.4)]">
        {/* Aurora blobs */}
        <div aria-hidden className="pointer-events-none absolute -top-20 -right-12 h-48 w-48 rounded-full bg-[radial-gradient(circle,rgba(201,168,76,0.55),transparent_70%)] blur-3xl sm:-top-24 sm:-right-16 sm:h-64 sm:w-64" />
        <div aria-hidden className="pointer-events-none absolute -bottom-20 -left-12 h-48 w-48 rounded-full bg-[radial-gradient(circle,rgba(99,102,241,0.5),transparent_70%)] blur-3xl sm:-bottom-24 sm:-left-16 sm:h-64 sm:w-64" />
        {/* Subtle grid texture */}
        <div aria-hidden className="pointer-events-none absolute inset-0 opacity-[0.07]
          [background-image:linear-gradient(rgba(255,255,255,1)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,1)_1px,transparent_1px)]
          [background-size:22px_22px]" />
        {/* Animated shine sweep */}
        <div aria-hidden className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/10 to-transparent transition-transform duration-[1400ms] ease-out group-hover:translate-x-full" />
        {/* Gold top hairline */}
        <div aria-hidden className="pointer-events-none absolute inset-x-4 top-0 h-px bg-gradient-to-r from-transparent via-amber-300/70 to-transparent sm:inset-x-6" />

        <div className="relative z-10 flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="inline-flex items-center gap-2 rounded-full border border-amber-300/30 bg-amber-300/10 px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.22em] text-amber-200/90">
              <Wallet className="h-3 w-3" /> Seller wallet
            </div>
            {loading ? (
              <Skeleton className="mt-4 h-12 w-40 bg-white/10" />
            ) : (
              <div className="mt-4 flex items-baseline gap-2">
                <span className="break-all bg-gradient-to-br from-amber-100 via-amber-300 to-amber-500 bg-clip-text font-display text-4xl font-bold leading-none tabular-nums text-transparent drop-shadow-[0_2px_18px_rgba(201,168,76,0.35)] sm:text-5xl">
                  ৳{fmt(Number(data?.balance_bdt ?? 0))}
                </span>
              </div>
            )}
            <div className="mt-2 text-[11px] uppercase tracking-wider text-white/55">
              Available balance · BDT
            </div>
          </div>
          <div className="relative shrink-0 rounded-2xl border border-amber-300/30 bg-gradient-to-br from-amber-300/30 to-amber-500/10 p-2.5 backdrop-blur">
            <Sparkles className="h-5 w-5 text-amber-200" />
            <span className="absolute -inset-1 -z-10 rounded-2xl bg-amber-400/20 blur-md" />
          </div>
        </div>

        <div className="relative z-10 mt-6 grid grid-cols-3 gap-2 text-xs">
          {[
            { label: "7d", value: data?.last7_earned_bdt },
            { label: "30d", value: data?.last30_earned_bdt },
            { label: "Lifetime", value: data?.lifetime_earned_bdt },
          ].map((s) => (
            <div
              key={s.label}
              className="group/stat relative overflow-hidden rounded-xl border border-white/10 bg-white/[0.04] p-2.5 backdrop-blur transition hover:border-amber-300/40 hover:bg-white/[0.08] sm:p-3"
            >
              <div className="text-[10px] uppercase tracking-wider text-white/55">{s.label}</div>
              {loading ? (
                <Skeleton className="mt-1 h-5 w-16 bg-white/10" />
              ) : (
                <div className="mt-1 truncate font-display text-sm font-semibold tabular-nums text-white sm:text-base">
                  ৳{fmt(Number(s.value ?? 0))}
                </div>
              )}
              <span className="pointer-events-none absolute -bottom-6 -right-6 h-12 w-12 rounded-full bg-amber-400/20 blur-2xl opacity-0 transition group-hover/stat:opacity-100" />
            </div>
          ))}
        </div>

        <Link
          to="/wallet"
          className="relative z-10 mt-5 inline-flex items-center gap-1.5 rounded-full border border-amber-300/40 bg-gradient-to-r from-amber-400/20 to-amber-300/5 px-3.5 py-1.5 text-xs font-medium text-amber-100 backdrop-blur transition hover:from-amber-400/40 hover:to-amber-300/15 hover:text-white"
        >
          Open wallet <ArrowUpRight className="h-3 w-3" />
        </Link>
      </Card>

      {/* Status pipeline */}
      <Card className="glass-panel border-0 p-5 sm:p-6 lg:col-span-2">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-muted-foreground">
              <TrendingUp className="h-3.5 w-3.5" /> Upload status pipeline
            </div>
            {loading ? (
              <Skeleton className="mt-2 h-6 w-32" />
            ) : (
              <div className="mt-1 font-display text-lg font-semibold">{totalActive} batches tracked</div>
            )}
          </div>
          <div className="text-right text-xs text-muted-foreground">
            Pending units<br />
            {loading ? (
              <Skeleton className="ml-auto mt-1 h-5 w-12" />
            ) : (
              <span className="font-display text-base font-semibold text-foreground tabular-nums">
                {pipe?.pending_units ?? 0}
              </span>
            )}
          </div>
        </div>

        {/* Visual pipeline bar */}
        <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-muted/40">
          <div className="bg-amber-500 transition-all" style={{ width: `${pct(pipe?.uploaded ?? 0)}%` }} />
          <div className="bg-sky-500 transition-all" style={{ width: `${pct(pipe?.collected ?? 0)}%` }} />
          <div className="bg-emerald-500 transition-all" style={{ width: `${pct(pipe?.completed ?? 0)}%` }} />
          <div className="bg-destructive transition-all" style={{ width: `${pct(pipe?.rejected ?? 0)}%` }} />
        </div>

        {loading ? (
          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-[88px] w-full rounded-xl" />
            ))}
          </div>
        ) : (
          <div className="mt-5 grid grid-cols-2 gap-2.5 sm:grid-cols-4 sm:gap-3">
            <PipelineStat icon={<Inbox className="h-4 w-4" />} label="Uploaded" value={pipe?.uploaded ?? 0} dot="bg-amber-500" hint="Awaiting admin" />
            <PipelineStat icon={<Clock className="h-4 w-4" />} label="Collected" value={pipe?.collected ?? 0} dot="bg-sky-500" hint="Admin downloaded" />
            <PipelineStat icon={<CheckCircle2 className="h-4 w-4" />} label="Completed" value={pipe?.completed ?? 0} dot="bg-emerald-500" hint="Paid out" />
            <PipelineStat icon={<XCircle className="h-4 w-4" />} label="Rejected" value={pipe?.rejected ?? 0} dot="bg-destructive" hint="No credit" />
          </div>
        )}
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

/**
 * Visual 3-step pipeline: Submitted → Collected → Completed (or Rejected at step 3).
 * Works for both seller's own audit row and admin's upload row (review_status + collected_at).
 */
export function UploadStatusProgress({
  audit,
  compact = false,
}: { audit: any; compact?: boolean }) {
  const status = audit?.review_status as string;
  const collected = !!audit?.collected_at || status === "approved" || status === "rejected";
  const isRejected = status === "rejected";
  const isCompleted = status === "approved";

  // step index reached (0..2)
  const reached = isCompleted || isRejected ? 2 : collected ? 1 : 0;

  const finalLabel = isRejected ? "Rejected" : "Completed";
  const finalDot = isRejected ? "bg-destructive" : "bg-emerald-500";
  const finalText = isRejected ? "text-destructive" : "text-emerald-500";

  const steps = [
    { key: "sub", label: "Submitted", dot: "bg-amber-500", text: "text-amber-500" },
    { key: "col", label: "Collected", dot: "bg-sky-500", text: "text-sky-500" },
    { key: "fin", label: finalLabel, dot: finalDot, text: finalText },
  ];

  const segActive = (i: number) => i < reached;
  const segColor = (i: number) =>
    i === 0 ? "bg-gradient-to-r from-amber-500 to-sky-500"
    : i === 1 ? `bg-gradient-to-r from-sky-500 ${isRejected ? "to-destructive" : "to-emerald-500"}`
    : "";

  return (
    <div className={`flex flex-col gap-1 ${compact ? "min-w-[180px]" : "min-w-[220px]"}`}>
      <div className="flex items-center">
        {steps.map((s, i) => {
          const done = i <= reached;
          return (
            <div key={s.key} className="flex flex-1 items-center last:flex-none">
              <span
                className={`relative h-2.5 w-2.5 shrink-0 rounded-full ring-2 transition-all
                  ${done ? `${s.dot} ring-${s.dot.replace("bg-", "")}/30` : "bg-muted ring-border/40"}`}
                style={done ? undefined : undefined}
                aria-hidden
              >
                {i === reached && reached < 2 && (
                  <span className={`absolute inset-0 animate-ping rounded-full ${s.dot} opacity-50`} />
                )}
              </span>
              {i < steps.length - 1 && (
                <span
                  className={`mx-1 h-1 flex-1 rounded-full transition-all
                    ${segActive(i) ? segColor(i) : "bg-muted/50"}`}
                />
              )}
            </div>
          );
        })}
      </div>
      <div className="flex justify-between text-[9px] font-medium uppercase tracking-wider">
        {steps.map((s, i) => (
          <span key={s.key} className={i <= reached ? s.text : "text-muted-foreground/60"}>
            {s.label}
          </span>
        ))}
      </div>
    </div>
  );
}