import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ArrowLeft, Loader2, Upload, RefreshCcw } from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import { NotificationsBell } from "@/components/NotificationsBell";

interface Item {
  id: string;
  reported_uid: string;
  outcome: string;
  outcome_reason: string | null;
  in_window: boolean;
  window_hours: number | null;
  created_at: string;
  request_id: string;
}
interface Request {
  id: string;
  status: string;
  parsed_uid_count: number;
  matched_count: number;
  created_at: string;
  admin_note: string | null;
}

const outcomeBadge = (o: string) => {
  const map: Record<string, string> = {
    pending: "bg-warning/20 text-warning",
    replaced: "bg-success/20 text-success",
    refunded: "bg-success/20 text-success",
    rejected: "bg-destructive/20 text-destructive",
    out_of_window: "bg-muted text-muted-foreground",
    not_yours: "bg-muted text-muted-foreground",
  };
  return map[o] ?? "bg-muted text-muted-foreground";
};

const Replacements = () => {
  const { user } = useAuth();
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [requests, setRequests] = useState<Request[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    if (!user) return;
    setLoading(true);
    const [{ data: reqs }, { data: its }] = await Promise.all([
      supabase
        .from("replacement_requests")
        .select("id, status, parsed_uid_count, matched_count, created_at, admin_note")
        .eq("buyer_id", user.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("replacement_items")
        .select("id, reported_uid, outcome, outcome_reason, in_window, window_hours, created_at, request_id")
        .eq("buyer_id", user.id)
        .order("created_at", { ascending: false })
        .limit(200),
    ]);
    setRequests((reqs ?? []) as Request[]);
    setItems((its ?? []) as Item[]);
    setLoading(false);
  };

  useEffect(() => {
    load();
    if (!user) return;
    const ch = supabase
      .channel(`replacement-items-${user.id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "replacement_items", filter: `buyer_id=eq.${user.id}` },
        () => load(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const ext = file.name.toLowerCase().split(".").pop();
      if (ext === "txt" || ext === "csv") {
        const t = await file.text();
        setText((prev) => (prev ? prev + "\n" + t : t));
      } else if (ext === "xlsx" || ext === "xls") {
        const buf = await file.arrayBuffer();
        const wb = XLSX.read(buf);
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json<any>(sheet, { defval: "" });
        const lines = rows.map((r) => Object.values(r).join(" ")).join("\n");
        setText((prev) => (prev ? prev + "\n" + lines : lines));
      } else {
        toast.error("Use .txt, .csv, or .xlsx");
      }
    } catch {
      toast.error("Could not read file");
    } finally {
      e.target.value = "";
    }
  };

  const submit = async () => {
    if (!text.trim()) {
      toast.error("Paste UIDs or upload a file");
      return;
    }
    setSubmitting(true);
    const { data, error } = await supabase.rpc("submit_replacement_request", {
      p_raw_input: text.slice(0, 100000),
    });
    setSubmitting(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    const result = data as { parsed: number; matched: number };
    toast.success(`Detected ${result.parsed} UIDs, ${result.matched} matched your purchases.`);
    setText("");
    load();
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-xl">
        <div className="container flex h-16 items-center justify-between">
          <div className="flex items-center gap-4">
            <Link to="/dashboard" className="text-sm text-muted-foreground hover:text-foreground">
              <ArrowLeft className="inline h-4 w-4" /> Dashboard
            </Link>
            <Logo size="sm" showTagline={false} />
          </div>
          <NotificationsBell />
        </div>
      </header>

      <main className="container py-8">
        <div className="mb-6">
          <h1 className="font-display text-2xl font-bold">Replacement requests</h1>
          <p className="text-sm text-muted-foreground">
            Paste UIDs of bad IDs, or upload a .txt / .csv / .xlsx file. Our system auto-detects which
            UIDs belong to your orders. Window: <b>2 hours</b> for orders ≤ 10 IDs, <b>6 hours</b> for larger orders.
          </p>
        </div>

        <Card className="border-border/60 bg-gradient-card p-6 shadow-card">
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={"Paste UIDs here (one per line, or any text containing UIDs)\n61555000000\n61555000001\n..."}
            className="min-h-32 font-mono text-sm"
            maxLength={100000}
          />
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <label className="inline-flex">
              <input
                type="file"
                accept=".txt,.csv,.xlsx,.xls"
                onChange={handleFile}
                className="hidden"
                id="rp-file"
              />
              <Button asChild variant="outline" size="sm">
                <label htmlFor="rp-file" className="cursor-pointer">
                  <Upload className="mr-2 h-4 w-4" /> Upload file
                </label>
              </Button>
            </label>
            <Button
              onClick={submit}
              disabled={submitting}
              className="bg-gradient-brand text-primary-foreground hover:opacity-90"
            >
              {submitting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCcw className="mr-2 h-4 w-4" />
              )}
              Submit replacement request
            </Button>
          </div>
        </Card>

        <div className="mt-8">
          <h2 className="mb-3 font-display text-lg font-semibold">Your requests</h2>
          {loading ? (
            <div className="flex h-32 items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : requests.length === 0 ? (
            <Card className="border-border/60 bg-gradient-card p-6 text-sm text-muted-foreground">
              No replacement requests yet.
            </Card>
          ) : (
            <div className="space-y-4">
              {requests.map((r) => {
                const reqItems = items.filter((i) => i.request_id === r.id);
                return (
                  <Card key={r.id} className="border-border/60 bg-gradient-card p-4">
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                      <div className="text-sm">
                        <span className="text-muted-foreground">Request</span>{" "}
                        <span className="font-mono">#{r.id.slice(0, 8)}</span>{" "}
                        <span className="text-muted-foreground">·</span>{" "}
                        {new Date(r.created_at).toLocaleString()}
                      </div>
                      <Badge variant="outline" className="capitalize">
                        {r.status} · {r.matched_count}/{r.parsed_uid_count} matched
                      </Badge>
                    </div>
                    {r.admin_note && (
                      <p className="mb-3 rounded-md bg-background/40 px-3 py-2 text-xs">
                        Admin: {r.admin_note}
                      </p>
                    )}
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>UID</TableHead>
                            <TableHead>Outcome</TableHead>
                            <TableHead>Window</TableHead>
                            <TableHead>Reason</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {reqItems.map((it) => (
                            <TableRow key={it.id}>
                              <TableCell className="font-mono text-xs">{it.reported_uid}</TableCell>
                              <TableCell>
                                <Badge className={outcomeBadge(it.outcome) + " capitalize"}>
                                  {it.outcome.replace("_", " ")}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-xs text-muted-foreground">
                                {it.window_hours ? `${it.window_hours}h` : "—"}
                              </TableCell>
                              <TableCell className="text-xs text-muted-foreground">
                                {it.outcome_reason ?? "—"}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default Replacements;