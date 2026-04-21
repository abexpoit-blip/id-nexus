import { useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
import { ArrowLeft, Upload, FileSpreadsheet, Loader2, CheckCircle2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

interface Category {
  id: string;
  name: string;
  slug: string;
  price_bdt: number;
}

interface ParsedRow {
  uid: string;
  password: string;
  two_fa?: string;
  email?: string;
  email_password?: string;
}

interface StockSummary {
  category_id: string;
  category_name: string;
  available: number;
  sold: number;
}

const HEADER_MAP: Record<string, keyof ParsedRow> = {
  uid: "uid",
  id: "uid",
  account: "uid",
  password: "password",
  pass: "password",
  pwd: "password",
  "2fa": "two_fa",
  twofa: "two_fa",
  two_fa: "two_fa",
  totp: "two_fa",
  email: "email",
  mail: "email",
  email_password: "email_password",
  emailpassword: "email_password",
  emailpass: "email_password",
  mailpass: "email_password",
};

const SellerDashboard = () => {
  const { user, roles, loading: authLoading } = useAuth();
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryId, setCategoryId] = useState<string>("");
  const [parsed, setParsed] = useState<ParsedRow[] | null>(null);
  const [fileName, setFileName] = useState<string>("");
  const [uploading, setUploading] = useState(false);
  const [stock, setStock] = useState<StockSummary[]>([]);
  const [recent, setRecent] = useState<any[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const isSeller = roles.includes("seller") || roles.includes("admin");

  const loadAll = async () => {
    if (!user) return;
    const [{ data: cats }, { data: myAccounts }, { data: recentRows }] = await Promise.all([
      supabase
        .from("categories")
        .select("id, name, slug, price_bdt")
        .eq("is_active", true)
        .eq("kind", "fb_account")
        .order("sort_order"),
      supabase
        .from("accounts")
        .select("category_id, status")
        .eq("seller_id", user.id),
      supabase
        .from("accounts")
        .select("uid, status, sold_at, created_at, category_id")
        .eq("seller_id", user.id)
        .order("created_at", { ascending: false })
        .limit(20),
    ]);
    setCategories((cats ?? []) as Category[]);

    // Build per-category stock summary
    const map = new Map<string, StockSummary>();
    (cats ?? []).forEach((c: any) =>
      map.set(c.id, { category_id: c.id, category_name: c.name, available: 0, sold: 0 }),
    );
    (myAccounts ?? []).forEach((a: any) => {
      const row = map.get(a.category_id);
      if (!row) return;
      if (a.status === "available") row.available++;
      else if (a.status === "sold") row.sold++;
    });
    setStock(Array.from(map.values()));
    setRecent(recentRows ?? []);
  };

  useEffect(() => {
    loadAll();
    if (!user) return;
    const channel = supabase
      .channel("seller-accounts-" + user.id)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "accounts", filter: `seller_id=eq.${user.id}` },
        () => loadAll(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const totals = useMemo(() => {
    return stock.reduce(
      (acc, r) => ({ available: acc.available + r.available, sold: acc.sold + r.sold }),
      { available: 0, sold: 0 },
    );
  }, [stock]);

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error("File too large (max 5 MB)");
      return;
    }
    setFileName(file.name);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows: any[] = XLSX.utils.sheet_to_json(ws, { defval: "" });

      const normalized: ParsedRow[] = [];
      for (const r of rows) {
        const out: any = {};
        for (const k of Object.keys(r)) {
          const key = k.toString().trim().toLowerCase().replace(/[\s\-]/g, "_");
          const target = HEADER_MAP[key];
          if (target) out[target] = String(r[k]).trim();
        }
        if (out.uid && out.password) normalized.push(out as ParsedRow);
      }
      if (normalized.length === 0) {
        toast.error("No valid rows. Need columns: UID, Password (2FA, Email optional).");
        setParsed(null);
        return;
      }
      if (normalized.length > 5000) {
        toast.error("Max 5000 rows per upload");
        setParsed(null);
        return;
      }
      setParsed(normalized);
      toast.success(`Parsed ${normalized.length} rows. Review then confirm.`);
    } catch (err: any) {
      toast.error("Could not read file: " + (err?.message || "unknown"));
      setParsed(null);
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const confirmUpload = async () => {
    if (!parsed || !categoryId) {
      toast.error("Pick a category first");
      return;
    }
    setUploading(true);
    const { data, error } = await supabase.rpc("seller_upload_accounts", {
      p_category_id: categoryId,
      p_rows: parsed as any,
    });
    setUploading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    const r = data as any;
    toast.success(
      `Inserted ${r.inserted} new IDs. Duplicates: ${r.duplicate_count ?? 0}, invalid: ${r.invalid_count ?? 0}.`,
    );
    setParsed(null);
    setFileName("");
    loadAll();
  };

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }
  if (!user) return <Navigate to="/auth" replace />;
  if (!isSeller) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <Card className="max-w-md border-border/60 bg-gradient-card p-8 text-center">
          <AlertTriangle className="mx-auto h-10 w-10 text-warning" />
          <h2 className="mt-4 font-display text-xl font-semibold">Seller access required</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Your account doesn't have seller permissions yet. Contact admin to apply as a seller.
          </p>
          <Button asChild className="mt-6">
            <Link to="/dashboard">Back to dashboard</Link>
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-xl">
        <div className="container flex h-16 items-center justify-between">
          <div className="flex items-center gap-4">
            <Link to="/dashboard" className="text-sm text-muted-foreground hover:text-foreground">
              <ArrowLeft className="inline h-4 w-4" /> Dashboard
            </Link>
            <Logo size="sm" showTagline={false} />
            <Badge variant="outline" className="border-secondary/40 text-secondary">Seller</Badge>
          </div>
        </div>
      </header>

      <main className="container py-8">
        <div className="mb-8">
          <h1 className="font-display text-2xl font-bold md:text-3xl">Seller workspace</h1>
          <p className="text-sm text-muted-foreground">
            Upload your stock as Excel — UID + Password required, 2FA & email optional. Globally
            duplicate UIDs are skipped automatically.
          </p>
        </div>

        {/* Stats */}
        <div className="mb-6 grid gap-4 md:grid-cols-3">
          <Card className="border-border/60 bg-gradient-card p-5">
            <div className="text-xs uppercase tracking-widest text-muted-foreground">Available stock</div>
            <div className="mt-2 font-display text-3xl font-bold text-primary">{totals.available}</div>
          </Card>
          <Card className="border-border/60 bg-gradient-card p-5">
            <div className="text-xs uppercase tracking-widest text-muted-foreground">Sold</div>
            <div className="mt-2 font-display text-3xl font-bold">{totals.sold}</div>
          </Card>
          <Card className="border-border/60 bg-gradient-card p-5">
            <div className="text-xs uppercase tracking-widest text-muted-foreground">Categories</div>
            <div className="mt-2 font-display text-3xl font-bold">{categories.length}</div>
          </Card>
        </div>

        {/* Upload */}
        <Card className="mb-6 border-border/60 bg-gradient-card p-6">
          <div className="font-display text-lg font-semibold">Upload stock</div>
          <p className="text-xs text-muted-foreground">
            Excel columns expected: <code>UID</code>, <code>Password</code>,{" "}
            <code>2FA</code> (optional), <code>Email</code> (optional),{" "}
            <code>Email Password</code> (optional).
          </p>

          <div className="mt-4 grid gap-4 md:grid-cols-[1fr,auto]">
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger>
                <SelectValue placeholder="Choose category" />
              </SelectTrigger>
              <SelectContent>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name} — ৳ {Number(c.price_bdt).toFixed(0)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={onFile}
              className="hidden"
              id="stock-file"
            />
            <Button asChild variant="outline">
              <label htmlFor="stock-file" className="cursor-pointer">
                <FileSpreadsheet className="mr-2 h-4 w-4" /> Pick file
              </label>
            </Button>
          </div>

          {parsed && (
            <div className="mt-5 space-y-3">
              <div className="rounded-md border border-primary/30 bg-primary/5 p-3 text-sm">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-primary" />
                  <span className="font-medium">{fileName}</span>
                  <span className="text-muted-foreground">— {parsed.length} rows ready</span>
                </div>
              </div>
              <div className="max-h-64 overflow-auto rounded-md border border-border/60">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>UID</TableHead>
                      <TableHead>Password</TableHead>
                      <TableHead>2FA</TableHead>
                      <TableHead>Email</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {parsed.slice(0, 8).map((r, i) => (
                      <TableRow key={i}>
                        <TableCell className="font-mono text-xs">{r.uid}</TableCell>
                        <TableCell className="font-mono text-xs">••••••</TableCell>
                        <TableCell className="font-mono text-xs">{r.two_fa ? "set" : "—"}</TableCell>
                        <TableCell className="font-mono text-xs">{r.email ?? "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {parsed.length > 8 && (
                  <div className="border-t border-border/60 px-4 py-2 text-xs text-muted-foreground">
                    + {parsed.length - 8} more rows
                  </div>
                )}
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setParsed(null)} disabled={uploading}>
                  Discard
                </Button>
                <Button
                  onClick={confirmUpload}
                  disabled={uploading || !categoryId}
                  className="bg-gradient-brand text-primary-foreground hover:opacity-90"
                >
                  {uploading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  <Upload className="mr-2 h-4 w-4" /> Confirm upload
                </Button>
              </div>
            </div>
          )}
        </Card>

        {/* Per-category stock */}
        <Card className="mb-6 border-border/60 bg-gradient-card p-6">
          <div className="mb-4 font-display text-lg font-semibold">Live stock by category</div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-right">Available</TableHead>
                  <TableHead className="text-right">Sold</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stock.map((s) => (
                  <TableRow key={s.category_id}>
                    <TableCell>{s.category_name}</TableCell>
                    <TableCell className="text-right font-display font-semibold text-primary">
                      {s.available}
                    </TableCell>
                    <TableCell className="text-right">{s.sold}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>

        {/* Recent uploads */}
        <Card className="border-border/60 bg-gradient-card p-6">
          <div className="mb-4 font-display text-lg font-semibold">Recent IDs</div>
          {recent.length === 0 ? (
            <p className="text-sm text-muted-foreground">No accounts yet — upload your first batch above.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>UID</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Added</TableHead>
                    <TableHead>Sold at</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recent.map((r: any) => (
                    <TableRow key={r.uid}>
                      <TableCell className="font-mono text-xs">{r.uid}</TableCell>
                      <TableCell>
                        <Badge
                          className={
                            r.status === "available"
                              ? "bg-success/20 text-success hover:bg-success/20"
                              : r.status === "sold"
                              ? "bg-muted text-muted-foreground"
                              : "bg-warning/20 text-warning hover:bg-warning/20"
                          }
                        >
                          {r.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {new Date(r.created_at).toLocaleString()}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {r.sold_at ? new Date(r.sold_at).toLocaleString() : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </Card>
      </main>
    </div>
  );
};

export default SellerDashboard;