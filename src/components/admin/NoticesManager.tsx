import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Megaphone, AlertTriangle, CheckCircle2, Loader2, Plus, Pin, Trash2,
  Users, ShoppingBag, Pencil, TimerOff, RotateCcw, X,
} from "lucide-react";
import { toast } from "sonner";

type Audience = "all" | "buyer" | "seller";
type Severity = "info" | "warning" | "success";
interface Notice {
  id: string; audience: Audience; severity: Severity;
  title: string; body: string; pinned: boolean; is_active: boolean;
  expires_at: string | null; created_at: string;
}

const SEV_CLASS: Record<Severity, string> = {
  info: "bg-primary/20 text-primary",
  warning: "bg-warning/20 text-warning",
  success: "bg-success/20 text-success",
};
const PREVIEW_TONE: Record<Severity, string> = {
  info: "border-primary/40 bg-primary/5",
  warning: "border-warning/40 bg-warning/5",
  success: "border-success/40 bg-success/5",
};
const PREVIEW_FG: Record<Severity, string> = {
  info: "text-primary", warning: "text-warning", success: "text-success",
};
const PREVIEW_ICON: Record<Severity, any> = {
  info: Megaphone, warning: AlertTriangle, success: CheckCircle2,
};
const AUD_ICON: Record<Audience, any> = { all: Megaphone, buyer: ShoppingBag, seller: Users };

const toLocalInput = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  const off = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - off).toISOString().slice(0, 16);
};

const emptyForm = {
  audience: "buyer" as Audience,
  severity: "info" as Severity,
  title: "",
  body: "",
  pinned: false,
  is_active: true,
  expiresAt: "",
};

