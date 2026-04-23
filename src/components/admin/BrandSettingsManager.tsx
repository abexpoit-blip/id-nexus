import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Save, Sparkles, History, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { BRAND_DEFAULTS, BRAND_SETTING_KEY, useBrandSettings } from "@/hooks/useBrandSettings";

interface AuditEntry {
  id: string;
  created_at: string;
  actor_email: string | null;
  details: any;
}

export const BrandSettingsManager = () => {
  const { settings, loading } = useBrandSettings();
  const [developerName, setDeveloperName] = useState(BRAND_DEFAULTS.developer_name);
  const [developerUrl, setDeveloperUrl] = useState(BRAND_DEFAULTS.developer_url);
  const [parentBrand, setParentBrand] = useState(BRAND_DEFAULTS.parent_brand);
  const [saving, setSaving] = useState(false);
  const [history, setHistory] = useState<AuditEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const loadHistory = async () => {
    setHistoryLoading(true);
    const { data, error } = await supabase
      .from("audit_logs")
      .select("id, created_at, actor_email, details")
      .eq("event_type", "brand_credit_updated")
      .order("created_at", { ascending: false })
      .limit(15);
    setHistoryLoading(false);
    if (error) toast.error("Could not load history");
    else setHistory((data ?? []) as AuditEntry[]);
  };

  useEffect(() => {
    loadHistory();
  }, []);

  useEffect(() => {
    if (loading) return;
    setDeveloperName(settings.developer_name);
    setDeveloperUrl(settings.developer_url);
    setParentBrand(settings.parent_brand);
  }, [loading, settings.developer_name, settings.developer_url, settings.parent_brand]);

  const onSave = async () => {
    setSaving(true);
    const { error } = await supabase.rpc("admin_save_brand_credit", {
      p_developer_name: developerName,
      p_developer_url: developerUrl,
      p_parent_brand: parentBrand,
    });
    setSaving(false);
    if (error) toast.error(error.message);
    else {
      toast.success("Brand credit updated — live across the site");
      loadHistory();
    }
  };

  const onReset = () => {
    setDeveloperName(BRAND_DEFAULTS.developer_name);
    setDeveloperUrl(BRAND_DEFAULTS.developer_url);
    setParentBrand(BRAND_DEFAULTS.parent_brand);
  };

  return (
    <Card className="border-border/60 bg-gradient-card p-6">
      <div className="mb-5 flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-primary" />
        <h2 className="font-display text-lg font-semibold">Brand credit & tagline</h2>
      </div>
      <p className="mb-5 text-sm text-muted-foreground">
        Edits update the footer tagline and "Developed by" credit across every page in real time.
      </p>

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <Label htmlFor="dev-name">Developer name</Label>
          <Input id="dev-name" value={developerName} maxLength={40} onChange={(e) => setDeveloperName(e.target.value)} className="mt-1.5" />
        </div>
        <div>
          <Label htmlFor="dev-url">Developer link (URL)</Label>
          <Input id="dev-url" value={developerUrl} maxLength={200} onChange={(e) => setDeveloperUrl(e.target.value)} className="mt-1.5" placeholder="https://..." />
        </div>
        <div className="md:col-span-2">
          <Label htmlFor="parent-brand">Parent brand tagline</Label>
          <Input id="parent-brand" value={parentBrand} maxLength={60} onChange={(e) => setParentBrand(e.target.value)} className="mt-1.5" />
        </div>
      </div>

      {/* Live previews */}
      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        {/* Browser tab / favicon preview */}
        <div className="rounded-xl border border-border/60 bg-background/40 p-4">
          <div className="mb-3 text-[10px] uppercase tracking-widest text-muted-foreground">Browser tab</div>
          <div className="flex items-center gap-2 rounded-md border border-border/60 bg-card/60 px-3 py-2">
            <img src="/favicon.png" alt="favicon" width={18} height={18} className="rounded-sm" />
            <span className="truncate text-xs text-foreground">Nexus X — {parentBrand || BRAND_DEFAULTS.parent_brand}</span>
          </div>
          <div className="mt-3 text-[11px] text-muted-foreground">
            Favicon stays the NX neon mark. Tagline reflects the parent brand value.
          </div>
        </div>

        {/* Login banner preview */}
        <div className="rounded-xl border border-border/60 bg-background/40 p-4">
          <div className="mb-3 text-[10px] uppercase tracking-widest text-muted-foreground">Login banner</div>
          <div
            className="relative flex items-center justify-center gap-2 overflow-hidden rounded-full border border-primary/40 bg-card/40 px-4 py-2 backdrop-blur-xl"
            style={{
              boxShadow:
                "0 0 28px -6px hsl(var(--primary) / 0.55), 0 0 60px -20px hsl(265 84% 62% / 0.6), inset 0 0 16px -8px hsl(var(--primary) / 0.4)",
            }}
          >
            <Sparkles className="h-3.5 w-3.5 text-primary drop-shadow-[0_0_6px_hsl(var(--primary))]" />
            <span
              className="text-[11px] font-semibold uppercase tracking-[0.22em] text-foreground"
              style={{ textShadow: "0 0 10px hsl(var(--primary) / 0.65)" }}
            >
              {parentBrand || BRAND_DEFAULTS.parent_brand}
            </span>
            <Sparkles className="h-3.5 w-3.5 text-secondary drop-shadow-[0_0_6px_hsl(265_84%_62%)]" />
          </div>
          <div className="mt-3 text-[11px] text-muted-foreground">Shown above Login & Signup form.</div>
        </div>

        {/* Footer preview */}
        <div className="rounded-xl border border-border/60 bg-background/40 p-4">
          <div className="mb-3 text-[10px] uppercase tracking-widest text-muted-foreground">Footer credit</div>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <span
              className="rounded-full border border-primary/40 bg-primary/5 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-primary"
              style={{ textShadow: "0 0 12px hsl(var(--primary) / 0.7)", boxShadow: "0 0 18px -4px hsl(var(--primary) / 0.65)" }}
            >
              {parentBrand || BRAND_DEFAULTS.parent_brand}
            </span>
            <span className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-card/40 px-3 py-1">
              <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Developed by</span>
              <span
                className="bg-gradient-brand bg-clip-text font-display text-sm font-bold text-transparent"
                style={{ filter: "drop-shadow(0 0 8px hsl(265 84% 62% / 0.55))" }}
              >
                {developerName || BRAND_DEFAULTS.developer_name}
              </span>
            </span>
          </div>
          <a
            href={developerUrl || BRAND_DEFAULTS.developer_url}
            target="_blank"
            rel="noreferrer"
            className="mt-3 inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
          >
            <ExternalLink className="h-3 w-3" />
            <span className="truncate">{developerUrl || BRAND_DEFAULTS.developer_url}</span>
          </a>
        </div>
      </div>

      <div className="mt-6 flex justify-end gap-2">
        <Button variant="outline" onClick={onReset} disabled={saving}>Reset to defaults</Button>
        <Button onClick={onSave} disabled={saving} className="bg-gradient-brand text-primary-foreground shadow-glow hover:opacity-90">
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          Save & broadcast
        </Button>
      </div>

      {/* Change history */}
      <div className="mt-8 border-t border-border/60 pt-6">
        <div className="mb-3 flex items-center gap-2">
          <History className="h-4 w-4 text-muted-foreground" />
          <h3 className="font-display text-sm font-semibold">Change history</h3>
          <span className="text-xs text-muted-foreground">(last 15)</span>
        </div>
        {historyLoading ? (
          <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
        ) : history.length === 0 ? (
          <p className="text-sm text-muted-foreground">No changes recorded yet.</p>
        ) : (
          <div className="space-y-2">
            {history.map((h) => {
              const old = h.details?.old ?? {};
              const next = h.details?.new ?? {};
              const fields: Array<keyof BrandSettingsLike> = ["developer_name", "developer_url", "parent_brand"];
              const diffs = fields.filter((f) => (old?.[f] ?? "") !== (next?.[f] ?? ""));
              return (
                <div key={h.id} className="rounded-lg border border-border/60 bg-background/40 p-3 text-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium text-foreground">{h.actor_email ?? "unknown admin"}</span>
                    <span className="text-muted-foreground">{new Date(h.created_at).toLocaleString()}</span>
                  </div>
                  {diffs.length === 0 ? (
                    <div className="mt-1 text-muted-foreground">No field changes (resaved same values).</div>
                  ) : (
                    <div className="mt-2 space-y-1">
                      {diffs.map((f) => (
                        <div key={f} className="grid grid-cols-[110px_1fr] items-baseline gap-2">
                          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{f.replace("_", " ")}</span>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded bg-destructive/15 px-1.5 py-0.5 text-destructive line-through">{old?.[f] || "—"}</span>
                            <span className="text-muted-foreground">→</span>
                            <span className="rounded bg-success/15 px-1.5 py-0.5 text-success">{next?.[f] || "—"}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Card>
  );
};

type BrandSettingsLike = { developer_name: string; developer_url: string; parent_brand: string };

export default BrandSettingsManager;