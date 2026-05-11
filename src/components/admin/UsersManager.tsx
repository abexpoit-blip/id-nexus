import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Loader2, Search, Plus, Minus, Shield, ShieldOff, UserCog, LogIn, AlertTriangle, StickyNote } from "lucide-react";
import { toast } from "sonner";
import { AdminUserNotes } from "./AdminUserNotes";

interface UserRow {
  user_id: string;
  email: string | null;
  display_name: string | null;
  balance_bdt: number;
  is_banned: boolean;
  created_at: string;
  roles: string[];
  orders_count?: number;
  replacements_filed?: number;
  replacement_rate?: number;
  risk_level?: "low" | "medium" | "high";
}

type AppRole = "admin" | "seller" | "buyer";

export const UsersManager = () => {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [adjusting, setAdjusting] = useState<UserRow | null>(null);
  const [adjAmount, setAdjAmount] = useState("");
  const [adjReason, setAdjReason] = useState("");
  const [adjDirection, setAdjDirection] = useState<"add" | "deduct">("add");
  const [submitting, setSubmitting] = useState(false);
  const [notesUser, setNotesUser] = useState<UserRow | null>(null);

  const search = async () => {
    setLoading(true);
    try {
      const { users } = await api.get<{ users: UserRow[] }>("/api/admin/users/search", { q: query.trim() });
      setUsers(users ?? []);
    } catch (e: any) { toast.error(e?.message || "Failed"); }
    finally { setLoading(false); }
  };

  useEffect(() => { search(); /* eslint-disable-next-line */ }, []);

  const submitAdjust = async () => {
    if (!adjusting) return;
    const amt = Number(adjAmount);
    if (!amt || amt <= 0) { toast.error("Enter a positive amount"); return; }
    if (adjReason.trim().length < 3) { toast.error("Reason is required (min 3 chars)"); return; }
    const signed = adjDirection === "add" ? amt : -amt;
    setSubmitting(true);
    try {
      const r = await api.post<{ ok: true; balance: number }>(
        `/api/admin/users/${adjusting.user_id}/balance`,
        { delta_bdt: signed, note: adjReason.trim() },
      );
      toast.success(`${adjDirection === "add" ? "Added" : "Deducted"} ৳${amt}. New balance: ৳${r.balance.toFixed(2)}`);
      setAdjusting(null); setAdjAmount(""); setAdjReason(""); search();
    } catch (e: any) { toast.error(e?.message || "Failed"); }
    finally { setSubmitting(false); }
  };

  const toggleRole = async (u: UserRow, role: AppRole) => {
    const has = u.roles.includes(role);
    const action = has ? "revoke" : "grant";
    if (!confirm(`${action === "grant" ? "Grant" : "Revoke"} "${role}" role for ${u.email ?? u.user_id}?`)) return;
    try {
      await api.post(`/api/admin/users/${u.user_id}/roles`, has ? { remove: [role] } : { add: [role] });
      toast.success(`${role} ${action}ed`);
      search();
    } catch (e: any) { toast.error(e?.message || "Failed"); }
  };

  const impersonate = async (u: UserRow) => {
    if (!confirm(`Log in as ${u.email ?? u.user_id}?\n\nYou will be signed out of admin and into this user's account. Log out and log back in as yourself when done.`)) return;
    try {
      await api.post(`/api/admin/users/${u.user_id}/impersonate`);
      toast.success(`Signed in as ${u.email ?? u.user_id}`);
      window.location.href = "/dashboard";
    } catch (e: any) { toast.error(e?.message || "Failed"); }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && search()}
            placeholder="Search by email, name, or user ID…"
            className="pl-9"
          />
        </div>
        <Button onClick={search} disabled={loading}>
          {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
          Search
        </Button>
      </div>

      <Card className="overflow-hidden border-border/60 bg-gradient-card">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Balance</TableHead>
                <TableHead>Roles</TableHead>
                <TableHead>Joined</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.length === 0 && (
                <TableRow><TableCell colSpan={5} className="text-center text-sm text-muted-foreground">No users.</TableCell></TableRow>
              )}
              {users.map((u) => (
                <TableRow key={u.user_id}>
                  <TableCell>
                    <div className="font-medium">{u.display_name ?? "—"}</div>
                    <div className="text-xs text-muted-foreground">{u.email}</div>
                    <div className="font-mono text-[10px] text-muted-foreground">{u.user_id.slice(0, 8)}</div>
                    {u.risk_level && u.risk_level !== "low" && (
                      <div className="mt-1 inline-flex items-center gap-1 rounded-full border border-warning/40 bg-warning/10 px-2 py-0.5 text-[10px] font-semibold text-warning">
                        <AlertTriangle className="h-3 w-3" />
                        {u.risk_level === "high" ? "HIGH RISK" : "REVIEW"}
                        <span className="font-normal opacity-80">
                          · {u.replacements_filed ?? 0}/{u.orders_count ?? 0} replaces
                        </span>
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="font-display font-semibold text-primary">৳{Number(u.balance_bdt).toFixed(2)}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {u.roles.length === 0 && <span className="text-xs text-muted-foreground">—</span>}
                      {u.roles.map((r) => (
                        <Badge key={r} variant="outline" className="capitalize">{r}</Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {new Date(u.created_at).toLocaleDateString()}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex flex-wrap justify-end gap-1">
                      <Button size="sm" variant="outline"
                        onClick={() => { setAdjusting(u); setAdjDirection("add"); setAdjAmount(""); setAdjReason(""); }}>
                        <Plus className="mr-1 h-3 w-3" /> Add
                      </Button>
                      <Button size="sm" variant="outline"
                        onClick={() => { setAdjusting(u); setAdjDirection("deduct"); setAdjAmount(""); setAdjReason(""); }}>
                        <Minus className="mr-1 h-3 w-3" /> Cut
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => toggleRole(u, "admin")}
                        className={u.roles.includes("admin") ? "border-destructive/40 text-destructive" : "border-primary/40 text-primary"}>
                        {u.roles.includes("admin") ? <ShieldOff className="mr-1 h-3 w-3" /> : <Shield className="mr-1 h-3 w-3" />}
                        {u.roles.includes("admin") ? "Revoke admin" : "Make admin"}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => toggleRole(u, "seller")}>
                        <UserCog className="mr-1 h-3 w-3" />
                        {u.roles.includes("seller") ? "Revoke seller" : "Make seller"}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => impersonate(u)}
                        className="border-accent/40 text-accent">
                        <LogIn className="mr-1 h-3 w-3" /> Login as
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setNotesUser(u)}>
                        <StickyNote className="mr-1 h-3 w-3" /> Notes
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>

      {notesUser && (
        <AdminUserNotes
          userId={notesUser.user_id}
          userLabel={notesUser.email ?? notesUser.user_id}
          open={!!notesUser}
          onOpenChange={(o) => !o && setNotesUser(null)}
        />
      )}

      <Dialog open={!!adjusting} onOpenChange={(o) => !o && setAdjusting(null)}>
        <DialogContent className="bg-card">
          <DialogHeader>
            <DialogTitle>
              {adjDirection === "add" ? "Add money to" : "Deduct money from"}{" "}
              {adjusting?.display_name ?? adjusting?.email}
            </DialogTitle>
            <DialogDescription>
              Current balance: <b>৳{Number(adjusting?.balance_bdt ?? 0).toFixed(2)}</b>. This action is logged in the audit trail.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Amount (৳)</Label>
              <Input type="number" min={1} value={adjAmount} onChange={(e) => setAdjAmount(e.target.value)} placeholder="500" />
            </div>
            <div>
              <Label>Reason (required)</Label>
              <Textarea value={adjReason} onChange={(e) => setAdjReason(e.target.value)} rows={3}
                placeholder="e.g. Manual top-up — bKash txn 9A1B2C, screenshot verified" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAdjusting(null)} disabled={submitting}>Cancel</Button>
            <Button onClick={submitAdjust} disabled={submitting}
              className={adjDirection === "add"
                ? "bg-gradient-brand text-primary-foreground"
                : "bg-destructive text-destructive-foreground hover:bg-destructive/90"}>
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Confirm {adjDirection === "add" ? "add" : "deduction"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default UsersManager;