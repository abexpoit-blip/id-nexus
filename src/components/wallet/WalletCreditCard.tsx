import { useState, useMemo } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { RotateCw, ArrowUpRight } from "lucide-react";
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
  const edition = variant === "seller" ? "SELLER · NOIR" : "PREFERRED · NOIR";
  const memberSince = useMemo(() => new Date().getFullYear() % 100, []);

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
          className="absolute inset-0 overflow-hidden rounded-2xl border border-white/10
            bg-[radial-gradient(120%_140%_at_85%_-10%,#2a2a2a_0%,#141414_35%,#0a0a0a_65%,#000_100%)]
            text-white shadow-[0_40px_90px_-30px_rgba(0,0,0,0.95),0_20px_50px_-20px_rgba(201,168,76,0.25),inset_0_1px_0_rgba(255,255,255,0.08)]"
          style={{ backfaceVisibility: "hidden" }}
        >
          {/* brushed-metal micro grain */}
          <div aria-hidden className="pointer-events-none absolute inset-0 opacity-[0.12] mix-blend-overlay [background:repeating-linear-gradient(90deg,rgba(255,255,255,0.18)_0_1px,transparent_1px_2px)]" />
          {/* guilloché engraved arcs */}
          <div aria-hidden className="pointer-events-none absolute inset-0 opacity-[0.10] mix-blend-screen [background:repeating-radial-gradient(circle_at_85%_15%,rgba(201,168,76,0.6)_0_1px,transparent_1px_8px)]" />
          {/* gold bloom top-right */}
          <div aria-hidden className="pointer-events-none absolute -top-24 -right-16 h-64 w-64 rounded-full bg-[radial-gradient(circle,rgba(201,168,76,0.35),transparent_70%)] blur-3xl" />
          {/* holographic sheen */}
          <div aria-hidden className="pointer-events-none absolute inset-0 opacity-30 mix-blend-screen bg-[linear-gradient(115deg,transparent_38%,rgba(255,215,140,0.18)_46%,rgba(255,255,255,0.22)_50%,rgba(180,140,255,0.18)_54%,transparent_62%)]" />
          {/* deep vignette */}
          <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_120%_at_50%_50%,transparent_55%,rgba(0,0,0,0.55)_100%)]" />
          {/* centurion silhouette */}
          <CenturionSilhouette className="pointer-events-none absolute right-[-6%] top-1/2 h-[115%] w-auto -translate-y-1/2 opacity-[0.45] mix-blend-screen" />
          {/* gold hairlines */}
          <div aria-hidden className="pointer-events-none absolute inset-x-5 top-0 h-px bg-gradient-to-r from-transparent via-amber-300/50 to-transparent" />
          <div aria-hidden className="pointer-events-none absolute inset-x-5 bottom-0 h-px bg-gradient-to-r from-transparent via-amber-300/40 to-transparent" />

          <div className="relative z-10 flex h-full flex-col justify-between p-4 sm:p-5">
            <div className="flex items-start justify-between gap-3">
              <RotateCw className="mt-1 h-3 w-3 text-amber-200/60" aria-label="flip hint" />
              <div className="text-right">
                <div className="font-display text-[15px] font-extrabold uppercase leading-none tracking-[0.08em] sm:text-[17px] bg-gradient-to-br from-amber-100 via-[#e8c97a] to-amber-600 bg-clip-text text-transparent drop-shadow-[0_1px_8px_rgba(201,168,76,0.4)]">
                  NEXUS-X
                </div>
                <div className="mt-0.5 font-display text-[10px] font-bold uppercase tracking-[0.32em] text-amber-200/80 sm:text-[11px]">
                  Noir Wallet
                </div>
                <div className="mt-1 text-[8px] uppercase tracking-[0.28em] text-white/40">
                  {edition}
                </div>
              </div>
            </div>

            <div className="-mt-1 flex flex-col gap-2">
              <EmvChip />
              {/* contactless + last4 */}
              <div className="flex items-center gap-2 font-mono text-[11px] tracking-[0.22em] text-amber-100/80">
                <ContactlessIcon className="h-3.5 w-3.5 text-amber-200/70" />
                <span className="font-semibold">•••• {last4}</span>
              </div>
              <div className="font-mono text-[18px] font-semibold tracking-[0.14em] sm:text-[22px]">
                {loading ? (
                  <Skeleton className="inline-block h-5 w-44 bg-white/10 align-middle" />
                ) : (
                  <>
                    <span className="text-amber-200/60">৳</span>{" "}
                    <span className="bg-gradient-to-br from-amber-50 via-[#f3d77a] to-[#a87c1f] bg-clip-text text-transparent drop-shadow-[0_2px_18px_rgba(201,168,76,0.55)]">
                      {fmt(balance)}
                    </span>
                  </>
                )}
              </div>
            </div>

            <div className="flex items-end justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate font-display text-[13px] font-bold uppercase tracking-[0.18em] text-white sm:text-[15px] drop-shadow-[0_1px_3px_rgba(0,0,0,0.6)]">
                  {cardholder}
                </div>
                <div className="mt-0.5 font-mono text-[8px] uppercase tracking-[0.28em] text-amber-200/50">
                  Cardholder · Titulaire
                </div>
              </div>
              <MemberSinceBadge year={memberSince} />
              <div className="text-right">
                <div className="font-mono text-[8px] uppercase tracking-[0.28em] text-amber-200/50">Valid thru</div>
                <div className="font-mono text-[11px] font-semibold tracking-[0.16em] text-amber-100 sm:text-[12px]">{validThru}</div>
              </div>
            </div>
          </div>
        </div>

        {/* BACK */}
        <div
          className="absolute inset-0 overflow-hidden rounded-2xl border border-white/10
            bg-[radial-gradient(120%_120%_at_0%_100%,#1a1a1a_0%,#0a0a0a_55%,#000_100%)]
            text-white shadow-[0_40px_90px_-30px_rgba(0,0,0,0.95),0_20px_50px_-20px_rgba(201,168,76,0.25)]"
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
    <div className="relative shrink-0 rounded-md border border-sky-200/40 bg-gradient-to-br from-sky-200/25 to-sky-700/15 px-2 py-1 text-right backdrop-blur">
      <div className="font-display text-[10px] font-bold uppercase leading-none tracking-[0.18em] text-sky-100">NX</div>
      <div className="text-[7px] font-medium uppercase leading-tight tracking-[0.18em] text-sky-100/70">Wallet</div>
    </div>
  );
}

