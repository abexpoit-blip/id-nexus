import { useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Wifi, RotateCw, ArrowUpRight } from "lucide-react";
import { Link } from "react-router-dom";

const fmt = (n: number) =>
  new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(n || 0);

interface RecentTx {
  id: string;
  kind: string;
  amount_bdt: string | number;
  created_at: string;
}

interface Props {
  loading?: boolean;
  balance: number;
  cardholder: string;
  last4: string;
  variant?: "seller" | "buyer";
  recent?: RecentTx[];
  showOpenLink?: boolean;
}

/**
 * Premium black-metal credit card wallet, reusable on Seller Dashboard
 * and the /wallet page. Click to flip → recent transactions on the back.
 */
export function WalletCreditCard({
  loading = false,
  balance,
  cardholder,
  last4,
  variant = "seller",
  recent = [],
  showOpenLink = false,
}: Props) {
  const [flipped, setFlipped] = useState(false);
  const validThru = (() => {
    const d = new Date();
    d.setFullYear(d.getFullYear() + 4);
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const yy = String(d.getFullYear()).slice(-2);
    return `${mm}/${yy}`;
  })();
  const edition = variant === "seller" ? "Seller · Black Edition" : "Member · Black Edition";

  return (
    <div
      className="group relative aspect-[1.586/1] w-full max-w-md cursor-pointer select-none"
      style={{ perspective: "1200px" }}
      onClick={() => setFlipped((f) => !f)}
      role="button"
      aria-label="Flip wallet card"
    >
      <div
        className="relative h-full w-full transition-transform duration-700 ease-out"
        style={{ transformStyle: "preserve-3d", transform: flipped ? "rotateY(180deg)" : "rotateY(0deg)" }}
      >
        {/* FRONT */}
        <div
          className="absolute inset-0 overflow-hidden rounded-2xl border border-amber-300/25
            bg-[radial-gradient(120%_120%_at_0%_0%,#231a3a_0%,#0d0a1f_55%,#040310_100%)]
            text-white shadow-[0_30px_70px_-25px_rgba(201,168,76,0.55),0_15px_40px_-15px_rgba(0,0,0,0.7)]"
          style={{ backfaceVisibility: "hidden" }}
        >
          <div aria-hidden className="pointer-events-none absolute inset-0 opacity-30 mix-blend-overlay [background:repeating-linear-gradient(115deg,rgba(255,255,255,0.04)_0_2px,transparent_2px_5px)]" />
          <div aria-hidden className="pointer-events-none absolute -top-16 -right-10 h-44 w-44 rounded-full bg-[radial-gradient(circle,rgba(201,168,76,0.55),transparent_70%)] blur-3xl" />
          <div aria-hidden className="pointer-events-none absolute -bottom-20 -left-12 h-56 w-56 rounded-full bg-[radial-gradient(circle,rgba(124,58,237,0.4),transparent_70%)] blur-3xl" />
          <div aria-hidden className="pointer-events-none absolute inset-x-5 top-0 h-px bg-gradient-to-r from-transparent via-amber-300/70 to-transparent" />
          <div aria-hidden className="pointer-events-none absolute inset-x-5 bottom-0 h-px bg-gradient-to-r from-transparent via-amber-300/40 to-transparent" />

          <div className="relative z-10 flex h-full flex-col justify-between p-4 sm:p-5">
            <div className="flex items-start justify-between">
              <div>
                <div className="font-display text-[10px] font-semibold uppercase tracking-[0.32em] text-amber-200/90">NEXUS-X</div>
                <div className="mt-0.5 text-[9px] uppercase tracking-[0.22em] text-white/45">{edition}</div>
              </div>
              <div className="flex items-center gap-2">
                <RotateCw className="h-3 w-3 text-amber-200/70" />
                <Wifi className="h-5 w-5 rotate-90 text-white/55" aria-label="contactless" />
              </div>
            </div>

            <div className="-mt-1 flex flex-col gap-2">
              <EmvChip />
              <div className="font-mono text-[15px] font-semibold tracking-[0.18em] text-white/85 sm:text-[17px]">
                {loading ? (
                  <Skeleton className="inline-block h-5 w-44 bg-white/10 align-middle" />
                ) : (
                  <>
                    <span className="text-white/55">৳</span>{" "}
                    <span className="bg-gradient-to-br from-amber-100 via-amber-300 to-amber-500 bg-clip-text text-transparent drop-shadow-[0_2px_14px_rgba(201,168,76,0.45)]">
                      {fmt(balance)}
                    </span>
                  </>
                )}
              </div>
              <div className="flex items-center gap-3 font-mono text-[10px] tracking-[0.22em] text-white/45">
                <span>•••• •••• ••••</span>
                <span className="text-white/70">{last4}</span>
              </div>
            </div>

            <div className="flex items-end justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[8px] uppercase tracking-[0.22em] text-white/45">Cardholder</div>
                <div className="mt-0.5 truncate font-mono text-[11px] font-semibold tracking-wider text-white sm:text-xs">
                  {cardholder}
                </div>
              </div>
              <div>
                <div className="text-[8px] uppercase tracking-[0.22em] text-white/45">Valid thru</div>
                <div className="mt-0.5 font-mono text-[11px] font-semibold tracking-wider text-white sm:text-xs">{validThru}</div>
              </div>
              <BrandMark />
            </div>
          </div>
        </div>

        {/* BACK */}
        <div
          className="absolute inset-0 overflow-hidden rounded-2xl border border-amber-300/25
            bg-[radial-gradient(120%_120%_at_100%_0%,#1a1530_0%,#0a081a_55%,#030210_100%)]
            text-white shadow-[0_30px_70px_-25px_rgba(201,168,76,0.55),0_15px_40px_-15px_rgba(0,0,0,0.7)]"
          style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)" }}
        >
          <div aria-hidden className="absolute inset-x-0 top-5 h-7 bg-black/80" />
          <div aria-hidden className="pointer-events-none absolute inset-x-5 bottom-0 h-px bg-gradient-to-r from-transparent via-amber-300/40 to-transparent" />

          <div className="relative z-10 flex h-full flex-col p-4 pt-16 sm:p-5 sm:pt-16">
            <div className="mb-2 flex items-center justify-between">
              <div className="font-display text-[10px] font-semibold uppercase tracking-[0.28em] text-amber-200/90">Recent activity</div>
              <RotateCw className="h-3 w-3 text-amber-200/70" />
            </div>
            <div className="flex-1 space-y-1.5 overflow-hidden">
              {loading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-5 w-full bg-white/5" />
                ))
              ) : recent.length === 0 ? (
                <div className="flex h-full items-center justify-center text-[10px] uppercase tracking-wider text-white/40">
                  No transactions yet
                </div>
              ) : (
                recent.slice(0, 5).map((r) => {
                  const amt = Number(r.amount_bdt);
                  const positive = amt >= 0;
                  return (
                    <div key={r.id} className="flex items-center justify-between gap-2 border-b border-white/5 pb-1 last:border-0">
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-mono text-[10px] uppercase tracking-wider text-white/70">
                          {r.kind.replace(/_/g, " ")}
                        </div>
                        <div className="text-[9px] text-white/40">
                          {new Date(r.created_at).toLocaleDateString()}
                        </div>
                      </div>
                      <div className={`font-mono text-xs font-semibold tabular-nums ${positive ? "text-emerald-400" : "text-rose-400"}`}>
                        {positive ? "+" : ""}৳{Math.abs(amt).toFixed(0)}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
            {showOpenLink && (
              <Link
                to="/wallet"
                onClick={(e) => e.stopPropagation()}
                className="mt-2 inline-flex items-center justify-center gap-1 rounded-full border border-amber-300/40 bg-black/40 px-2 py-1 text-[9px] font-medium uppercase tracking-wider text-amber-200 backdrop-blur transition hover:bg-amber-300/20 hover:text-white"
              >
                Open wallet <ArrowUpRight className="h-2.5 w-2.5" />
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function EmvChip() {
  return (
    <svg width="38" height="28" viewBox="0 0 38 28" className="drop-shadow-[0_2px_6px_rgba(201,168,76,0.45)]" aria-hidden>
      <defs>
        <linearGradient id="wccChipBase" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#f3d77a" />
          <stop offset="50%" stopColor="#c9a84c" />
          <stop offset="100%" stopColor="#8a6f25" />
        </linearGradient>
        <linearGradient id="wccChipLine" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#5a4710" />
          <stop offset="100%" stopColor="#a98835" />
        </linearGradient>
      </defs>
      <rect x="0.5" y="0.5" width="37" height="27" rx="4" fill="url(#wccChipBase)" stroke="#7a5e1a" />
      <line x1="13" y1="6" x2="37" y2="6" stroke="url(#wccChipLine)" strokeWidth="0.7" />
      <line x1="13" y1="11" x2="37" y2="11" stroke="url(#wccChipLine)" strokeWidth="0.7" />
      <line x1="13" y1="17" x2="37" y2="17" stroke="url(#wccChipLine)" strokeWidth="0.7" />
      <line x1="13" y1="22" x2="37" y2="22" stroke="url(#wccChipLine)" strokeWidth="0.7" />
      <line x1="13" y1="0" x2="13" y2="28" stroke="url(#wccChipLine)" strokeWidth="0.7" />
      <line x1="25" y1="0" x2="25" y2="28" stroke="url(#wccChipLine)" strokeWidth="0.7" />
      <rect x="11" y="9" width="16" height="10" rx="1.5" fill="none" stroke="#5a4710" strokeWidth="0.6" />
    </svg>
  );
}

function BrandMark() {
  return (
    <div className="relative shrink-0 rounded-md border border-amber-300/40 bg-gradient-to-br from-amber-300/30 to-amber-600/10 px-2 py-1 backdrop-blur">
      <div className="font-display text-[10px] font-bold uppercase leading-none tracking-[0.18em] text-amber-200">NX</div>
      <div className="text-[7px] font-medium uppercase leading-tight tracking-[0.18em] text-amber-200/70">Black</div>
    </div>
  );
}