import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Loader2, Bell } from "lucide-react";
import { toast } from "sonner";

type Prefs = {
  order_updates: boolean;
  replacement_updates: boolean;
  payouts: boolean;
  announcements: boolean;
  messages: boolean;
};
const DEFAULTS: Prefs = {
  order_updates: true, replacement_updates: true, payouts: true, announcements: true, messages: true,
};

export const NotificationPrefsPanel = () => {
  const { profile, refresh } = useAuth();
  const [prefs, setPrefs] = useState<Prefs>(DEFAULTS);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const np = (profile?.buyer_settings as any)?.notification_prefs;
    if (np && typeof np === "object") setPrefs({ ...DEFAULTS, ...np });
  }, [profile]);

  const save = async () => {
    setSaving(true);
    try {
      const next = { ...(profile?.buyer_settings as any || {}), notification_prefs: prefs };
      await api.patch("/api/profiles/me", { buyer_settings: next });
      await refresh();
      toast.success("Preferences saved");
    } catch (e: any) { toast.error(e?.message || "Failed"); }
    finally { setSaving(false); }
  };

  const row = (k: keyof Prefs, label: string, desc: string) => (
    <div className="flex items-start justify-between gap-4 border-b border-border/60 py-3 last:border-0">
      <div className="min-w-0">
        <div className="font-medium">{label}</div>
        <div className="text-xs text-muted-foreground">{desc}</div>
      </div>
      <Switch checked={prefs[k]} onCheckedChange={(v) => setPrefs((p) => ({ ...p, [k]: v }))} />
    </div>
  );

  return (
    <Card className="border-border/60 bg-gradient-card p-5">
      <div className="mb-2 flex items-center gap-2">
        <Bell className="h-5 w-5 text-primary" />
        <h3 className="font-display text-lg font-semibold">Notification preferences</h3>
      </div>
      <p className="mb-2 text-xs text-muted-foreground">
        Choose which alerts appear in your bell. You'll always see security-critical messages.
      </p>
      <div>
        {row("order_updates", "Order updates", "Delivery, completion, cancellations")}
        {row("replacement_updates", "Replacement updates", "Resolutions, refunds, rejections")}
        {row("payouts", "Payouts & wallet", "Top-ups, withdrawals, balance changes")}
        {row("messages", "Direct messages", "Replies from admin to your thread")}
        {row("announcements", "Announcements", "Platform news and broadcasts")}
      </div>
      <div className="mt-4 flex justify-end">
        <Button onClick={save} disabled={saving} className="bg-gradient-brand text-primary-foreground">
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Save preferences
        </Button>
      </div>
    </Card>
  );
};

export default NotificationPrefsPanel;