/** Centurion-style soldier silhouette, embossed look — inspired by Amex Preferred. */
function CenturionSilhouette({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 220 260"
      className={className}
      aria-hidden
    >
      <defs>
        <linearGradient id="centHi" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#f3d77a" stopOpacity="0.85" />
          <stop offset="55%" stopColor="#a87c1f" stopOpacity="0.45" />
          <stop offset="100%" stopColor="#3a2a08" stopOpacity="0" />
        </linearGradient>
        <radialGradient id="centRing" cx="50%" cy="50%" r="50%">
          <stop offset="70%" stopColor="rgba(201,168,76,0)" />
          <stop offset="92%" stopColor="rgba(201,168,76,0.55)" />
          <stop offset="100%" stopColor="rgba(201,168,76,0)" />
        </radialGradient>
      </defs>
      {/* portrait ring */}
      <circle cx="110" cy="130" r="105" fill="url(#centRing)" />
      {/* helmeted profile (stylized) */}
      <g fill="url(#centHi)" stroke="rgba(243,215,122,0.45)" strokeWidth="0.6">
        {/* helmet crest */}
        <path d="M55 70 C 70 30, 130 25, 158 55 C 165 50, 178 55, 178 70 C 178 80, 168 88, 158 86 C 158 95, 152 102, 145 105 L 145 120 C 160 125, 168 138, 168 152 L 60 152 C 58 130, 60 110, 70 95 C 60 90, 52 82, 55 70 Z" />
        {/* face profile */}
        <path d="M118 96 C 130 96, 140 104, 142 116 C 142 124, 138 130, 132 134 L 132 148 C 132 155, 126 160, 118 160 L 102 160 C 98 158, 96 152, 100 148 L 108 144 C 104 138, 102 130, 104 122 C 106 108, 112 100, 118 96 Z" fill="rgba(243,215,122,0.55)" />
        {/* shoulder/armor */}
        <path d="M40 200 C 70 175, 150 175, 195 200 L 200 260 L 35 260 Z" />
      </g>
    </svg>
  );
}

/** Stylized contactless waves icon */
function ContactlessIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
      <path d="M6 8c2.5 2.5 2.5 5.5 0 8" opacity="0.55" />
      <path d="M10 6c4 4 4 8 0 12" opacity="0.75" />
      <path d="M14 4c5.5 5.5 5.5 10.5 0 16" opacity="0.95" />
    </svg>
  );
}

/** Oval "MEMBER SINCE 'YY" badge, Amex-style. */
function MemberSinceBadge({ year }: { year: number }) {
  return (
    <div className="relative shrink-0 rounded-full border border-amber-200/40 bg-gradient-to-br from-amber-200/15 to-amber-900/10 px-2.5 py-1 text-center backdrop-blur shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]">
      <div className="font-display text-[7px] font-bold uppercase leading-none tracking-[0.24em] text-amber-100/90">
        Member Since
      </div>
      <div className="mt-0.5 font-display text-[12px] font-extrabold leading-none text-amber-50 tabular-nums sm:text-[14px] drop-shadow-[0_1px_3px_rgba(0,0,0,0.6)]">
        {String(year).padStart(2, "0")}
      </div>
      <div className="mt-0.5 text-[6px] font-medium uppercase tracking-[0.22em] text-amber-100/55">
        Titulaire Depuis
      </div>
    </div>
  );
}