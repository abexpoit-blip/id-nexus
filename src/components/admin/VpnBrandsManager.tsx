import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2, Plus, Pencil, Trash2, Upload, Image as ImageIcon, Search, X } from "lucide-react";
import { toast } from "sonner";

interface VpnBrand {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  logo_url: string | null;
  is_active: boolean;
  sort_order: number;
}

const slugify = (s: string) =>
  s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const emptyForm = {
  id: "",
  name: "",
  slug: "",
  description: "",
  logo_url: "",
  is_active: true,
  sort_order: 0,
};

export const VpnBrandsManager = () => {
  const [brands, setBrands] = useState<VpnBrand[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<VpnBrand | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("vpn_brands")
      .select("id, name, slug, description, logo_url, is_active, sort_order")
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });
    if (error) toast.error(error.message);
    setBrands((data ?? []) as VpnBrand[]);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const openNew = () => {
    setForm({ ...emptyForm, sort_order: brands.length });
    setOpen(true);
  };

  const openEdit = (b: VpnBrand) => {
    setForm({
      id: b.id,
      name: b.name,
      slug: b.slug,
      description: b.description ?? "",
      logo_url: b.logo_url ?? "",
      is_active: b.is_active,
      sort_order: b.sort_order,
    });
    setOpen(true);
  };

  const handleUpload = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error("Please upload an image file");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error("Logo must be under 2 MB");
      return;
    }
    setUploading(true);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() || "png";
      const baseSlug = slugify(form.slug || form.name || "brand") || "brand";
      const path = `${baseSlug}-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("vpn-logos")
        .upload(path, file, { upsert: true, contentType: file.type });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from("vpn-logos").getPublicUrl(path);
      setForm((f) => ({ ...f, logo_url: pub.publicUrl }));
      toast.success("Logo uploaded");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const save = async () => {
    if (!form.name.trim()) {
      toast.error("Name is required");
      return;
    }
    const slug = slugify(form.slug || form.name);
    if (!slug) {
      toast.error("Valid slug is required");
      return;
    }
    setSubmitting(true);
    const { error } = await supabase.rpc("admin_upsert_vpn_brand", {
      p_id: form.id || null,
      p_name: form.name.trim(),
      p_slug: slug,
      p_description: form.description.trim() || null,
      p_logo_url: form.logo_url.trim() || null,
      p_is_active: form.is_active,
      p_sort_order: form.sort_order,
    });
    setSubmitting(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(form.id ? "Brand updated" : "Brand created");
    setOpen(false);
    setForm(emptyForm);
    load();
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    const { error } = await supabase.rpc("admin_delete_vpn_brand", { p_id: deleteTarget.id });
    setDeleting(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`Deleted ${deleteTarget.name}`);
    setDeleteTarget(null);
    load();
  };

  const toggleActive = async (b: VpnBrand) => {
    setTogglingId(b.id);
    setBrands((prev) => prev.map((x) => (x.id === b.id ? { ...x, is_active: !x.is_active } : x)));
    const { error } = await supabase.rpc("admin_upsert_vpn_brand", {
      p_id: b.id,
      p_name: b.name,
      p_slug: b.slug,
      p_description: b.description,
      p_logo_url: b.logo_url,
      p_is_active: !b.is_active,
      p_sort_order: b.sort_order,
    });
    setTogglingId(null);
    if (error) {
      setBrands((prev) => prev.map((x) => (x.id === b.id ? { ...x, is_active: b.is_active } : x)));
      toast.error(error.message);
      return;
    }
    toast.success(`${b.name} ${!b.is_active ? "activated" : "hidden"}`);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-bold">VPN Brands</h2>
          <p className="text-sm text-muted-foreground">
            Manage brand logos shown on the public /vpn page. Categories link to brands via the Categories tab.
          </p>
        </div>
        <Button onClick={openNew} className="gap-2">
          <Plus className="h-4 w-4" /> New brand
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : brands.length === 0 ? (
        <Card className="border-dashed border-border/60 p-8 text-center text-sm text-muted-foreground">
          No VPN brands yet. Create your first brand to get started.
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {brands.map((b) => (
            <Card key={b.id} className="border-border/60 bg-gradient-card p-4">
              <div className="flex items-start gap-3">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border/60 bg-background">
                  {b.logo_url ? (
                    <img src={b.logo_url} alt={b.name} className="h-full w-full object-contain" />
                  ) : (
                    <ImageIcon className="h-6 w-6 text-muted-foreground" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="truncate font-semibold">{b.name}</h3>
                    <Badge variant={b.is_active ? "default" : "secondary"} className="text-[10px]">
                      {b.is_active ? "Active" : "Hidden"}
                    </Badge>
                  </div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    /{b.slug} · order {b.sort_order}
                  </div>
                  {b.description && (
                    <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{b.description}</p>
                  )}
                </div>
              </div>
              <div className="mt-3 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Switch
                    checked={b.is_active}
                    disabled={togglingId === b.id}
                    onCheckedChange={() => toggleActive(b)}
                    aria-label={`Toggle ${b.name}`}
                  />
                  <span className="text-xs text-muted-foreground">
                    {togglingId === b.id ? "Saving…" : b.is_active ? "On" : "Off"}
                  </span>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => openEdit(b)} className="gap-1">
                    <Pencil className="h-3.5 w-3.5" /> Edit
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setDeleteTarget(b)}
                    className="gap-1 text-destructive hover:text-destructive"
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Delete
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{form.id ? "Edit VPN brand" : "New VPN brand"}</DialogTitle>
            <DialogDescription>
              Brands group VPN duration variants (7/15/30 days) on the public catalog.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid gap-2">
              <Label htmlFor="brand-name">Name *</Label>
              <Input
                id="brand-name"
                value={form.name}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    name: e.target.value,
                    slug: f.id ? f.slug : slugify(e.target.value),
                  }))
                }
                placeholder="NordVPN"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="brand-slug">Slug *</Label>
              <Input
                id="brand-slug"
                value={form.slug}
                onChange={(e) => setForm((f) => ({ ...f, slug: slugify(e.target.value) }))}
                placeholder="nordvpn"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="brand-desc">Description</Label>
              <Textarea
                id="brand-desc"
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                rows={2}
                placeholder="Premium VPN with global servers"
              />
            </div>

            <div className="grid gap-2">
              <Label>Logo</Label>
              <div className="flex items-center gap-3">
                <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border/60 bg-background">
                  {form.logo_url ? (
                    <img src={form.logo_url} alt="logo" className="h-full w-full object-contain" />
                  ) : (
                    <ImageIcon className="h-6 w-6 text-muted-foreground" />
                  )}
                </div>
                <div className="flex-1 space-y-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleUpload(f);
                    }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    className="gap-2"
                  >
                    {uploading ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Upload className="h-3.5 w-3.5" />
                    )}
                    {uploading ? "Uploading…" : "Upload logo"}
                  </Button>
                  <p className="text-[11px] text-muted-foreground">PNG/JPG/WebP, max 2 MB</p>
                </div>
              </div>
              <Input
                value={form.logo_url}
                onChange={(e) => setForm((f) => ({ ...f, logo_url: e.target.value }))}
                placeholder="…or paste a logo URL"
                className="text-xs"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label htmlFor="brand-sort">Sort order</Label>
                <Input
                  id="brand-sort"
                  type="number"
                  value={form.sort_order}
                  onChange={(e) => setForm((f) => ({ ...f, sort_order: Number(e.target.value) || 0 }))}
                />
              </div>
              <div className="flex items-end gap-3">
                <div className="flex items-center gap-2">
                  <Switch
                    id="brand-active"
                    checked={form.is_active}
                    onCheckedChange={(v) => setForm((f) => ({ ...f, is_active: v }))}
                  />
                  <Label htmlFor="brand-active" className="cursor-pointer">
                    Active
                  </Label>
                </div>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button onClick={save} disabled={submitting || uploading}>
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {form.id ? "Save changes" : "Create brand"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteTarget} onOpenChange={(v) => !v && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete brand?</DialogTitle>
            <DialogDescription>
              This will remove <strong>{deleteTarget?.name}</strong>. Any categories linked to this brand will keep
              working but lose their brand grouping. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteTarget(null)} disabled={deleting}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmDelete} disabled={deleting}>
              {deleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default VpnBrandsManager;
