import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api";
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
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "hidden">("all");
  const [sortBy, setSortBy] = useState<"sort_asc" | "name_asc" | "name_desc" | "newest" | "oldest">("sort_asc");
  const [logoMeta, setLogoMeta] = useState<{
    width: number;
    height: number;
    sizeKb: number;
    type: string;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    setLoading(true);
    try {
      const { brands } = await api.get<{ brands: VpnBrand[] }>("/api/vpn/brands");
      setBrands(brands ?? []);
    } catch (e: any) { toast.error(e?.message || "Failed"); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    load();
  }, []);

  const openNew = () => {
    setForm({ ...emptyForm, sort_order: brands.length });
    setLogoMeta(null);
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
    setLogoMeta(null);
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
    // Read dimensions locally for preview hints
    const dims = await new Promise<{ w: number; h: number } | null>((resolve) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        resolve({ w: img.naturalWidth, h: img.naturalHeight });
        URL.revokeObjectURL(url);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        resolve(null);
      };
      img.src = url;
    });
    try {
      const fd = new FormData();
      fd.append("file", file);
      const { url } = await api.upload<{ url: string }>("/api/uploads/vpn-logo", fd);
      const fullUrl = url.startsWith("http") ? url : `${api.base}${url}`;
      setForm((f) => ({ ...f, logo_url: fullUrl }));
      setLogoMeta({
        width: dims?.w ?? 0,
        height: dims?.h ?? 0,
        sizeKb: Math.round(file.size / 1024),
        type: file.type.replace("image/", "").toUpperCase(),
      });
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
    try {
      await api.post("/api/admin/vpn-brands/upsert", {
        id: form.id || null,
        name: form.name.trim(),
        slug,
        description: form.description.trim() || null,
        logo_url: form.logo_url.trim() || null,
        is_active: form.is_active,
        sort_order: form.sort_order,
      });
      toast.success(form.id ? "Brand updated" : "Brand created");
      setOpen(false);
      setForm(emptyForm);
      load();
    } catch (e: any) { toast.error(e?.message || "Failed"); }
    finally { setSubmitting(false); }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.del(`/api/admin/vpn-brands/${deleteTarget.id}`);
      toast.success(`Deleted ${deleteTarget.name}`);
      setDeleteTarget(null);
      load();
    } catch (e: any) { toast.error(e?.message || "Failed"); }
    finally { setDeleting(false); }
  };

  const toggleActive = async (b: VpnBrand) => {
    setTogglingId(b.id);
    setBrands((prev) => prev.map((x) => (x.id === b.id ? { ...x, is_active: !x.is_active } : x)));
    try {
      await api.post("/api/admin/vpn-brands/upsert", {
        id: b.id, name: b.name, slug: b.slug, description: b.description,
        logo_url: b.logo_url, is_active: !b.is_active, sort_order: b.sort_order,
      });
      toast.success(`${b.name} ${!b.is_active ? "activated" : "hidden"}`);
    } catch (e: any) {
      setBrands((prev) => prev.map((x) => (x.id === b.id ? { ...x, is_active: b.is_active } : x)));
      toast.error(e?.message || "Failed");
    } finally { setTogglingId(null); }
  };

  const filteredBrands = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = brands.filter((b) => {
      if (statusFilter === "active" && !b.is_active) return false;
      if (statusFilter === "hidden" && b.is_active) return false;
      if (!q) return true;
      return (
        b.name.toLowerCase().includes(q) ||
        b.slug.toLowerCase().includes(q) ||
        (b.description ?? "").toLowerCase().includes(q)
      );
    });
    list = [...list].sort((a, b) => {
      switch (sortBy) {
        case "name_asc":
          return a.name.localeCompare(b.name);
        case "name_desc":
          return b.name.localeCompare(a.name);
        case "newest":
          return b.id.localeCompare(a.id);
        case "oldest":
          return a.id.localeCompare(b.id);
        case "sort_asc":
        default:
          return a.sort_order - b.sort_order || a.name.localeCompare(b.name);
      }
    });
    return list;
  }, [brands, search, statusFilter, sortBy]);

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

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, slug, or description…"
            className="pl-9 pr-9"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Clear search"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
          <SelectTrigger className="w-full sm:w-[150px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All status</SelectItem>
            <SelectItem value="active">Active only</SelectItem>
            <SelectItem value="hidden">Hidden only</SelectItem>
          </SelectContent>
        </Select>
        <Select value={sortBy} onValueChange={(v) => setSortBy(v as typeof sortBy)}>
          <SelectTrigger className="w-full sm:w-[180px]">
            <SelectValue placeholder="Sort by" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="sort_asc">Custom order</SelectItem>
            <SelectItem value="name_asc">Name (A → Z)</SelectItem>
            <SelectItem value="name_desc">Name (Z → A)</SelectItem>
            <SelectItem value="newest">Newest first</SelectItem>
            <SelectItem value="oldest">Oldest first</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {!loading && brands.length > 0 && (
        <div className="text-xs text-muted-foreground">
          Showing {filteredBrands.length} of {brands.length} brand{brands.length === 1 ? "" : "s"}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : brands.length === 0 ? (
        <Card className="border-dashed border-border/60 p-8 text-center text-sm text-muted-foreground">
          No VPN brands yet. Create your first brand to get started.
        </Card>
      ) : filteredBrands.length === 0 ? (
        <Card className="border-dashed border-border/60 p-8 text-center text-sm text-muted-foreground">
          No brands match your filters.
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filteredBrands.map((b) => (
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
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/svg+xml"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleUpload(f);
                }}
              />
              <div
                onClick={() => !uploading && fileInputRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const f = e.dataTransfer.files?.[0];
                  if (f) handleUpload(f);
                }}
                className="group relative flex cursor-pointer items-center justify-center overflow-hidden rounded-xl border-2 border-dashed border-border/60 bg-background/40 transition-colors hover:border-primary/50 hover:bg-background/60"
                style={{ minHeight: 200 }}
              >
                {uploading ? (
                  <div className="flex flex-col items-center gap-2 py-10 text-sm text-muted-foreground">
                    <Loader2 className="h-6 w-6 animate-spin" />
                    Uploading…
                  </div>
                ) : form.logo_url ? (
                  <div className="flex w-full items-center justify-center bg-[linear-gradient(45deg,hsl(var(--muted))_25%,transparent_25%),linear-gradient(-45deg,hsl(var(--muted))_25%,transparent_25%),linear-gradient(45deg,transparent_75%,hsl(var(--muted))_75%),linear-gradient(-45deg,transparent_75%,hsl(var(--muted))_75%)] bg-[length:16px_16px] bg-[position:0_0,0_8px,8px_-8px,-8px_0px] p-6">
                    <img
                      src={form.logo_url}
                      alt="logo preview"
                      className="max-h-40 w-auto max-w-full object-contain drop-shadow-lg"
                    />
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2 py-10 text-center text-sm text-muted-foreground">
                    <Upload className="h-7 w-7" />
                    <div className="font-medium">Click or drag to upload</div>
                    <div className="text-[11px]">PNG · JPG · WebP · SVG, max 2 MB</div>
                  </div>
                )}
              </div>

              {form.logo_url && (
                <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground">
                  <div className="flex flex-wrap items-center gap-2">
                    {logoMeta ? (
                      <>
                        <Badge variant="outline" className="font-mono">
                          {logoMeta.width}×{logoMeta.height}px
                        </Badge>
                        <Badge variant="outline" className="font-mono">{logoMeta.sizeKb} KB</Badge>
                        <Badge variant="outline" className="font-mono">{logoMeta.type}</Badge>
                        {logoMeta.width > 0 && logoMeta.height > 0 && (
                          <span>
                            {Math.abs(logoMeta.width / logoMeta.height - 1) < 0.05
                              ? "✓ Square (recommended)"
                              : "Tip: square logos look best on cards"}
                          </span>
                        )}
                      </>
                    ) : (
                      <span>Existing logo · upload to replace</span>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => fileInputRef.current?.click()}
                      className="h-7 px-2 text-xs"
                    >
                      Replace
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setForm((f) => ({ ...f, logo_url: "" }));
                        setLogoMeta(null);
                      }}
                      className="h-7 px-2 text-xs text-destructive hover:text-destructive"
                    >
                      Remove
                    </Button>
                  </div>
                </div>
              )}

              <p className="text-[11px] text-muted-foreground">
                Recommended: 512×512 transparent PNG · max 2 MB · square aspect ratio
              </p>
              <Input
                value={form.logo_url}
                onChange={(e) => {
                  setForm((f) => ({ ...f, logo_url: e.target.value }));
                  setLogoMeta(null);
                }}
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
