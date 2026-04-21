import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Loader2, Plus, Pencil } from "lucide-react";
import { toast } from "sonner";

interface Category {
  id: string;
  name: string;
  slug: string;
  kind: "fb_account" | "vpn";
  price_bdt: number;
  description: string | null;
  is_active: boolean;
  sort_order: number;
}

const empty: Partial<Category> = {
  name: "",
  slug: "",
  kind: "fb_account",
  price_bdt: 0,
  description: "",
  is_active: true,
  sort_order: 0,
};

export const CategoriesManager = () => {
  const [rows, setRows] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Partial<Category> | null>(null);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("categories")
      .select("*")
      .order("sort_order");
    if (error) toast.error(error.message);
    setRows((data ?? []) as Category[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const save = async () => {
    if (!editing) return;
    setSaving(true);
    const { error } = await supabase.rpc("admin_upsert_category", {
      p_id: (editing.id as string) ?? null,
      p_name: editing.name ?? "",
      p_slug: editing.slug ?? "",
      p_kind: (editing.kind ?? "fb_account") as "fb_account" | "vpn",
      p_price_bdt: Number(editing.price_bdt ?? 0),
      p_description: editing.description ?? null,
      p_is_active: editing.is_active ?? true,
      p_sort_order: Number(editing.sort_order ?? 0),
    });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success(editing.id ? "Category updated" : "Category created");
    setEditing(null);
    load();
  };

  const toggleActive = async (c: Category) => {
    const { error } = await supabase.rpc("admin_upsert_category", {
      p_id: c.id,
      p_name: c.name,
      p_slug: c.slug,
      p_kind: c.kind,
      p_price_bdt: c.price_bdt,
      p_description: c.description,
      p_is_active: !c.is_active,
      p_sort_order: c.sort_order,
    });
    if (error) toast.error(error.message);
    else { toast.success(c.is_active ? "Hidden" : "Activated"); load(); }
  };

  return (
    <Card className="border-border/60 bg-gradient-card p-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <div className="font-display text-lg font-semibold">Categories & pricing</div>
          <p className="text-xs text-muted-foreground">Create, edit price, hide/show categories.</p>
        </div>
        <Button onClick={() => setEditing({ ...empty })} className="bg-gradient-brand text-primary-foreground hover:opacity-90">
          <Plus className="mr-2 h-4 w-4" /> New category
        </Button>
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
                <TableHead>Name</TableHead>
                <TableHead>Slug</TableHead>
                <TableHead>Kind</TableHead>
                <TableHead className="text-right">Price (৳)</TableHead>
                <TableHead className="text-right">Order</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.name}</TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">{c.slug}</TableCell>
                  <TableCell><Badge variant="outline">{c.kind}</Badge></TableCell>
                  <TableCell className="text-right font-display font-semibold">{Number(c.price_bdt).toFixed(0)}</TableCell>
                  <TableCell className="text-right text-xs text-muted-foreground">{c.sort_order}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Switch checked={c.is_active} onCheckedChange={() => toggleActive(c)} />
                      <span className="text-xs text-muted-foreground">{c.is_active ? "Active" : "Hidden"}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="outline" onClick={() => setEditing(c)}>
                      <Pencil className="mr-1 h-3 w-3" /> Edit
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {rows.length === 0 && (
                <TableRow><TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">No categories yet</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing?.id ? "Edit category" : "New category"}</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="grid gap-3">
              <div>
                <label className="text-xs font-medium">Name</label>
                <Input value={editing.name ?? ""} onChange={(e) => setEditing({ ...editing, name: e.target.value })} maxLength={80} />
              </div>
              <div>
                <label className="text-xs font-medium">Slug (lowercase, no spaces)</label>
                <Input value={editing.slug ?? ""} onChange={(e) => setEditing({ ...editing, slug: e.target.value.toLowerCase().replace(/\s+/g, "-") })} maxLength={80} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium">Kind</label>
                  <Select value={editing.kind ?? "fb_account"} onValueChange={(v) => setEditing({ ...editing, kind: v as "fb_account" | "vpn" })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="fb_account">FB account</SelectItem>
                      <SelectItem value="vpn">VPN</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs font-medium">Price (৳)</label>
                  <Input type="number" min={0} step={1} value={editing.price_bdt ?? 0}
                    onChange={(e) => setEditing({ ...editing, price_bdt: Number(e.target.value) })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium">Sort order</label>
                  <Input type="number" value={editing.sort_order ?? 0}
                    onChange={(e) => setEditing({ ...editing, sort_order: Number(e.target.value) })} />
                </div>
                <div className="flex items-end gap-2">
                  <Switch checked={editing.is_active ?? true}
                    onCheckedChange={(v) => setEditing({ ...editing, is_active: v })} />
                  <span className="text-sm">Active</span>
                </div>
              </div>
              <div>
                <label className="text-xs font-medium">Description (optional)</label>
                <Input value={editing.description ?? ""}
                  onChange={(e) => setEditing({ ...editing, description: e.target.value })} maxLength={300} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditing(null)} disabled={saving}>Cancel</Button>
            <Button onClick={save} disabled={saving} className="bg-gradient-brand text-primary-foreground hover:opacity-90">
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
};