export const NoticesManager = () => {
  const [tab, setTab] = useState<Audience | "all_view">("all_view");
  const [list, setList] = useState<Notice[]>([]);
  const [loading, setLoading] = useState(true);

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Notice | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const audParam = tab === "all_view" ? undefined : { audience: tab };
      const r = await api.get<{ notices: Notice[] }>("/api/notices/admin", audParam);
      setList(r.notices ?? []);
    } catch (e: any) { toast.error(e?.message || "Failed"); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [tab]);

  const openCreate = () => {
    setEditing(null);
    setForm({ ...emptyForm, audience: tab === "all_view" ? "buyer" : (tab as Audience) });
    setOpen(true);
  };
  const openEdit = (n: Notice) => {
    setEditing(n);
    setForm({
      audience: n.audience, severity: n.severity,
      title: n.title, body: n.body, pinned: n.pinned,
      is_active: n.is_active, expiresAt: toLocalInput(n.expires_at),
    });
    setOpen(true);
  };

  const save = async () => {
    if (form.title.trim().length < 2 || form.body.trim().length < 2) {
      toast.error("Title and body are required"); return;
    }
    setSaving(true);
    try {
      const payload = {
        audience: form.audience, severity: form.severity,
        title: form.title.trim(), body: form.body.trim(),
        pinned: form.pinned, is_active: form.is_active,
        expires_at: form.expiresAt ? new Date(form.expiresAt).toISOString() : null,
      };
      if (editing) {
        await api.patch(`/api/notices/admin/${editing.id}`, payload);
        toast.success("Notice updated");
      } else {
        await api.post("/api/notices/admin", payload);
        toast.success("Notice published");
      }
      setOpen(false);
      load();
    } catch (e: any) { toast.error(e?.message || "Failed"); }
    finally { setSaving(false); }
  };

  const toggle = async (n: Notice, field: "is_active" | "pinned", value: boolean) => {
    try {
      await api.patch(`/api/notices/admin/${n.id}`, { [field]: value });
      load();
    } catch (e: any) { toast.error(e?.message || "Failed"); }
  };
  const expireNow = async (n: Notice) => {
    if (!confirm("Expire this notice immediately? It will be hidden from users.")) return;
    try {
      await api.post(`/api/notices/admin/${n.id}/expire`, {});
      toast.success("Notice expired");
      load();
    } catch (e: any) { toast.error(e?.message || "Failed"); }
  };
  const reactivate = async (n: Notice) => {
    try {
      await api.post(`/api/notices/admin/${n.id}/activate`, {});
      toast.success("Notice reactivated");
      load();
    } catch (e: any) { toast.error(e?.message || "Failed"); }
  };
  const remove = async (id: string) => {
    if (!confirm("Delete this notice?")) return;
    try {
      await api.del(`/api/notices/admin/${id}`);
      toast.success("Deleted");
      load();
    } catch (e: any) { toast.error(e?.message || "Failed"); }
  };

  const PreviewIcon = PREVIEW_ICON[form.severity];
  const expiredPreview = useMemo(() => {
    if (!form.expiresAt) return false;
    return new Date(form.expiresAt).getTime() <= Date.now();
  }, [form.expiresAt]);

  return (
    <Card className="border-border/60 bg-gradient-card p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Megaphone className="h-5 w-5 text-primary" />
          <h3 className="font-display text-lg font-semibold">Notices</h3>
          <p className="ml-3 hidden text-xs text-muted-foreground sm:block">
            Standing announcements shown on buyer and seller dashboards.
          </p>
        </div>
        <Button size="sm" className="bg-gradient-brand text-primary-foreground" onClick={openCreate}>
          <Plus className="mr-1 h-4 w-4" /> New notice
        </Button>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
        <TabsList>
          <TabsTrigger value="all_view">All</TabsTrigger>
          <TabsTrigger value="buyer">Buyers</TabsTrigger>
          <TabsTrigger value="seller">Sellers</TabsTrigger>
          <TabsTrigger value="all">Everyone</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="mt-4">
        {loading ? (
          <div className="flex h-24 items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          </div>
        ) : list.length === 0 ? (
          <p className="rounded-md border border-dashed border-border/60 p-4 text-center text-sm text-muted-foreground">
            No notices.
          </p>
        ) : (
          <ul className="divide-y divide-border/60">
            {list.map((n) => {
              const AudIcon = AUD_ICON[n.audience];
              const expired = !!n.expires_at && new Date(n.expires_at).getTime() <= Date.now();
              return (
                <li key={n.id} className="flex flex-wrap items-start gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge className={SEV_CLASS[n.severity]}>{n.severity}</Badge>
                      <span className="inline-flex items-center gap-1 rounded-full border border-border/60 px-2 py-0.5 text-[10px] uppercase tracking-widest text-muted-foreground">
                        <AudIcon className="h-3 w-3" /> {n.audience}
                      </span>
                      {n.pinned && <Pin className="h-3 w-3 text-primary" />}
                      {expired && <Badge variant="outline" className="text-[10px] text-muted-foreground">expired</Badge>}
                      {!n.is_active && <Badge variant="outline" className="text-[10px] text-muted-foreground">inactive</Badge>}
                      <span className="text-sm font-medium">{n.title}</span>
                    </div>
                    <div className="mt-1 line-clamp-2 text-xs text-muted-foreground">{n.body}</div>
                    <div className="mt-1 text-[10px] text-muted-foreground">
                      {new Date(n.created_at).toLocaleString()}
                      {n.expires_at && ` · expires ${new Date(n.expires_at).toLocaleString()}`}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                      Pin
                      <Switch checked={n.pinned} onCheckedChange={(v) => toggle(n, "pinned", v)} />
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => openEdit(n)}>
                      <Pencil className="mr-1 h-3.5 w-3.5" /> Edit
                    </Button>
                    {expired || !n.is_active ? (
                      <Button variant="ghost" size="sm" onClick={() => reactivate(n)}>
                        <RotateCcw className="mr-1 h-3.5 w-3.5" /> Reactivate
                      </Button>
                    ) : (
                      <Button variant="ghost" size="sm" onClick={() => expireNow(n)}>
                        <TimerOff className="mr-1 h-3.5 w-3.5" /> Expire
                      </Button>
                    )}
                    <Button variant="ghost" size="icon" onClick={() => remove(n.id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit notice" : "Create a notice"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-5 md:grid-cols-2">
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs uppercase tracking-widest text-muted-foreground">Audience</label>
                  <Select value={form.audience} onValueChange={(v) => setForm((f) => ({ ...f, audience: v as Audience }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="buyer">Buyers only</SelectItem>
                      <SelectItem value="seller">Sellers only</SelectItem>
                      <SelectItem value="all">Everyone</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="mb-1 block text-xs uppercase tracking-widest text-muted-foreground">Severity</label>
                  <Select value={form.severity} onValueChange={(v) => setForm((f) => ({ ...f, severity: v as Severity }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="info">Info</SelectItem>
                      <SelectItem value="warning">Warning</SelectItem>
                      <SelectItem value="success">Success</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs uppercase tracking-widest text-muted-foreground">Title</label>
                <Input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} maxLength={140} />
              </div>
              <div>
                <label className="mb-1 block text-xs uppercase tracking-widest text-muted-foreground">Body</label>
                <Textarea rows={6} value={form.body} onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))} />
              </div>
              <div>
                <label className="mb-1 block text-xs uppercase tracking-widest text-muted-foreground">Expires (optional)</label>
                <Input type="datetime-local" value={form.expiresAt} onChange={(e) => setForm((f) => ({ ...f, expiresAt: e.target.value }))} />
              </div>
              <div className="flex flex-wrap items-center gap-4">
                <label className="flex items-center gap-2 text-sm">
                  <Switch checked={form.pinned} onCheckedChange={(v) => setForm((f) => ({ ...f, pinned: v }))} />
                  Pin (cannot be dismissed)
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Switch checked={form.is_active} onCheckedChange={(v) => setForm((f) => ({ ...f, is_active: v }))} />
                  Active
                </label>
              </div>
            </div>

            <div>
              <div className="mb-1 text-xs uppercase tracking-widest text-muted-foreground">Live preview</div>
              <div className={`relative flex gap-3 rounded-md border p-3 ${PREVIEW_TONE[form.severity]}`}>
                <PreviewIcon className={`mt-0.5 h-4 w-4 shrink-0 ${PREVIEW_FG[form.severity]}`} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="font-semibold">{form.title || "Notice title"}</div>
                    {form.pinned && (
                      <Badge variant="outline" className="gap-1 text-[10px]">
                        <Pin className="h-3 w-3" /> pinned
                      </Badge>
                    )}
                    <Badge variant="outline" className="text-[10px] uppercase tracking-widest">
                      {form.audience}
                    </Badge>
                  </div>
                  <div className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">
                    {form.body || "Body text appears here. This is exactly how users will see it."}
                  </div>
                </div>
                {!form.pinned && (
                  <div className="absolute right-2 top-2 rounded p-1 text-muted-foreground">
                    <X className="h-3.5 w-3.5" />
                  </div>
                )}
              </div>
              {expiredPreview && (
                <p className="mt-2 text-[11px] text-warning">
                  Expiration is in the past — users will not see this notice.
                </p>
              )}
              {!form.is_active && (
                <p className="mt-1 text-[11px] text-muted-foreground">Marked inactive — hidden from users.</p>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editing ? "Save changes" : "Publish"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
};

export default NoticesManager;
