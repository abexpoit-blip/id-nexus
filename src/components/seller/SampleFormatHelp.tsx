import { useState } from "react";
import { AlertCircle, ChevronDown, ChevronUp } from "lucide-react";
import sample61 from "@/assets/sample-format-61xxx.png";
import sample1000 from "@/assets/sample-format-1000xxx.png";

/**
 * Shown to sellers when their upload format can't be detected.
 * Displays the two accepted layouts as actual screenshots.
 */
export const SampleFormatHelp = ({ message }: { message?: string }) => {
  const [open, setOpen] = useState(true);
  return (
    <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-4">
      <div className="flex items-start gap-3">
        <AlertCircle className="mt-0.5 h-5 w-5 text-destructive" />
        <div className="flex-1 space-y-1">
          <p className="text-sm font-semibold text-destructive">
            Format not recognised
          </p>
          <p className="text-xs text-muted-foreground">
            {message ||
              "We couldn't detect any valid rows in your file. Make sure it matches one of the two accepted layouts below."}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
      </div>

      {open && (
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <SampleCard
            title="Format A — 61xxx UIDs"
            description="Column A: UID (e.g. 61588725745509). Column B: Password. Column C: Cookies blob (must contain c_user=…)."
            src={sample61}
          />
          <SampleCard
            title="Format B — 1000xxx UIDs"
            description="Column A: UID (e.g. 100010709204979). Column B: Password. Column C: Cookies blob (must contain c_user=…)."
            src={sample1000}
          />
        </div>
      )}

      {open && (
        <div className="mt-4 rounded-lg border border-border/50 bg-background/40 p-3 text-xs text-muted-foreground">
          <p className="font-semibold text-foreground">Common fixes</p>
          <ul className="mt-1 list-disc space-y-1 pl-5">
            <li>
              If UIDs show as <code className="rounded bg-muted px-1">1.00093E+14</code> in Excel,
              the parser will auto-recover the real ID from the cookies column. Don't worry — it's handled.
            </li>
            <li>Make sure the cookies blob contains <code className="rounded bg-muted px-1">c_user=…</code></li>
            <li>Remove any header row OR use these exact headers: <code className="rounded bg-muted px-1">uid, password, cookies</code></li>
            <li>One row per account, no blank rows in the middle.</li>
          </ul>
        </div>
      )}
    </div>
  );
};

const SampleCard = ({
  title,
  description,
  src,
}: {
  title: string;
  description: string;
  src: string;
}) => (
  <figure className="overflow-hidden rounded-lg border border-border/50 bg-background/40">
    <img src={src} alt={title} className="h-32 w-full object-cover object-left-top" />
    <figcaption className="space-y-1 border-t border-border/50 p-3">
      <p className="text-xs font-semibold">{title}</p>
      <p className="text-[11px] text-muted-foreground">{description}</p>
    </figcaption>
  </figure>
);