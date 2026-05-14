import { useState, useMemo } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowUpRight } from "lucide-react";
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
 * NEXUS-X RESERVE — luxury obsidian + rose-gold metal credit card.
 * Click to flip → recent transactions on the back.
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
  const validThru = useMemo(() => {
    const d = new Date();
    d.setFullYear(d.getFullYear() + 4);
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const yy = String(d.getFullYear()).slice(-2);
    return `${mm}/${yy}`;
  }, []);
  const memberSince = useMemo(() => new Date().getFullYear() % 100, []);
  const tier = variant === "seller" ? "RESERVE" : "PRIVATE";

  return (
    <div
      className="group relative aspect-[1.586/1] w-full max-w-md cursor-pointer select-none"
      style={{ perspective: "1400px" }}
      onClick={() => setFlipped((f) => !f)}
      role="button"
      aria-label="Flip wallet card"
    >
      <div
        className="relative h-full w-full transition-transform duration-700 [transition-timing-function:cubic-bezier(.2,.8,.2,1)]"
        style={{
          transformStyle: "preserve-3d",
          transform: flipped ? "rotateY(180deg)" : "rotateY(0deg)",
        }}
      >
        {/* ============ FRONT ============ */}
        <div
          className="absolute inset-0 overflow-hidden rounded-[22px] text-white
            bg-[radial-gradient(130%_120%_at_15%_0%,#3a3024_0%,#1a140d_30%,#0a0805_70%,#000_100%)]
            shadow-[0_50px_100px_-30px_rgba(0,0,0,0.95),0_25px_60px_-25px_rgba(212,165,116,0.35),inset_0_1px_0_rgba(255,255,255,0.10),inset_0_-1px_0_rgba(0,0,0,0.6)]
            ring-1 ring-white/[0.06]"
          style={{ backfaceVisibility: "hidden" }}
        >
          {/* brushed metal grain */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-[0.10] mix-blend-overlay
              [background:repeating-linear-gradient(92deg,rgba(255,255,255,0.5)_0_1px,transparent_1px_2px)]"
          />
          {/* concentric guilloché rings */}
          <div
            aria-hidden
            className="pointer-events-none absolute -right-32 -top-32 h-[420px] w-[420px] rounded-full opacity-[0.18] mix-blend-screen
              [background:repeating-radial-gradient(circle,rgba(212,165,116,0.55)_0_1px,transparent_1px_10px)]"
          />
          {/* rose-gold glow */}
          <div
            aria-hidden
            className="pointer-events-none absolute -top-24 left-10 h-60 w-60 rounded-full bg-[radial-gradient(circle,rgba(232,184,140,0.45),transparent_70%)] blur-3xl"
          />
          {/* holographic diagonal sheen */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-[0.28] mix-blend-screen
              bg-[linear-gradient(118deg,transparent_36%,rgba(255,220,180,0.18)_46%,rgba(255,255,255,0.28)_50%,rgba(190,150,255,0.18)_54%,transparent_64%)]"
          />
          {/* deep vignette */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_120%_at_50%_55%,transparent_55%,rgba(0,0,0,0.55)_100%)]"
          />
          {/* gold hairline frame */}
          <div aria-hidden className="pointer-events-none absolute inset-[10px] rounded-[16px] border border-amber-200/15" />

          {/* CONTENT */}
          <div className="relative z-10 flex h-full flex-col justify-between p-5 sm:p-6">
            {/* TOP ROW — wordmark left, tier right */}
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="font-display text-[18px] font-extrabold uppercase leading-none tracking-[0.14em] sm:text-[22px]
                  bg-gradient-to-br from-amber-50 via-[#e8c08c] to-[#a87340] bg-clip-text text-transparent
                  drop-shadow-[0_1px_10px_rgba(212,165,116,0.45)]">
                  NEXUS-X
                </div>
                <div className="mt-1 font-mono text-[8px] font-medium uppercase tracking-[0.42em] text-amber-200/55">
                  Established · MMXXVI
                </div>
              </div>
              <div className="flex flex-col items-end gap-1.5">
                <Monogram />
                <div className="font-display text-[9px] font-bold uppercase tracking-[0.34em] text-amber-100/85">
                  {tier}
                </div>
              </div>
            </div>

            {/* MIDDLE — chip + balance */}
            <div className="flex items-end justify-between gap-4">
              <div className="flex flex-col gap-3">
                <EmvChip />
                <ContactlessIcon className="h-4 w-4 text-amber-200/75" />
              </div>
              <div className="flex-1 text-right">
                <div className="font-mono text-[8px] font-medium uppercase tracking-[0.36em] text-amber-200/45">
                  Available Balance
                </div>
                <div className="mt-1 font-display text-[26px] font-semibold tracking-tight sm:text-[32px]">
                  {loading ? (
                    <Skeleton className="ml-auto inline-block h-7 w-44 bg-white/10 align-middle" />
                  ) : (
                    <>
                      <span className="text-amber-200/55">৳</span>
                      <span className="ml-1 bg-gradient-to-br from-amber-50 via-[#f3d9a8] to-[#a87340] bg-clip-text text-transparent
                        drop-shadow-[0_2px_22px_rgba(212,165,116,0.55)]">
                        {fmt(balance)}
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* BOTTOM — cardholder · valid · last4 */}
            <div className="flex items-end justify-between gap-3 border-t border-amber-200/10 pt-3">
              <div className="min-w-0">
                <div className="font-mono text-[7px] font-medium uppercase tracking-[0.36em] text-amber-200/45">
                  Cardholder
                </div>
                <div className="mt-0.5 truncate font-display text-[13px] font-bold uppercase tracking-[0.18em] text-white sm:text-[15px]">
                  {cardholder}
                </div>
              </div>
              <div className="text-center">
                <div className="font-mono text-[7px] font-medium uppercase tracking-[0.36em] text-amber-200/45">
                  Member
                </div>
                <div className="mt-0.5 font-display text-[13px] font-extrabold leading-none text-amber-100 tabular-nums">
                  ’{String(memberSince).padStart(2, "0")}
                </div>
              </div>
              <div className="text-center">
                <div className="font-mono text-[7px] font-medium uppercase tracking-[0.36em] text-amber-200/45">
                  Valid Thru
                </div>
                <div className="mt-0.5 font-mono text-[12px] font-semibold tracking-[0.16em] text-amber-100">
                  {validThru}
                </div>
              </div>
              <div className="text-right">
                <div className="font-mono text-[7px] font-medium uppercase tracking-[0.36em] text-amber-200/45">
                  Card N°
                </div>
                <div className="mt-0.5 font-mono text-[12px] font-semibold tracking-[0.22em] text-white">
                  •• {last4}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ============ BACK ============ */}
        <div
          className="absolute inset-0 overflow-hidden rounded-[22px] text-white
            bg-[radial-gradient(130%_120%_at_85%_100%,#2a221a_0%,#150f0a_40%,#080604_75%,#000_100%)]
            shadow-[0_50px_100px_-30px_rgba(0,0,0,0.95),0_25px_60px_-25px_rgba(212,165,116,0.3)]
            ring-1 ring-white/[0.06]"
          style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)" }}
        >
          {/* mag stripe */}
          <div aria-hidden className="absolute inset-x-0 top-6 h-9 bg-gradient-to-b from-black via-zinc-900 to-black" />
          <div aria-hidden className="absolute inset-x-0 top-6 h-9 opacity-30 mix-blend-screen [background:repeating-linear-gradient(90deg,rgba(255,255,255,0.4)_0_1px,transparent_1px_3px)]" />
          {/* gold frame */}
          <div aria-hidden className="pointer-events-none absolute inset-[10px] rounded-[16px] border border-amber-200/15" />

          <div className="relative z-10 flex h-full flex-col p-5 pt-[68px] sm:p-6 sm:pt-[72px]">
            <div className="mb-2 flex items-center justify-between">
              <div className="font-display text-[10px] font-bold uppercase tracking-[0.32em] text-amber-200/85">
                Recent Activity
              </div>
              <div className="font-mono text-[8px] uppercase tracking-[0.3em] text-amber-200/45">
                Tap to flip
              </div>
            </div>

            <div className="flex-1 space-y-1.5 overflow-hidden">
              {loading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-5 w-full bg-white/5" />
                ))
              ) : recent.length === 0 ? (
                <div className="flex h-full items-center justify-center text-[10px] uppercase tracking-[0.3em] text-amber-200/35">
                  No transactions yet
                </div>
              ) : (
                recent.slice(0, 5).map((r) => {
                  const amt = Number(r.amount_bdt);
                  const positive = amt >= 0;
                  return (
                    <div
                      key={r.id}
                      className="flex items-center justify-between gap-2 border-b border-amber-200/8 pb-1 last:border-0"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-mono text-[10px] uppercase tracking-[0.18em] text-white/75">
                          {r.kind.replace(/_/g, " ")}
                        </div>
                        <div className="text-[9px] text-white/35">
                          {new Date(r.created_at).toLocaleDateString()}
                        </div>
                      </div>
                      <div
                        className={`font-mono text-xs font-semibold tabular-nums ${
                          positive ? "text-emerald-300" : "text-rose-300"
                        }`}
                      >
                        {positive ? "+" : ""}৳{Math.abs(amt).toFixed(0)}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div className="mt-2 flex items-center justify-between gap-2">
              <div className="font-mono text-[8px] uppercase tracking-[0.3em] text-amber-200/40">
                NEXUS-X · {tier}
              </div>
              {showOpenLink && (
                <Link
                  to="/wallet"
                  onClick={(e) => e.stopPropagation()}
                  className="inline-flex items-center gap-1 rounded-full border border-amber-200/40 bg-black/40 px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.22em] text-amber-100 backdrop-blur transition hover:bg-amber-200/15 hover:text-white"
                >
                  Open <ArrowUpRight className="h-2.5 w-2.5" />
                </Link>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ============ Sub-components ============ */

function EmvChip() {
  return (
    <svg width="44" height="34" viewBox="0 0 44 34" aria-hidden
      className="drop-shadow-[0_3px_8px_rgba(212,165,116,0.45)]">
      <defs>
        <linearGradient id="rxChipBase" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#fbe6b3" />
          <stop offset="40%" stopColor="#d4a574" />
          <stop offset="100%" stopColor="#7a4f1f" />
        </linearGradient>
        <linearGradient id="rxChipLine" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#3a230a" />
          <stop offset="100%" stopColor="#a87340" />
        </linearGradient>
      </defs>
      <rect x="0.5" y="0.5" width="43" height="33" rx="5" fill="url(#rxChipBase)" stroke="#5a3815" />
      <line x1="15" y1="6" x2="44" y2="6" stroke="url(#rxChipLine)" strokeWidth="0.8" />
      <line x1="15" y1="13" x2="44" y2="13" stroke="url(#rxChipLine)" strokeWidth="0.8" />
      <line x1="15" y1="21" x2="44" y2="21" stroke="url(#rxChipLine)" strokeWidth="0.8" />
      <line x1="15" y1="28" x2="44" y2="28" stroke="url(#rxChipLine)" strokeWidth="0.8" />
      <line x1="15" y1="0" x2="15" y2="34" stroke="url(#rxChipLine)" strokeWidth="0.8" />
      <line x1="29" y1="0" x2="29" y2="34" stroke="url(#rxChipLine)" strokeWidth="0.8" />
      <rect x="13" y="11" width="18" height="12" rx="1.8" fill="none" stroke="#3a230a" strokeWidth="0.7" />
    </svg>
  );
}

function ContactlessIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" aria-hidden>
      <path d="M6 8c2.5 2.5 2.5 5.5 0 8" opacity="0.5" />
      <path d="M10 6c4 4 4 8 0 12" opacity="0.75" />
      <path d="M14 4c5.5 5.5 5.5 10.5 0 16" opacity="0.95" />
    </svg>
  );
}

/** NX monogram crest — geometric, embossed gold. */
function Monogram() {
  return (
    <div className="relative flex h-9 w-9 items-center justify-center rounded-md border border-amber-200/35
      bg-gradient-to-br from-amber-200/20 via-amber-700/10 to-black/40
      shadow-[inset_0_1px_0_rgba(255,255,255,0.18),inset_0_-1px_0_rgba(0,0,0,0.5)]">
      <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden>
        <defs>
          <linearGradient id="rxMono" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#fbe6b3" />
            <stop offset="100%" stopColor="#a87340" />
          </linearGradient>
        </defs>
        <g fill="none" stroke="url(#rxMono)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 20 L4 4 L20 20 L20 4" />
        </g>
      </svg>
    </div>
  );
}