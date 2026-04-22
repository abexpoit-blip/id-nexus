import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2, CheckCircle2, XCircle, UserPlus, ChevronRight, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

interface Application {
  id: string;
  user_id: string;
  email: string;
  display_name: string | null;
  telegram_username: string | null;
  reason: string | null;
  status: "pending" | "approved" | "rejected";
  admin_note: string | null;
  created_at: string;
  reviewed_at: string | null;
}

const statusBadge = (s: string) => {
  if (s === "pending") return "bg-warning/20 text-warning";
  if (s === "approved") return "bg-success/20 text-success";
  return "bg-destructive/20 text-destructive";
};

export const SellerApplicationsManager = () => {
  const [apps, setApps] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"pending" | "all">("pending");
  const [acting, setActing] = useState<Application | null>(null);
  const [action, setAction] = useState<"approve" | "reject" | null>(null);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [confirmText, setConfirmText] = useState("");

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("seller_applications")
      .select("id, user_id, email, display_name, telegram_username, reason, status, admin_note, created_at, reviewed_at")
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) toast.error(error.message);
    setApps((data ?? []) as Application[]);
    setLoading(false);
  };

  useEffect(() => {
    load();
    const ch = supabase
      .channel("admin-seller-applications")
      .on("postgres_changes", { event: "*", schema: "public", table: "seller_applications" }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, []);

  const openAction = (app: Application, act: "approve" | "reject") => {
    setActing(app);
    setAction(act);
    setNote("");
    setConfirmText("");
  };

  const submit = async () => {
    if (!acting || !action) return;
    setSubmitting(true);
    const fn = action === "approve" ? "admin_approve_seller_application" : "admin_reject_seller_application";
    const { error } = await supabase.rpc(fn, {
      p_id: acting.id,
      p_note: note.trim() || null,
    });
    setSubmitting(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(action === "approve" ? "Seller approved" : "Application rejected");
    setActing(null);
    setAction(null);
    load();
  };

  const filtered = tab === "pending" ? apps.filter((a) => a.status === "pending") : apps;
  const pendingCount = apps.filter((a) => a.status === "pending").length;
  const requiredConfirm = action === "approve" ? "APPROVE" : "REJECT";
  const confirmOk = confirmText.trim().toUpperCase() === requiredConfirm;

  return (
    <Card className="border-border/60 bg-gradient-card p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <UserPlus className="h-5 w-5 text-primary" />
          <h2 className="font-display text-lg font-semibold">Seller Applications</h2>
          {pendingCount > 0 && (
            <Badge className="bg-warning/20 text-warning">{pendingCount} pending</Badge>
          )}
        </div>
        <div className="flex gap-1 rounded-md border border-border/60 p-1">
          <Button
            size="sm"
            variant={tab === "pending" ? "default" : "ghost"}
            onClick={() => setTab("pending")}
          >
            Pending ({pendingCount})
          </Button>
          <Button
            size="sm"
            variant={tab === "all" ? "default" : "ghost"}
            onClick={() => setTab("all")}
          >
            All ({apps.length})
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex h-32 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <CheckCircle2 className="h-10 w-10 text-success" />
          <p className="mt-3 text-sm text-muted-foreground">
            {tab === "pending" ? "No pending seller applications." : "No applications yet."}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8"></TableHead>
                <TableHead>Applicant</TableHead>
                <TableHead>Telegram</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Submitted</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((a) => {
                const isOpen = expanded === a.id;
                return (
                <>
                <TableRow
                  key={a.id}
                  className="cursor-pointer"
                  onClick={() => setExpanded(isOpen ? null : a.id)}
                >
                  <TableCell>
                    <ChevronRight
                      className={`h-4 w-4 text-muted-foreground transition-transform ${isOpen ? "rotate-90" : ""}`}
                    />
                  </TableCell>
                  <TableCell>
                    <div className="font-medium">{a.display_name ?? a.email.split("@")[0]}</div>
                    <div className="text-xs text-muted-foreground">{a.email}</div>
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {a.telegram_username ? `@${a.telegram_username}` : "—"}
                  </TableCell>
                  <TableCell className="max-w-xs">
                    <p className="line-clamp-2 text-sm text-muted-foreground">
                      {a.reason ?? "—"}
                    </p>
                  </TableCell>
                  <TableCell>
                    <Badge className={statusBadge(a.status) + " capitalize"}>{a.status}</Badge>
                    {a.admin_note && (
                      <div className="mt-1 text-xs text-muted-foreground">{a.admin_note}</div>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {new Date(a.created_at).toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                    {a.status === "pending" ? (
                      <div className="inline-flex gap-1">
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-success/40 text-success hover:text-success"
                          onClick={() => openAction(a, "approve")}
                        >
                          <CheckCircle2 className="mr-1 h-3 w-3" /> Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-destructive/40 text-destructive hover:text-destructive"
                          onClick={() => openAction(a, "reject")}
                        >
                          <XCircle className="mr-1 h-3 w-3" /> Reject
                        </Button>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        {a.reviewed_at ? new Date(a.reviewed_at).toLocaleDateString() : "—"}
                      </span>
                    )}
                  </TableCell>
                </TableRow>
                {isOpen && (
                  <TableRow key={a.id + "-details"} className="bg-muted/30 hover:bg-muted/30">
                    <TableCell colSpan={7} className="p-0">
                      <div className="grid gap-4 p-5 sm:grid-cols-2">
                        <div>
                          <div className="text-xs uppercase tracking-widest text-muted-foreground">Applicant</div>
                          <div className="mt-1 font-medium">{a.display_name ?? "—"}</div>
                          <div className="text-sm text-muted-foreground">{a.email}</div>
                        </div>
                        <div>
                          <div className="text-xs uppercase tracking-widest text-muted-foreground">Telegram</div>
                          <div className="mt-1 font-mono text-sm">
                            {a.telegram_username ? `@${a.telegram_username}` : "—"}
                          </div>
                        </div>
                        <div className="sm:col-span-2">
                          <div className="text-xs uppercase tracking-widest text-muted-foreground">Reason</div>
                          <p className="mt-1 whitespace-pre-wrap text-sm">
                            {a.reason?.trim() ? a.reason : <span className="text-muted-foreground">— No reason provided —</span>}
                          </p>
                        </div>
                        <div>
                          <div className="text-xs uppercase tracking-widest text-muted-foreground">User ID</div>
                          <div className="mt-1 font-mono text-xs text-muted-foreground">{a.user_id}</div>
                        </div>
                        <div>
                          <div className="text-xs uppercase tracking-widest text-muted-foreground">Application ID</div>
                          <div className="mt-1 font-mono text-xs text-muted-foreground">{a.id}</div>
                        </div>
                        {a.admin_note && (
                          <div className="sm:col-span-2">
                            <div className="text-xs uppercase tracking-widest text-muted-foreground">Admin note</div>
                            <p className="mt-1 text-sm">{a.admin_note}</p>
                          </div>
                        )}
                        {a.reviewed_at && (
                          <div className="sm:col-span-2 text-xs text-muted-foreground">
                            Reviewed {new Date(a.reviewed_at).toLocaleString()}
                          </div>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                )}
                </>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={!!acting} onOpenChange={(o) => !o && setActing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="capitalize">{action} seller application</DialogTitle>
            <DialogDescription>
              {acting?.display_name ?? acting?.email} · @{acting?.telegram_username}
              <br />
              {action === "approve"
                ? "This will grant the seller role and revoke buyer access."
                : "Application will be rejected. Applicant can re-apply later."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <label className="text-sm font-medium">Note (optional)</label>
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Visible to applicant"
              maxLength={500}
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setActing(null)} disabled={submitting}>
              Cancel
            </Button>
            <Button
              onClick={submit}
              disabled={submitting}
              className={
                action === "approve"
                  ? "bg-gradient-brand text-primary-foreground hover:opacity-90"
                  : "bg-destructive text-destructive-foreground hover:bg-destructive/90"
              }
            >
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Confirm {action}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
};