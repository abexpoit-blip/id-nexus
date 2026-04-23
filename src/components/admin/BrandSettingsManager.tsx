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

      {/* Live preview */}
      <div className="mt-6 rounded-xl border border-border/60 bg-background/40 p-4">
        <div className="mb-2 text-[10px] uppercase tracking-widest text-muted-foreground">Live preview</div>
        <div className="flex flex-wrap items-center gap-3">
          <span
            className="rounded-full border border-primary/40 bg-primary/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-primary"
            style={{ textShadow: "0 0 12px hsl(var(--primary) / 0.7)", boxShadow: "0 0 18px -4px hsl(var(--primary) / 0.65)" }}
          >
            {parentBrand || BRAND_DEFAULTS.parent_brand}
          </span>
          <span className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-card/40 px-4 py-1.5">
            <span className="text-[12px] uppercase tracking-[0.18em] text-muted-foreground">Developed by</span>
            <span
              className="bg-gradient-brand bg-clip-text font-display text-base font-bold text-transparent"
              style={{ filter: "drop-shadow(0 0 8px hsl(265 84% 62% / 0.55))" }}
            >
              {developerName || BRAND_DEFAULTS.developer_name}
            </span>
          </span>
        </div>
      </div>

      <div className="mt-6 flex justify-end gap-2">
        <Button variant="outline" onClick={onReset} disabled={saving}>Reset to defaults</Button>
        <Button onClick={onSave} disabled={saving} className="bg-gradient-brand text-primary-foreground shadow-glow hover:opacity-90">
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          Save & broadcast
        </Button>
      </div>
    </Card>
  );
};

export default BrandSettingsManager;