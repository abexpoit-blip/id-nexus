import { useEffect, useState } from "react";
import { api } from "@/lib/api";
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
    try {
      const data = await api.get<{ default_limit: number; sellers: SellerRow[] }>(
        "/api/admin/seller-limits/full",
      );
      setDefaultLimit(Number(data.default_limit ?? 500));
      setDefaultDraft(String(data.default_limit ?? 500));
      setRows(
        (data.sellers ?? []).map((s: any) => ({
          user_id: s.user_id,
          display_name: s.display_name,
          email: s.email,
          telegram_username: s.telegram_username,
          daily_limit: s.daily_limit ?? null,
          used_today: Number(s.used_today ?? 0),
        })),
      );
    } catch (e: any) { toast.error(e?.message || "Failed"); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const saveDefault = async () => {
    const n = Number(defaultDraft);
    if (!Number.isFinite(n) || n < 0) { toast.error("Invalid number"); return; }
    setSavingDefault(true);
    try {
      await api.put("/api/admin/seller-limits/default", { value: n });
      toast.success("Default limit updated");
      load();
    } catch (e: any) { toast.error(e?.message || "Failed"); }
    finally { setSavingDefault(false); }
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
    try {
      await api.post(`/api/admin/seller-limits/${editing.user_id}`, { daily_limit: n, note: draftNote || null });
      toast.success("Override saved");
      setEditing(null);
      load();
    } catch (e: any) { toast.error(e?.message || "Failed"); }
    finally { setSaving(false); }
  };

  const clearOverride = async (r: SellerRow) => {
    try {
      await api.del(`/api/admin/seller-limits/${r.user_id}`);
      toast.success("Override removed — uses default now");
      load();
    } catch (e: any) { toast.error(e?.message || "Failed"); }
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
                  <TableHead>Contact</TableHead>
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