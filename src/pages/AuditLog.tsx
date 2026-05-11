import { useEffect, useMemo, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { api } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ArrowLeft, Loader2, ScrollText, RefreshCcw } from "lucide-react";
import { toast } from "sonner";

interface AuditRow {
  id: string;
  actor_id: string | null;
  actor_email: string | null;
  event_type: string;
  entity_type: string | null;
  entity_id: string | null;
  summary: string;
  details: any;
  created_at: string;
}

const EVENT_OPTIONS: { value: string; label: string; tone: string }[] = [
  { value: "all", label: "All events", tone: "" },
  { value: "price_change", label: "Price change", tone: "bg-warning/20 text-warning" },
  { value: "category_toggled", label: "Category active toggle", tone: "bg-secondary/20 text-secondary" },
  { value: "category_created", label: "Category created", tone: "bg-secondary/20 text-secondary" },
  { value: "stock_upload", label: "Stock upload", tone: "bg-primary/20 text-primary" },
  { value: "replacement_approved", label: "Replacement decision", tone: "bg-success/20 text-success" },
];

const eventBadgeClass = (e: string) =>
  EVENT_OPTIONS.find((o) => o.value === e)?.tone ?? "bg-muted text-muted-foreground";

const eventLabel = (e: string) =>
  EVENT_OPTIONS.find((o) => o.value === e)?.label ?? e;

const AuditLog = () => {
  const { roles, loading: authLoading } = useAuth();
  const isAdmin = roles.includes("admin");

  const [rows, setRows] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("all");
  const [search, setSearch] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const { logs } = await api.get<{ logs: AuditRow[] }>("/api/admin/audit-logs/filtered", { event: filter });
      setRows(logs ?? []);
    } catch { toast.error("Could not load audit logs"); }
    setLoading(false);
  };

  useEffect(() => {
    if (isAdmin) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin, filter]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.summary.toLowerCase().includes(q) ||
        (r.actor_email ?? "").toLowerCase().includes(q) ||
        (r.entity_id ?? "").toLowerCase().includes(q),
    );
  }, [rows, search]);

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }
  if (!isAdmin) return <Navigate to="/dashboard" replace />;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-xl">
        <div className="container flex h-16 items-center justify-between">
          <Link to="/admin" className="flex items-center gap-3">
            <ArrowLeft className="h-4 w-4" />
            <Logo size="sm" showTagline={false} />
          </Link>
          <Badge variant="outline" className="border-primary/40 text-primary">
            Admin · Audit Log
          </Badge>
        </div>
      </header>

      <main className="container py-8">
        <div className="mb-6 flex items-center gap-3">
          <ScrollText className="h-6 w-6 text-primary" />
          <div>
            <h1 className="font-display text-2xl font-bold">Audit log</h1>
            <p className="text-sm text-muted-foreground">
              Immutable history of price changes, stock uploads, and replacement decisions.
            </p>
          </div>
        </div>

        <Card className="border-border/60 bg-gradient-card p-4 shadow-card">
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <Select value={filter} onValueChange={setFilter}>
              <SelectTrigger className="w-[220px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EVENT_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              placeholder="Search summary, email, or entity ID…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-sm"
            />
            <Button variant="outline" size="sm" onClick={load} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
            </Button>
            <span className="ml-auto text-xs text-muted-foreground">
              Showing {filtered.length} of {rows.length}
            </span>
          </div>

          <div className="overflow-x-auto rounded-md border border-border/60">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[160px]">When</TableHead>
                  <TableHead className="w-[170px]">Event</TableHead>
                  <TableHead className="w-[200px]">Actor</TableHead>
                  <TableHead>Summary</TableHead>
                  <TableHead className="w-[140px]">Entity ID</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                      <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                    </TableCell>
                  </TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                      No audit entries match the current filters.
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="text-xs text-muted-foreground">
                        {new Date(r.created_at).toLocaleString()}
                      </TableCell>
                      <TableCell>
                        <Badge className={eventBadgeClass(r.event_type)}>{eventLabel(r.event_type)}</Badge>
                      </TableCell>
                      <TableCell className="text-xs">
                        <div className="font-medium">{r.actor_email ?? "system"}</div>
                        <div className="text-muted-foreground">{r.actor_id?.slice(0, 8) ?? "—"}</div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">{r.summary}</div>
                        {r.details && (
                          <details className="mt-1 text-xs text-muted-foreground">
                            <summary className="cursor-pointer">details</summary>
                            <pre className="mt-1 max-w-md overflow-x-auto whitespace-pre-wrap rounded bg-background/60 p-2">
                              {JSON.stringify(r.details, null, 2)}
                            </pre>
                          </details>
                        )}
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {r.entity_id?.slice(0, 8) ?? "—"}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </Card>
      </main>
    </div>
  );
};

export default AuditLog;