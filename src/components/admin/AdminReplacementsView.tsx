import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  RefreshCcw, DollarSign, XCircle, CheckCircle2, Clock, AlertTriangle,
  Search, FileText, ShieldCheck, Sparkles, ChevronDown,
} from "lucide-react";

export interface RpItem {
  id: string;
  request_id: string;
  reported_uid: string;
  outcome: string;
  outcome_reason: string | null;
  in_window: boolean;
  window_hours: number | null;
  created_at: string;
  buyer_id: string;
  seller_id: string | null;
  account_id: string | null;
}

const outcomeMeta = (o: string) => {
  switch (o) {
    case "pending":     return { label: "Pending",     tile: "tile-amber",   chip: "chip-amber",   text: "text-amber-500",     Icon: Clock };
    case "replaced":    return { label: "Replaced",    tile: "tile-emerald", chip: "chip-emerald", text: "text-emerald-500",   Icon: CheckCircle2 };
    case "refunded":    return { label: "Refunded",    tile: "tile-cyan",    chip: "chip-cyan",    text: "text-cyan-400",      Icon: DollarSign };
    case "rejected":    return { label: "Rejected",    tile: "tile-rose",    chip: "chip-rose",    text: "text-destructive",   Icon: XCircle };
    case "out_of_window": return { label: "Out of window", tile: "tile-sky", chip: "chip-sky",     text: "text-sky-400",       Icon: ShieldCheck };
    default:            return { label: o.replace(/_/g, " "), tile: "tile-violet", chip: "chip-violet", text: "text-muted-foreground", Icon: AlertTriangle };
  }
};

type StatusKey = "all" | "pending" | "replaced" | "refunded" | "rejected" | "out_of_window";
type WindowKey = "all" | "in" | "out";

const STATUS_FILTERS: { key: StatusKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "pending", label: "Pending" },
  { key: "replaced", label: "Replaced" },
  { key: "refunded", label: "Refunded" },
  { key: "rejected", label: "Rejected" },
  { key: "out_of_window", label: "Out of window" },
];

interface Props {
  items: RpItem[];
  loading: boolean;
  categories: { id: string; name: string }[];
  onAction: (item: RpItem, act: "replace" | "refund" | "reject" | "replace_category", catId?: string) => void;
}

