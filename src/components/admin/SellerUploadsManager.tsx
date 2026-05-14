import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, CheckCircle2, XCircle, Clock, Eye } from "lucide-react";
import { toast } from "sonner";
import { UploadStatusProgress } from "@/components/seller/SellerWalletCard";

type Tab = "pending" | "approved" | "rejected";

interface UploadRow {
  id: string;
  seller_id: string;
  seller_email: string;
  seller_name: string | null;
  category_id: string | null;
  category_name: string | null;
  file_name: string | null;
  rows_in_file: number;
  rows_inserted: number;
  rejected_count: number;
  accepted_count: number;
  unit_price_bdt: number | null;
  payout_bdt: number;
  review_status: Tab;
  review_note: string | null;
  reviewed_at: string | null;
  collected_at?: string | null;
  created_at: string;
}

interface UploadDetail extends UploadRow {
  rejected_uids: string[];
}

export const SellerUploadsManager = () => {
  const [tab, setTab] = useState<Tab>("pending");
  const [rows, setRows] = useState<UploadRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState<UploadDetail | null>(null);
  const [uploadUids, setUploadUids] = useState<{ uid: string; status: string }[]>([]);
  const [rejectedText, setRejectedText] = useState("");
  const [unitPrice, setUnitPrice] = useState<string>("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const { uploads } = await api.get<{ uploads: UploadRow[] }>(
        `/api/admin/seller-uploads?status=${tab}`
      );
      setRows(uploads);
    } catch (e: any) {
      toast.error(e?.message || "Failed to load uploads");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [tab]);

  const openReview = async (row: UploadRow) => {
    try {
      const { upload, uids } = await api.get<{
        upload: UploadDetail; uids: { uid: string; status: string }[];
      }>(`/api/admin/seller-uploads/${row.id}`);
      setActive(upload);
      setUploadUids(uids || []);
      setRejectedText((upload.rejected_uids || []).join("\n"));
      setUnitPrice(upload.unit_price_bdt != null ? String(upload.unit_price_bdt) : "");
      setNote(upload.review_note || "");
      // Auto-mark as collected on first open while still pending
      if (upload.review_status === "pending" && !upload.collected_at) {
        api.post(`/api/admin/seller-uploads/${row.id}/collect`, {}).then(() => load()).catch(() => {});
      }
    } catch (e: any) {
      toast.error(e?.message || "Failed to load upload");
    }
  };

  const parsedRejected = useMemo(
    () => rejectedText.split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean),
    [rejectedText]
  );

  const insertedCount = active?.rows_inserted ?? 0;
  const acceptedPreview = Math.max(insertedCount - parsedRejected.length, 0);
  const pricePreview = Number(unitPrice || active?.unit_price_bdt || 0);
  const payoutPreview = (acceptedPreview * pricePreview).toFixed(2);

  const submit = async () => {
    if (!active) return;
    setSubmitting(true);
    try {
      const res = await api.post<{
        ok: boolean; payout_bdt: number; accepted_count: number; rejected_count: number;
      }>(`/api/admin/seller-uploads/${active.id}/review`, {
        rejected_uids: parsedRejected,
        note: note || null,
        unit_price_bdt: unitPrice ? Number(unitPrice) : null,
      });
      toast.success(
        `Reviewed: ${res.accepted_count} accepted, ${res.rejected_count} rejected. Payout +${res.payout_bdt} BDT`
      );
      setActive(null);
      load();
    } catch (e: any) {
      toast.error(e?.message || "Review failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card className="border-border/60 bg-gradient-card p-4">
        <h2 className="font-display text-xl font-semibold">Seller uploads — review &amp; payout</h2>
        <p className="text-sm text-muted-foreground">
          Mark bad UIDs from a seller batch. The seller is auto-credited for the remaining accepted UIDs at the category price.
        </p>
      </Card>

      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
        <TabsList>
          <TabsTrigger value="pending"><Clock className="mr-1 h-4 w-4" />Pending</TabsTrigger>
          <TabsTrigger value="approved"><CheckCircle2 className="mr-1 h-4 w-4" />Approved</TabsTrigger>
          <TabsTrigger value="rejected"><XCircle className="mr-1 h-4 w-4" />Rejected</TabsTrigger>
        </TabsList>
      </Tabs>

      <Card className="border-border/60 bg-card/40">
        {loading ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : rows.length === 0 ? (
          <div className="py-12 text-center text-sm text-muted-foreground">No {tab} uploads.</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Seller</TableHead>
                <TableHead>Category</TableHead>
                <TableHead className="min-w-[230px]">Status</TableHead>
                <TableHead className="text-right">Inserted</TableHead>
                <TableHead className="text-right">Rejected</TableHead>
                <TableHead className="text-right">Payout (৳)</TableHead>
                <TableHead>Uploaded</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>
                    <div className="font-medium">{r.seller_name || r.seller_email}</div>
                    <div className="text-xs text-muted-foreground">{r.seller_email}</div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{r.category_name || "—"}</Badge>
                  </TableCell>
                  <TableCell>
                    <UploadStatusProgress audit={r} compact />
                  </TableCell>
                  <TableCell className="text-right">{r.rows_inserted}</TableCell>
                  <TableCell className="text-right text-destructive">
                    {r.rejected_count > 0 ? r.rejected_count : "—"}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {r.review_status === "pending" ? "—" : Number(r.payout_bdt).toFixed(2)}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {new Date(r.created_at).toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="outline" onClick={() => openReview(r)}>
                      <Eye className="mr-1 h-4 w-4" />
                      {r.review_status === "pending" ? "Review" : "View"}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      <Dialog open={!!active} onOpenChange={(o) => !o && setActive(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Review upload</DialogTitle>
            <DialogDescription>
              Paste the UIDs you are rejecting (one per line). Seller will be credited for the rest.
            </DialogDescription>
          </DialogHeader>

          {active && (
            <div className="space-y-4">
              <div className="rounded-lg border border-border/60 bg-card/40 p-3">
                <UploadStatusProgress audit={active} />
              </div>
              <div className="grid grid-cols-2 gap-3 rounded-lg border border-border/60 p-3 text-sm">
                <div>
                  <div className="text-xs text-muted-foreground">Seller</div>
                  <div className="font-medium">{active.seller_name || active.seller_email}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Category</div>
                  <div className="font-medium">{active.category_name || "—"}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Inserted</div>
                  <div className="font-mono">{insertedCount}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">In file</div>
                  <div className="font-mono">{active.rows_in_file}</div>
                </div>
              </div>

              <div>
                <label className="text-sm font-medium">Unit price (৳ per accepted UID)</label>
                <Input
                  value={unitPrice}
                  onChange={(e) => setUnitPrice(e.target.value)}
                  placeholder="auto from category"
                  disabled={active.review_status !== "pending"}
                />
              </div>

              <div>
                <label className="text-sm font-medium">
                  Rejected UIDs ({parsedRejected.length})
                </label>
                <Textarea
                  rows={6}
                  value={rejectedText}
                  onChange={(e) => setRejectedText(e.target.value)}
                  placeholder={"61xxxxxxxxxx\n61xxxxxxxxxx\n…"}
                  disabled={active.review_status !== "pending"}
                  className="font-mono text-xs"
                />
                {uploadUids.length > 0 && active.review_status === "pending" && (
                  <details className="mt-2 text-xs text-muted-foreground">
                    <summary className="cursor-pointer">Show {uploadUids.length} UIDs from this batch</summary>
                    <div className="mt-2 max-h-40 overflow-auto rounded border border-border/60 p-2 font-mono">
                      {uploadUids.map((u) => (
                        <div key={u.uid} className="flex justify-between">
                          <span>{u.uid}</span>
                          <span className="text-[10px] uppercase">{u.status}</span>
                        </div>
                      ))}
                    </div>
                  </details>
                )}
              </div>

              <div>
                <label className="text-sm font-medium">Note (optional)</label>
                <Input
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Reason / comment"
                  disabled={active.review_status !== "pending"}
                />
              </div>

              <div className="rounded-lg border border-primary/40 bg-primary/5 p-3 text-sm">
                <div className="flex justify-between">
                  <span>Accepted</span>
                  <span className="font-mono">{acceptedPreview}</span>
                </div>
                <div className="flex justify-between">
                  <span>Rejected</span>
                  <span className="font-mono">{parsedRejected.length}</span>
                </div>
                <div className="mt-1 flex justify-between border-t border-border/40 pt-1 font-semibold">
                  <span>Seller payout</span>
                  <span className="font-mono">৳ {payoutPreview}</span>
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setActive(null)}>Close</Button>
            {active?.review_status === "pending" && (
              <Button onClick={submit} disabled={submitting}>
                {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Confirm &amp; pay seller
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
