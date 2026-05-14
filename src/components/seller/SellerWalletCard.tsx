import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingUp, Clock, Inbox, CheckCircle2, XCircle } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { WalletCreditCard } from "@/components/wallet/WalletCreditCard";

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
  const { user, profile } = useAuth();
  const cardholder = (
    profile?.display_name ||
    (user?.email ? user.email.split("@")[0] : "SELLER MEMBER")
  )
    .toString()
    .toUpperCase()
    .slice(0, 22);
  // Last 4 of user id as faux "card number" suffix
  const last4 = (user?.id || "0000").replace(/[^0-9a-z]/gi, "").slice(-4).toUpperCase().padStart(4, "0");

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
      {/* Premium credit-card style wallet */}
      <div className="lg:col-span-1">
        <WalletCreditCard
          loading={loading}
          balance={Number(data?.balance_bdt ?? 0)}
          cardholder={cardholder}
          last4={last4}
          variant="seller"
          recent={data?.recent_ledger ?? []}
          showOpenLink
        />

        {/* Stats row below the card */}
        <div className="mt-3 grid grid-cols-3 gap-2 text-xs sm:gap-3">
          {[
            { label: "7d", value: data?.last7_earned_bdt },
            { label: "30d", value: data?.last30_earned_bdt },
            { label: "Lifetime", value: data?.lifetime_earned_bdt },
          ].map((s) => (
            <div
              key={s.label}
              className="rounded-xl border border-amber-300/15 bg-gradient-to-br from-[#0e0a1f] to-[#050410] p-2.5 transition hover:border-amber-300/40 sm:p-3"
            >
              <div className="text-[10px] uppercase tracking-wider text-white/55">{s.label}</div>
              {loading ? (
                <Skeleton className="mt-1 h-5 w-16 bg-white/10" />
              ) : (
                <div className="mt-1 truncate font-display text-sm font-semibold tabular-nums text-amber-200 sm:text-base">
                  ৳{fmt(Number(s.value ?? 0))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

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