export const AdminReplacementsView = ({ items, loading, categories, onAction }: Props) => {
  const [status, setStatus] = useState<StatusKey>("pending");
  const [windowFilter, setWindowFilter] = useState<WindowKey>("all");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const counts = useMemo(() => ({
    all: items.length,
    pending: items.filter((i) => i.outcome === "pending").length,
    replaced: items.filter((i) => i.outcome === "replaced").length,
    refunded: items.filter((i) => i.outcome === "refunded").length,
    rejected: items.filter((i) => i.outcome === "rejected").length,
    out_of_window: items.filter((i) => i.outcome === "out_of_window").length,
  }), [items]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((i) => {
      if (status !== "all" && i.outcome !== status) return false;
      if (windowFilter === "in" && !i.in_window) return false;
      if (windowFilter === "out" && i.in_window) return false;
      if (q && !(i.reported_uid.toLowerCase().includes(q) ||
                 i.id.toLowerCase().includes(q) ||
                 i.request_id.toLowerCase().includes(q))) return false;
      return true;
    });
  }, [items, status, windowFilter, search]);

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Colorful KPI strip */}
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-5 md:gap-3">
        <KpiMini label="Pending"    count={counts.pending}    tile="tile-amber"   chip="chip-amber"   Icon={Clock} onClick={() => setStatus("pending")} active={status === "pending"} />
        <KpiMini label="Replaced"   count={counts.replaced}   tile="tile-emerald" chip="chip-emerald" Icon={CheckCircle2} onClick={() => setStatus("replaced")} active={status === "replaced"} />
        <KpiMini label="Refunded"   count={counts.refunded}   tile="tile-cyan"    chip="chip-cyan"    Icon={DollarSign} onClick={() => setStatus("refunded")} active={status === "refunded"} />
        <KpiMini label="Rejected"   count={counts.rejected}   tile="tile-rose"    chip="chip-rose"    Icon={XCircle} onClick={() => setStatus("rejected")} active={status === "rejected"} />
        <KpiMini label="Out of win" count={counts.out_of_window} tile="tile-sky" chip="chip-sky"     Icon={ShieldCheck} onClick={() => setStatus("out_of_window")} active={status === "out_of_window"} />
      </div>

      {/* Filters */}
      <Card className="glass-panel border-0 p-3 md:p-4">
        <div className="flex flex-col gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search UID or request id…"
              className="pl-9"
            />
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {STATUS_FILTERS.map((s) => {
              const active = status === s.key;
              return (
                <button
                  key={s.key}
                  onClick={() => setStatus(s.key)}
                  className={`rounded-full border px-3 py-1 text-xs font-medium transition-all ${
                    active
                      ? "border-primary bg-primary/15 text-primary shadow-[0_0_0_1px_hsl(var(--primary)/0.4)]"
                      : "border-border/60 text-muted-foreground hover:border-primary/40 hover:text-foreground"
                  }`}
                >
                  {s.label}
                  <span className="ml-1.5 rounded-full bg-muted/50 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                    {counts[s.key as keyof typeof counts] ?? 0}
                  </span>
                </button>
              );
            })}
            <span className="mx-2 hidden h-4 w-px bg-border/60 md:inline" />
            {(["all", "in", "out"] as WindowKey[]).map((w) => {
              const active = windowFilter === w;
              const label = w === "all" ? "Any window" : w === "in" ? "In window" : "Out of window";
              return (
                <button
                  key={w}
                  onClick={() => setWindowFilter(w)}
                  className={`rounded-full border px-3 py-1 text-xs font-medium transition-all ${
                    active
                      ? "border-secondary bg-secondary/15 text-secondary"
                      : "border-border/60 text-muted-foreground hover:border-secondary/40"
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      </Card>

      {/* Cards */}
      {loading ? (
        <Card className="glass-panel border-0 p-12 text-center text-sm text-muted-foreground">Loading…</Card>
      ) : filtered.length === 0 ? (
        <Card className="glass-panel border-0 p-12 text-center">
          <Sparkles className="mx-auto h-8 w-8 text-emerald-500" />
          <p className="mt-3 text-sm text-muted-foreground">Nothing matches these filters.</p>
        </Card>
      ) : (
        <div className="grid gap-3 md:gap-4">
          {filtered.map((it) => {
            const meta = outcomeMeta(it.outcome);
            const isOpen = !!expanded[it.id];
            return (
              <div key={it.id} className={`kpi-tile ${meta.tile} !p-0`}>
                {/* Header */}
                <div className="flex flex-wrap items-start justify-between gap-3 p-4 md:p-5">
                  <div className="flex items-start gap-3">
                    <span className={`icon-chip ${meta.chip} h-10 w-10`}>
                      <meta.Icon className="h-5 w-5" />
                    </span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-base font-bold tabular-nums md:text-lg">
                          {it.reported_uid}
                        </span>
                        <Badge className={`${meta.text} bg-transparent border capitalize`} variant="outline">
                          {meta.label}
                        </Badge>
                      </div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                        <span className="font-mono">#{it.request_id.slice(0, 8)}</span>
                        <span>•</span>
                        <span>{new Date(it.created_at).toLocaleString()}</span>
                        <span>•</span>
                        {it.in_window ? (
                          <span className="text-emerald-400">In window ({it.window_hours}h)</span>
                        ) : (
                          <span className="text-sky-400">Out of window</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setExpanded((e) => ({ ...e, [it.id]: !isOpen }))}
                    className="inline-flex items-center gap-1 rounded-full border border-border/60 px-3 py-1 text-[11px] text-muted-foreground hover:border-primary/40 hover:text-foreground"
                  >
                    Timeline <ChevronDown className={`h-3 w-3 transition-transform ${isOpen ? "rotate-180" : ""}`} />
                  </button>
                </div>

                {/* Timeline */}
                {isOpen && (
                  <div className="border-t border-border/40 px-4 py-4 md:px-5">
                    <Timeline item={it} meta={meta} />
                  </div>
                )}

                {/* Actions */}
                <div className="border-t border-border/40 bg-background/30 px-4 py-3 md:px-5">
                  {it.outcome === "pending" ? (
                    <div className="flex flex-wrap gap-1.5">
                      {categories.map((c) => (
                        <Button
                          key={c.id}
                          size="sm"
                          variant="outline"
                          className="border-primary/40 text-primary hover:bg-primary/10"
                          onClick={() => onAction(it, "replace_category", c.id)}
                        >
                          <RefreshCcw className="mr-1 h-3 w-3" /> {c.name}
                        </Button>
                      ))}
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10"
                        onClick={() => onAction(it, "replace")}
                        disabled={!it.account_id}
                      >
                        <RefreshCcw className="mr-1 h-3 w-3" /> Same cat.
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-cyan-500/40 text-cyan-400 hover:bg-cyan-500/10"
                        onClick={() => onAction(it, "refund")}
                        disabled={!it.account_id}
                      >
                        <DollarSign className="mr-1 h-3 w-3" /> Refund
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-destructive/40 text-destructive hover:bg-destructive/10"
                        onClick={() => onAction(it, "reject")}
                      >
                        <XCircle className="mr-1 h-3 w-3" /> Reject
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <FileText className="h-3.5 w-3.5" />
                      <span>{it.outcome_reason ?? "No reason provided"}</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

function KpiMini({
  label, count, tile, chip, Icon, onClick, active,
}: { label: string; count: number; tile: string; chip: string; Icon: any; onClick: () => void; active: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`kpi-tile ${tile} !p-3 text-left transition-all ${active ? "ring-2 ring-primary/60" : ""}`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
          {label}
        </div>
        <span className={`icon-chip ${chip} h-7 w-7`}><Icon className="h-3.5 w-3.5" /></span>
      </div>
      <div className="mt-1.5 font-display text-2xl font-bold tabular-nums">{count}</div>
    </button>
  );
}

function Timeline({ item, meta }: { item: RpItem; meta: ReturnType<typeof outcomeMeta> }) {
  const filed = new Date(item.created_at);
  const final = item.outcome !== "pending";

  const dots = [
    {
      label: "Filed",
      sub: filed.toLocaleString(),
      Icon: FileText,
      color: "bg-amber-500",
      done: true,
    },
    {
      label: item.in_window ? `In window (${item.window_hours}h)` : "Out of window",
      sub: item.in_window ? "Eligible for replace" : "Past replacement window",
      Icon: ShieldCheck,
      color: item.in_window ? "bg-emerald-500" : "bg-sky-500",
      done: true,
    },
    {
      label: meta.label,
      sub: item.outcome_reason ?? (final ? "Resolved" : "Awaiting admin"),
      Icon: meta.Icon,
      color: final
        ? (item.outcome === "rejected" ? "bg-destructive" :
           item.outcome === "refunded" ? "bg-cyan-500" :
           item.outcome === "out_of_window" ? "bg-sky-500" : "bg-emerald-500")
        : "bg-amber-500 animate-pulse",
      done: final,
    },
  ];

  return (
    <ol className="relative space-y-4 border-l border-border/60 pl-5">
      {dots.map((d, i) => (
        <li key={i} className="relative">
          <span className={`absolute -left-[26px] top-0.5 flex h-4 w-4 items-center justify-center rounded-full ${d.color} ring-4 ring-background`}>
            <d.Icon className="h-2.5 w-2.5 text-white" />
          </span>
          <div className="text-sm font-semibold">{d.label}</div>
          <div className="text-xs text-muted-foreground">{d.sub}</div>
        </li>
      ))}
    </ol>
  );
}
