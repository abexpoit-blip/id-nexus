import { useEffect, useState } from "react";
import { Loader2, AlertTriangle, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Spinner that escalates to a "stuck loading" UI after `timeoutMs`.
 * Prevents users from staring at an infinite spinner if a chunk fails
 * to load (e.g. flaky network, deploy gap, blocked CDN).
 */
export const RouteFallback = ({ timeoutMs = 12_000 }: { timeoutMs?: number }) => {
  const [stuck, setStuck] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setStuck(true), timeoutMs);
    return () => clearTimeout(t);
  }, [timeoutMs]);

  if (!stuck) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-md space-y-4 rounded-xl border border-border/60 bg-card p-6 text-center shadow-lg">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
          <AlertTriangle className="h-6 w-6 text-destructive" />
        </div>
        <div className="space-y-1">
          <h2 className="font-display text-lg font-semibold">Taking longer than expected</h2>
          <p className="text-sm text-muted-foreground">
            The page didn’t load in time. This is usually a network hiccup.
          </p>
        </div>
        <div className="flex justify-center gap-2">
          <Button onClick={() => window.location.reload()} className="bg-gradient-brand text-primary-foreground">
            <RotateCw className="mr-2 h-4 w-4" /> Reload page
          </Button>
        </div>
      </div>
    </div>
  );
};

export default RouteFallback;