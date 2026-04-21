import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Loader2, Pencil, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";

interface SellerRow {
  user_id: string;
  display_name: string | null;
  email: string | null;
  telegram_username: string | null;
  daily_limit: number | null;     // null => uses default
  used_today: number;
}

export const SellerLimitsManager = () => {
  const [defaultLimit, setDefaultLimit] = useState<number>(500);
  const [defaultDraft, setDefaultDraft] = useState<string>("500");
  const [savingDefault, setSavingDefault] = useState(false);
  const [rows, setRows] = useState<SellerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<SellerRow | null>(null);
  const [draftLimit, setDraftLimit] = useState("");
  const [draftNote, setDraftNote] = useState("");
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);

    const [
      { data: setting },
      { data: sellerRoles },
      { data: limits },
    ] = await Promise.all([
      supabase.from("app_settings").select("value").eq("key", "default_seller_daily_limit").maybeSingle(),
      supabase.from("user_roles").select("user_id").eq("role", "seller"),
      supabase.from("seller_daily_limits").select("seller_id, daily_limit, note"),
    ]);

    const defLimit = setting ? Number(setting.value) : 500;
    setDefaultLimit(defLimit);
    setDefaultDraft(String(defLimit));

    const sellerIds = (sellerRoles ?? []).map((r) => r.user_id as string);
    if (sellerIds.length === 0) { setRows([]); setLoading(false); return; }

    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, display_name, email, telegram_username")
      .in("id", sellerIds);

    const limitMap = new Map<string, number>();
    (limits ?? []).forEach((l: any) => limitMap.set(l.seller_id, l.daily_limit));

    // Compute used_today per seller
    const startOfDay = new Date();
    startOfDay.setUTCHours(0, 0, 0, 0);
    const { data: todays } = await supabase
      .from("accounts")
      .select("seller_id")
      .in("seller_id", sellerIds)
      .gte("created_at", startOfDay.toISOString());
    const usedMap = new Map<string, number>();
    (todays ?? []).forEach((r: any) => usedMap.set(r.seller_id, (usedMap.get(r.seller_id) ?? 0) + 1));

    const merged: SellerRow[] = (profiles ?? []).map((p: any) => ({
      user_id: p.id,
      display_name: p.display_name,
      email: p.email,
      telegram_username: p.telegram_username,
      daily_limit: limitMap.has(p.id) ? (limitMap.get(p.id) as number) : null,
      used_today: usedMap.get(p.id) ?? 0,
    }));

    setRows(merged);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const saveDefault = async () => {
    const n = Number(defaultDraft);
    if (!Number.isFinite(n) || n < 0) { toast.error("Invalid number"); return; }
    setSavingDefault(true);
    const { error } = await supabase.rpc("admin_set_default_daily_limit", { p_limit: n });
    setSavingDefault(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Default limit updated");
    load();
  };

  const openEdit = (r: SellerRow) => {
    setEditing(r);
    setDraftLimit(String(r.daily_limit ?? defaultLimit));
    setDraftNote("");
  };

  const saveLimit = async () => {
    if (!editing) return;
    const n = Number(draftLimit);
    if (!Number.isFinite(n) || n < 0) { toast.error("Invalid limit"); return; }
    setSaving(true);
    const { error } = await supabase.rpc("admin_set_seller_limit", {
      p_seller_id: editing.user_id, p_daily_limit: n, p_note: draftNote || null,
    });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Override saved");
    setEditing(null);
    load();
  };

  const clearOverride = async (r: SellerRow) => {
    const { error } = await supabase.rpc("admin_clear_seller_limit", { p_seller_id: r.user_id });
    if (error) toast.error(error.message);
    else { toast.success("Override removed — uses default now"); load(); }
  };

  return (
    <div className="space-y-6">
      <Card className="border-border/60 bg-gradient-card p-6">
        <div className="font-display text-lg font-semibold">Global default daily limit</div>
        <p className="text-xs text-muted-foreground">Applies to every seller unless overridden. Counts all uploaded IDs across categories per UTC day.</p>
        <div className="mt-4 flex max-w-sm items-center gap-2">
          <Input type="number" min={0} value={defaultDraft} onChange={(e) => setDefaultDraft(e.target.value)} />
          <Button onClick={saveDefault} disabled={savingDefault} className="bg-gradient-brand text-primary-foreground hover:opacity-90">
            {savingDefault ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          </Button>
        </div>
      </Card>

      <Card className="border-border/60 bg-gradient-card p-6">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <div className="font-display text-lg font-semibold">Seller-specific limits</div>
            <p className="text-xs text-muted-foreground">Override the default for a specific seller. "Default" means they use the global value.</p>
          </div>
        </div>
        {loading ? (
          <div className="flex h-32 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Seller</TableHead>
                  <TableHead>Telegram</TableHead>
                  <TableHead className="text-right">Used today</TableHead>
                  <TableHead className="text-right">Daily limit</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => {
                  const effective = r.daily_limit ?? defaultLimit;
                  const remaining = Math.max(effective - r.used_today, 0);
                  return (
                    <TableRow key={r.user_id}>
                      <TableCell>
                        <div className="font-medium">{r.display_name ?? "—"}</div>
                        <div className="text-xs text-muted-foreground">{r.email}</div>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{r.telegram_username ? "@" + r.telegram_username : "—"}</TableCell>
                      <TableCell className="text-right font-mono">
                        {r.used_today} <span className="text-xs text-muted-foreground">/ {effective}</span>
                        <div className="text-xs text-muted-foreground">{remaining} left</div>
                      </TableCell>
                      <TableCell className="text-right">
                        {r.daily_limit !== null ? (
                          <Badge className="bg-primary/15 text-primary">{r.daily_limit}</Badge>
                        ) : (
                          <Badge variant="outline" className="text-muted-foreground">default ({defaultLimit})</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="inline-flex gap-1">
                          <Button size="sm" variant="outline" onClick={() => openEdit(r)}>
                            <Pencil className="mr-1 h-3 w-3" /> Edit
                          </Button>
                          {r.daily_limit !== null && (
                            <Button size="sm" variant="outline" className="border-destructive/40 text-destructive hover:text-destructive"
                              onClick={() => clearOverride(r)}>
                              <Trash2 className="mr-1 h-3 w-3" /> Clear
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {rows.length === 0 && (
                  <TableRow><TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">No sellers yet</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit limit — {editing?.display_name ?? editing?.email}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div>
              <label className="text-xs font-medium">Daily limit (across all categories)</label>
              <Input type="number" min={0} value={draftLimit} onChange={(e) => setDraftLimit(e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-medium">Note (optional)</label>
              <Input value={draftNote} onChange={(e) => setDraftNote(e.target.value)} maxLength={200} placeholder="e.g. trusted seller" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditing(null)} disabled={saving}>Cancel</Button>
            <Button onClick={saveLimit} disabled={saving} className="bg-gradient-brand text-primary-foreground hover:opacity-90">
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};