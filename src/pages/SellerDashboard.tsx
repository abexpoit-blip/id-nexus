import { useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { RefreshCw } from "lucide-react";
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
import { ArrowLeft, Upload, FileSpreadsheet, Loader2, CheckCircle2, AlertTriangle, Download } from "lucide-react";
import { toast } from "sonner";
import { NotificationsBell } from "@/components/NotificationsBell";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

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

interface DuplicateInfo {
  duplicatesInFile: string[]; // duplicate within uploaded file
  duplicatesInStock: string[]; // already in seller's existing accounts
}

interface StockSummary {
  category_id: string;
  category_name: string;
  available: number;
  sold: number;
}

interface ReplacementRow {
  id: string;
  reported_uid: string;
  outcome: string;
  outcome_reason: string | null;
  in_window: boolean;
  created_at: string;
  account_id: string | null;
}

type ReasonBucket = "user_replaced" | "bot_replaced" | "refunded" | "rejected" | "out_of_window" | "unknown";

const REASON_OPTIONS: { value: ReasonBucket | "all"; label: string }[] = [
  { value: "all", label: "All reasons" },
  { value: "user_replaced", label: "User replaced" },
  { value: "bot_replaced", label: "Bot replaced" },
  { value: "refunded", label: "Refunded" },
  { value: "rejected", label: "Rejected" },
  { value: "out_of_window", label: "Out of window" },
  { value: "unknown", label: "Unknown / other" },
];

const classifyReason = (reason: string | null | undefined): ReasonBucket => {
  const s = (reason ?? "").toLowerCase();
  if (!s) return "unknown";
  if (/\bbot\b|automated|auto[-\s]?replace/.test(s)) return "bot_replaced";
  if (/replaced|fresh id|swap/.test(s)) return "user_replaced";
  if (/refund/.test(s)) return "refunded";
  if (/reject/.test(s)) return "rejected";
  if (/window|hours after/.test(s)) return "out_of_window";
  return "unknown";
};

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

const REQUIRED_HEADER_TARGETS: Array<{ target: keyof ParsedRow; label: string; aliases: string[] }> = [
  { target: "uid", label: "UID", aliases: ["uid", "id", "account"] },
  { target: "password", label: "Password", aliases: ["password", "pass", "pwd"] },
];

const PARSED_STORAGE_PREFIX = "seller:lastParsedUpload:";
const PARSED_STORAGE_TTL_MS = 24 * 60 * 60 * 1000; // 24h

interface PersistedParse {
  fileName: string;
  categoryId: string;
  rows: ParsedRow[];
  savedAt: number;
}

type UploadStep = "idle" | "parsing" | "validating" | "uploading" | "confirming" | "done" | "error";

const STEP_ORDER: UploadStep[] = ["parsing", "validating", "uploading", "confirming", "done"];
const STEP_LABELS: Record<UploadStep, string> = {
  idle: "Idle",
  parsing: "Reading file",
  validating: "Validating headers & rows",
  uploading: "Sending to server",
  confirming: "Confirming insert",
  done: "Done",
  error: "Error",
};

const SellerDashboard = () => {
  const { user, roles, loading: authLoading } = useAuth();
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryId, setCategoryId] = useState<string>("");
  const [parsed, setParsed] = useState<ParsedRow[] | null>(null);
  const [fileName, setFileName] = useState<string>("");
  const [uploading, setUploading] = useState(false);
  const [categoriesLoading, setCategoriesLoading] = useState(true);
  const [categoriesError, setCategoriesError] = useState<string | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadStep, setUploadStep] = useState<UploadStep>("idle");
  const [uploadProgress, setUploadProgress] = useState(0); // 0..100, used for parsing read
  const [lastFile, setLastFile] = useState<File | null>(null);
  const [duplicates, setDuplicates] = useState<DuplicateInfo | null>(null);
  const [stock, setStock] = useState<StockSummary[]>([]);
  const [recent, setRecent] = useState<any[]>([]);
  const [soldToday, setSoldToday] = useState(0);
  const [soldWeek, setSoldWeek] = useState(0);
  const [soldPeriod, setSoldPeriod] = useState<"today" | "week">("today");
  const [replacements, setReplacements] = useState<ReplacementRow[]>([]);
  const [accountCategoryMap, setAccountCategoryMap] = useState<Record<string, string>>({});
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [filterOutcome, setFilterOutcome] = useState<string>("all");
  const [filterReason, setFilterReason] = useState<string>("all");
  const [sortOrder, setSortOrder] = useState<"newest" | "oldest">("newest");
  const [previewOpen, setPreviewOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const replacementsRef = useRef<HTMLDivElement>(null);
  const chartClickLockRef = useRef(false);
  const [tableHighlight, setTableHighlight] = useState(false);
  const [exportWindow, setExportWindow] = useState<"all" | "in" | "out">("all");
  const [dailyLimit, setDailyLimit] = useState<number>(0);
  const [usedToday, setUsedToday] = useState<number>(0);

  const isSeller = roles.includes("seller") || roles.includes("admin");

  const storageKey = user ? `${PARSED_STORAGE_PREFIX}${user.id}` : null;

  // Restore last parsed upload on mount (per-user, 24h TTL)
  useEffect(() => {
    if (!storageKey) return;
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return;
      const saved = JSON.parse(raw) as PersistedParse;
      if (!saved?.rows?.length) return;
      if (Date.now() - (saved.savedAt ?? 0) > PARSED_STORAGE_TTL_MS) {
        localStorage.removeItem(storageKey);
        return;
      }
      setParsed(saved.rows);
      setFileName(saved.fileName ?? "");
      if (saved.categoryId) setCategoryId(saved.categoryId);
      toast.info("Restored your last parsed upload — confirm or discard.");
    } catch {
      // ignore corrupt storage
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  const persistParsed = (rows: ParsedRow[], name: string, catId: string) => {
    if (!storageKey) return;
    try {
      const payload: PersistedParse = { fileName: name, categoryId: catId, rows, savedAt: Date.now() };
      localStorage.setItem(storageKey, JSON.stringify(payload));
    } catch {
      // quota / serialization failure — non-fatal
    }
  };

  const clearPersistedParsed = () => {
    if (!storageKey) return;
    try { localStorage.removeItem(storageKey); } catch { /* noop */ }
  };

  const handleCategoryChange = (next: string) => {
    if (uploading) {
      toast.error("Upload in progress — wait for it to finish before switching category.");
      return;
    }
    if (parsed && next !== categoryId) {
      toast.error("Discard the parsed file first to switch category.");
      return;
    }
    setCategoryId(next);
  };

  const loadAll = async () => {
    if (!user) return;
    setCategoriesLoading(true);
    setCategoriesError(null);
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const startOfWeek = new Date();
    startOfWeek.setHours(0, 0, 0, 0);
    startOfWeek.setDate(startOfWeek.getDate() - 6); // last 7 days incl. today

    let cats: any[] | null = null;
    let myAccounts: any[] | null = null;
    let recentRows: any[] | null = null;
    let todayCount: number | null = 0;
    let weekCount: number | null = 0;
    let rpItems: any[] | null = null;
    try {
      const results = await Promise.all([
      supabase
        .from("categories")
        .select("id, name, slug, price_bdt")
        .eq("is_active", true)
        .eq("kind", "fb_account")
        .order("sort_order"),
      supabase
        .from("accounts")
        .select("id, category_id, status")
        .eq("seller_id", user.id),
      supabase
        .from("accounts")
        .select("uid, status, sold_at, created_at, category_id")
        .eq("seller_id", user.id)
        .order("created_at", { ascending: false })
        .limit(20),
      supabase
        .from("accounts")
        .select("id", { count: "exact", head: true })
        .eq("seller_id", user.id)
        .eq("status", "sold")
        .gte("sold_at", startOfDay.toISOString()),
      supabase
        .from("accounts")
        .select("id", { count: "exact", head: true })
        .eq("seller_id", user.id)
        .eq("status", "sold")
        .gte("sold_at", startOfWeek.toISOString()),
      supabase
        .from("replacement_items")
        .select("id, reported_uid, outcome, outcome_reason, in_window, created_at, account_id")
        .eq("seller_id", user.id)
        .order("created_at", { ascending: false })
        .limit(100),
      ]);
      cats = results[0].data as any[] | null;
      myAccounts = results[1].data as any[] | null;
      recentRows = results[2].data as any[] | null;
      todayCount = results[3].count;
      weekCount = results[4].count;
      rpItems = results[5].data as any[] | null;
      if (results[0].error) throw results[0].error;
    } catch (err: any) {
      setCategoriesError(err?.message || "Failed to load categories");
      setCategoriesLoading(false);
      return;
    }
    setCategories((cats ?? []) as Category[]);
    setCategoriesLoading(false);
    setSoldToday(todayCount ?? 0);
    setSoldWeek(weekCount ?? 0);
    setReplacements((rpItems ?? []) as ReplacementRow[]);

    // Daily limit + uploaded-today (UTC day)
    const [{ data: limitVal }, { data: usedVal }] = await Promise.all([
      supabase.rpc("get_seller_daily_limit", { _seller_id: user.id }),
      supabase.rpc("get_seller_today_uploaded", { _seller_id: user.id }),
    ]);
    setDailyLimit(Number(limitVal ?? 0));
    setUsedToday(Number(usedVal ?? 0));

    // Map account_id -> category_id for filter
    const acctMap: Record<string, string> = {};
    (myAccounts ?? []).forEach((a: any) => { acctMap[a.id] = a.category_id; });
    setAccountCategoryMap(acctMap);

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
    const acctChannel = supabase
      .channel("seller-accounts-" + user.id)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "accounts", filter: `seller_id=eq.${user.id}` },
        () => loadAll(),
      )
      .subscribe();
    const rpChannel = supabase
      .channel("seller-replacements-" + user.id)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "replacement_items", filter: `seller_id=eq.${user.id}` },
        () => loadAll(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(acctChannel);
      supabase.removeChannel(rpChannel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const totals = useMemo(() => {
    return stock.reduce(
      (acc, r) => ({ available: acc.available + r.available, sold: acc.sold + r.sold }),
      { available: 0, sold: 0 },
    );
  }, [stock]);

  const filteredReplacements = useMemo(() => {
    const filtered = replacements.filter((r) => {
      if (filterOutcome !== "all" && r.outcome !== filterOutcome) return false;
      if (filterCategory !== "all") {
        const catId = r.account_id ? accountCategoryMap[r.account_id] : undefined;
        if (catId !== filterCategory) return false;
      }
      if (filterReason !== "all" && classifyReason(r.outcome_reason) !== filterReason) return false;
      return true;
    });
    return filtered.sort((a, b) => {
      const ta = new Date(a.created_at).getTime();
      const tb = new Date(b.created_at).getTime();
      return sortOrder === "newest" ? tb - ta : ta - tb;
    });
  }, [replacements, filterCategory, filterOutcome, filterReason, accountCategoryMap, sortOrder]);

  const pendingReplacements = useMemo(
    () => replacements.filter((r) => r.outcome === "pending").length,
    [replacements],
  );

  const replacementsByCategory = useMemo(() => {
    const counts = new Map<string, { count: number; categoryId: string | null }>();
    filteredReplacements.forEach((r) => {
      const catId = r.account_id ? accountCategoryMap[r.account_id] : undefined;
      const name =
        (catId && categories.find((c) => c.id === catId)?.name) || "Unknown";
      const prev = counts.get(name);
      counts.set(name, { count: (prev?.count ?? 0) + 1, categoryId: catId ?? null });
    });
    return Array.from(counts.entries())
      .map(([name, v]) => ({ name, count: v.count, categoryId: v.categoryId }))
      .sort((a, b) => b.count - a.count);
  }, [filteredReplacements, accountCategoryMap, categories]);

  const handleChartBarClick = (data: any) => {
    if (chartClickLockRef.current) return;
    chartClickLockRef.current = true;
    setTimeout(() => {
      chartClickLockRef.current = false;
    }, 400);
    const payload = data?.activePayload?.[0]?.payload ?? data?.payload ?? data;
    if (payload?.categoryId) setFilterCategory(payload.categoryId);
    replacementsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    setTableHighlight(false);
    requestAnimationFrame(() => setTableHighlight(true));
    window.setTimeout(() => setTableHighlight(false), 1600);
    // Move keyboard focus to the table region for a11y / quick review
    window.setTimeout(() => {
      const node = replacementsRef.current?.querySelector<HTMLElement>(
        '[data-replacement-table]',
      );
      node?.focus({ preventScroll: true });
    }, 350);
  };

  const getExportRows = () => {
    return filteredReplacements.filter((r) => {
      if (exportWindow === "all") return true;
      return exportWindow === "in" ? r.in_window === true : r.in_window === false;
    });
  };

  const openExportPreview = () => {
    if (exportWindow === "in" && filterOutcome === "out_of_window") {
      toast.error(
        "Status filter is 'Out of window' but CSV is set to 'In window' — no rows can match. Switch one of them.",
      );
      return;
    }
    setPreviewOpen(true);
  };

  const exportReplacementsCsv = () => {
    if (exportWindow === "in" && filterOutcome === "out_of_window") {
      toast.error(
        "Status filter is 'Out of window' but CSV is set to 'In window' — no rows can match. Switch one of them.",
      );
      return;
    }
    const rows = getExportRows();
    if (rows.length === 0) {
      toast.error("Nothing to export with current filters");
      return;
    }
    const headers = ["UID", "Category", "Status", "In window", "Window (h)", "Reason", "Filed at"];
    const escape = (v: string | number | null | undefined) => {
      const s = v == null ? "" : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [headers.join(",")];
    rows.forEach((r) => {
      const catId = r.account_id ? accountCategoryMap[r.account_id] : undefined;
      const catName = (catId && categories.find((c) => c.id === catId)?.name) || "Unknown";
      lines.push(
        [
          r.reported_uid,
          catName,
          r.outcome,
          r.in_window ? "yes" : "no",
          (r as any).window_hours ?? "",
          r.outcome_reason ?? "",
          new Date(r.created_at).toISOString(),
        ].map(escape).join(","),
      );
    });
    const blob = new Blob(["\ufeff" + lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const suffix = exportWindow === "all" ? "" : `-${exportWindow}-window`;
    a.download = `replacement-report${suffix}-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setPreviewOpen(false);
    toast.success(`Exported ${rows.length} rows`);
  };

  const processFile = async (file: File) => {
    setParseError(null);
    setUploadError(null);
    setDuplicates(null);
    setLastFile(file);
    if (file.size > 5 * 1024 * 1024) {
      const msg = "File too large (max 5 MB)";
      setParseError(msg);
      setUploadStep("error");
      toast.error(msg);
      return;
    }
    setFileName(file.name);
    setUploadStep("parsing");
    setUploadProgress(0);
    try {
      // Stream read with progress
      const reader = file.stream().getReader();
      const total = file.size || 1;
      const chunks: Uint8Array[] = [];
      let received = 0;
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          chunks.push(value);
          received += value.byteLength;
          setUploadProgress(Math.min(99, Math.round((received / total) * 100)));
        }
      }
      const merged = new Uint8Array(received);
      let offset = 0;
      for (const c of chunks) { merged.set(c, offset); offset += c.byteLength; }
      setUploadProgress(100);
      setUploadStep("validating");
      const isCsv = /\.csv$/i.test(file.name) || file.type === "text/csv";
      const wb = isCsv
        ? XLSX.read(new TextDecoder("utf-8").decode(merged), { type: "string" })
        : XLSX.read(merged, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];

      // Header validation BEFORE row parsing
      const headerRows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" }) as any[][];
      const headerRow = (headerRows[0] ?? []).map((h) => String(h ?? "").trim().toLowerCase().replace(/[\s\-]/g, "_"));
      const presentTargets = new Set<string>();
      headerRow.forEach((h) => {
        const t = HEADER_MAP[h];
        if (t) presentTargets.add(t);
      });
      const missing = REQUIRED_HEADER_TARGETS.filter((r) => !presentTargets.has(r.target));
      if (missing.length > 0) {
        const msg = `Missing required column${missing.length > 1 ? "s" : ""}: ${missing
          .map((m) => `${m.label} (accepts: ${m.aliases.join(", ")})`)
          .join("; ")}`;
        setParseError(msg);
        setUploadStep("error");
        toast.error(msg);
        setParsed(null);
        return;
      }

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
        const msg = "No valid rows. Need columns: UID, Password (2FA, Email optional).";
        setParseError(msg);
        setUploadStep("error");
        toast.error(msg);
        setParsed(null);
        return;
      }
      if (normalized.length > 5000) {
        const msg = "Max 5000 rows per upload";
        setParseError(msg);
        setUploadStep("error");
        toast.error(msg);
        setParsed(null);
        return;
      }

      // Duplicate detection — within file
      const seen = new Set<string>();
      const dupInFile = new Set<string>();
      for (const r of normalized) {
        if (seen.has(r.uid)) dupInFile.add(r.uid);
        else seen.add(r.uid);
      }

      // Duplicate detection — against seller's existing stock
      let dupInStock: string[] = [];
      if (user) {
        const uidList = Array.from(seen);
        // Chunk to avoid very large IN() filters
        const CHUNK = 500;
        for (let i = 0; i < uidList.length; i += CHUNK) {
          const slice = uidList.slice(i, i + CHUNK);
          const { data: existing, error: dupErr } = await supabase
            .from("accounts")
            .select("uid")
            .eq("seller_id", user.id)
            .in("uid", slice);
          if (dupErr) {
            const msg = "Could not verify duplicates: " + dupErr.message;
            setParseError(msg);
            setUploadStep("error");
            toast.error(msg);
            setParsed(null);
            return;
          }
          dupInStock.push(...(existing ?? []).map((e: any) => String(e.uid)));
        }
      }

      setDuplicates({
        duplicatesInFile: Array.from(dupInFile),
        duplicatesInStock: dupInStock,
      });
      setParsed(normalized);
      persistParsed(normalized, file.name, categoryId);
      setUploadStep("idle");
      const dupTotal = dupInFile.size + dupInStock.length;
      if (dupTotal > 0) {
        toast.warning(
          `Parsed ${normalized.length} rows. ${dupTotal} duplicate UID${dupTotal > 1 ? "s" : ""} detected — review before confirm.`,
        );
      } else {
        toast.success(`Parsed ${normalized.length} rows. Review then confirm.`);
      }
    } catch (err: any) {
      const msg = "Could not read file: " + (err?.message || "unknown");
      setParseError(msg);
      setUploadStep("error");
      toast.error(msg);
      setParsed(null);
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await processFile(file);
  };

  const retryParsing = async () => {
    if (!lastFile) {
      toast.error("No previous file to retry — pick a file again.");
      return;
    }
    await processFile(lastFile);
  };

  const confirmUpload = async () => {
    if (!parsed || !categoryId) {
      const msg = "Pick a category first";
      setUploadError(msg);
      toast.error(msg);
      return;
    }
    setUploadError(null);
    setUploading(true);
    setUploadStep("uploading");
    setUploadProgress(0);
    // simple synthetic progress while RPC is in flight
    const tick = window.setInterval(() => {
      setUploadProgress((p) => (p < 90 ? p + 7 : p));
    }, 250);
    const { data, error } = await supabase.rpc("seller_upload_accounts", {
      p_category_id: categoryId,
      p_rows: parsed as any,
    });
    window.clearInterval(tick);
    setUploadProgress(100);
    setUploadStep("confirming");
    setUploading(false);
    if (error) {
      setUploadError(error.message);
      setUploadStep("error");
      toast.error(error.message);
      return;
    }
    const r = data as any;
    const overLimit = Number(r.over_limit_skipped ?? 0);
    const remaining = Number(r.remaining_after ?? 0);
    let msg = `Inserted ${r.inserted} new IDs. Duplicates: ${r.duplicate_count ?? 0}, invalid: ${r.invalid_count ?? 0}.`;
    if (overLimit > 0) {
      msg += ` ${overLimit} rows skipped — daily limit reached.`;
      toast.warning(msg);
    } else {
      toast.success(msg + (remaining >= 0 ? ` ${remaining} uploads left today.` : ""));
    }
    setParsed(null);
    setFileName("");
    clearPersistedParsed();
    setLastFile(null);
    setDuplicates(null);
    setUploadStep("done");
    window.setTimeout(() => setUploadStep("idle"), 1500);
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
            <Link to="/wallet" className="ml-2 text-sm text-muted-foreground hover:text-foreground">
              Wallet
            </Link>
          </div>
          <NotificationsBell />
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
        <div className="mb-6 grid gap-4 md:grid-cols-3 lg:grid-cols-6">
          <Card className="border-border/60 bg-gradient-card p-5">
            <div className="text-xs uppercase tracking-widest text-muted-foreground">Available stock</div>
            <div className="mt-2 font-display text-3xl font-bold text-primary">{totals.available}</div>
          </Card>
          <Card className="border-border/60 bg-gradient-card p-5">
            <div className="text-xs uppercase tracking-widest text-muted-foreground">Today's quota</div>
            <div className="mt-2 font-display text-2xl font-bold">
              <span className={usedToday >= dailyLimit ? "text-destructive" : "text-foreground"}>{usedToday}</span>
              <span className="text-muted-foreground"> / {dailyLimit}</span>
            </div>
            <div className="mt-1 text-[11px] text-muted-foreground">
              {Math.max(dailyLimit - usedToday, 0)} uploads left today (UTC)
            </div>
          </Card>
          <Card className="border-border/60 bg-gradient-card p-5">
            <div className="text-xs uppercase tracking-widest text-muted-foreground">Sold (all-time)</div>
            <div className="mt-2 font-display text-3xl font-bold">{totals.sold}</div>
          </Card>
          <Card className="border-border/60 bg-gradient-card p-5">
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs uppercase tracking-widest text-muted-foreground">
                Sold {soldPeriod === "today" ? "today" : "this week"}
              </div>
              <Select value={soldPeriod} onValueChange={(v) => setSoldPeriod(v as "today" | "week")}>
                <SelectTrigger className="h-7 w-[92px] border-border/60 px-2 text-[11px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="today">Today</SelectItem>
                  <SelectItem value="week">This week</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="mt-2 font-display text-3xl font-bold text-secondary">
              {soldPeriod === "today" ? soldToday : soldWeek}
            </div>
          </Card>
          <Card className="border-border/60 bg-gradient-card p-5">
            <div className="text-xs uppercase tracking-widest text-muted-foreground">Pending replacements</div>
            <div className="mt-2 font-display text-3xl font-bold text-warning">{pendingReplacements}</div>
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
          <div className="mt-2">
            <a
              href="/seller-stock-template.xlsx"
              download
              className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
            >
              <Download className="h-3 w-3" /> Download Excel template
            </a>
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-[1fr,auto]">
            <Select
              value={categoryId}
              onValueChange={handleCategoryChange}
              disabled={categoriesLoading || categories.length === 0 || uploading || !!parsed}
            >
              <SelectTrigger aria-label="Choose category">
                <SelectValue
                  placeholder={
                    categoriesLoading
                      ? "Loading categories…"
                      : categories.length === 0
                        ? "No categories available"
                        : "Choose category"
                  }
                />
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
            <Button
              type="button"
              variant="outline"
              disabled={!categoryId || uploading || categoriesLoading}
              onClick={() => {
                if (!categoryId) {
                  const msg = "Choose a category first";
                  setParseError(msg);
                  toast.error(msg);
                  return;
                }
                setParseError(null);
                fileRef.current?.click();
              }}
            >
              {uploading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <FileSpreadsheet className="mr-2 h-4 w-4" />
              )}
              {uploading ? "Uploading…" : "Pick file"}
            </Button>
          </div>
          {categoriesLoading && (
            <p className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" /> Loading your categories…
            </p>
          )}
          {categoriesError && (
            <div className="mt-2 flex items-center justify-between gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              <span className="flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" /> {categoriesError}
              </span>
              <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={loadAll}>
                Retry
              </Button>
            </div>
          )}
          {!categoriesLoading && !categoriesError && !categoryId && categories.length > 0 && (
            <p className="mt-2 text-xs text-warning">
              Choose a category above to enable file picker.
            </p>
          )}
          {parsed && !uploading && (
            <p className="mt-2 text-xs text-muted-foreground">
              Category locked while a parsed file is pending — discard it to switch.
            </p>
          )}
          {uploading && (
            <p className="mt-2 text-xs text-muted-foreground">
              Upload in progress — category change disabled.
            </p>
          )}
          {!categoriesLoading && !categoriesError && categories.length === 0 && (
            <p className="mt-2 text-xs text-destructive">
              No active categories yet. Ask admin to create one in Admin → Categories.
            </p>
          )}
          {parseError && (
            <div className="mt-2 flex items-center justify-between gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              <span className="flex items-center gap-2">
                <AlertTriangle className="h-3 w-3" /> {parseError}
              </span>
              {lastFile && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 gap-1 px-2 text-xs text-destructive hover:bg-destructive/20"
                  onClick={retryParsing}
                  disabled={uploading || uploadStep === "parsing" || uploadStep === "validating"}
                >
                  <RefreshCw className="h-3 w-3" /> Retry parsing
                </Button>
              )}
            </div>
          )}
          {uploadError && (
            <div className="mt-2 flex items-center justify-between gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              <span className="flex items-center gap-2">
                <AlertTriangle className="h-3 w-3" /> Upload failed: {uploadError}
              </span>
              <Button
                size="sm"
                variant="ghost"
                className="h-6 gap-1 px-2 text-xs text-destructive hover:bg-destructive/20"
                onClick={confirmUpload}
                disabled={uploading || !parsed}
              >
                <RefreshCw className="h-3 w-3" /> Retry upload
              </Button>
            </div>
          )}

          {(uploadStep !== "idle" || uploadProgress > 0) && (
            <div className="mt-4 rounded-md border border-border/60 bg-background/40 p-3">
              <div className="mb-2 flex items-center justify-between text-xs">
                <span className="font-medium">
                  {uploadStep === "error" ? (
                    <span className="text-destructive">Failed at: {parseError ? "validation" : "upload"}</span>
                  ) : (
                    <span>Step: {STEP_LABELS[uploadStep]}</span>
                  )}
                </span>
                <span className="text-muted-foreground">{uploadProgress}%</span>
              </div>
              <Progress value={uploadProgress} className="h-1.5" />
              <ol className="mt-3 grid grid-cols-4 gap-1 text-[10px]">
                {STEP_ORDER.filter((s) => s !== "done").map((s) => {
                  const idx = STEP_ORDER.indexOf(s);
                  const currentIdx = STEP_ORDER.indexOf(uploadStep);
                  const reached = uploadStep === "done" || (currentIdx >= idx && uploadStep !== "error");
                  const active = uploadStep === s;
                  return (
                    <li
                      key={s}
                      className={`rounded border px-1.5 py-1 text-center transition-colors ${
                        active
                          ? "border-primary/60 bg-primary/10 text-primary"
                          : reached
                            ? "border-success/40 bg-success/5 text-success"
                            : "border-border/60 text-muted-foreground"
                      }`}
                    >
                      {STEP_LABELS[s]}
                    </li>
                  );
                })}
              </ol>
            </div>
          )}

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
                <Button
                  variant="ghost"
                  onClick={() => {
                    setParsed(null);
                    setFileName("");
                    clearPersistedParsed();
                  }}
                  disabled={uploading}
                >
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
            <div
              data-replacement-table
              tabIndex={-1}
              aria-label="Filtered replacement issues"
              className={`overflow-x-auto rounded-md outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary/60 ${
                tableHighlight ? "animate-highlight-pulse ring-2 ring-primary/40" : ""
              }`}
            >
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

        {/* Replacement issues */}
        <Card ref={replacementsRef} className="mt-6 border-border/60 bg-gradient-card p-6 scroll-mt-24">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="font-display text-lg font-semibold">Replacement issues</div>
              <p className="text-xs text-muted-foreground">
                Buyer-reported problems on IDs you sold. Admin resolves each item.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Select value={exportWindow} onValueChange={(v) => setExportWindow(v as "all" | "in" | "out")}>
                <SelectTrigger className="w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">CSV: all rows</SelectItem>
                  <SelectItem value="in">CSV: in window</SelectItem>
                  <SelectItem value="out">CSV: out of window</SelectItem>
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                size="sm"
                onClick={openExportPreview}
                disabled={filteredReplacements.length === 0}
              >
                <Download className="mr-2 h-4 w-4" /> Export CSV
              </Button>
              <Select value={filterCategory} onValueChange={setFilterCategory}>
                <SelectTrigger className="w-44">
                  <SelectValue placeholder="Category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All categories</SelectItem>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={filterOutcome} onValueChange={setFilterOutcome}>
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="replaced">Replaced</SelectItem>
                  <SelectItem value="refunded">Refunded</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                  <SelectItem value="out_of_window">Out of window</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filterReason} onValueChange={setFilterReason}>
                <SelectTrigger className="w-44">
                  <SelectValue placeholder="Reason" />
                </SelectTrigger>
                <SelectContent>
                  {REASON_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={sortOrder} onValueChange={(v) => setSortOrder(v as "newest" | "oldest")}>
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="newest">Newest first</SelectItem>
                  <SelectItem value="oldest">Oldest first</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {replacementsByCategory.length > 0 && (
            <div className="mb-6 rounded-md border border-border/60 bg-background/40 p-4">
              <div className="mb-2 flex items-center justify-between">
                <div className="text-sm font-medium">Issues by category</div>
                <div className="text-xs text-muted-foreground">
                  {filteredReplacements.length} total · current filters
                </div>
              </div>
              <div className="h-48 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={replacementsByCategory}
                    margin={{ top: 4, right: 8, bottom: 4, left: -16 }}
                    onClick={handleChartBarClick}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                    <XAxis
                      dataKey="name"
                      tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
                      axisLine={{ stroke: "hsl(var(--border))" }}
                      tickLine={false}
                      interval={0}
                    />
                    <YAxis
                      allowDecimals={false}
                      tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
                      axisLine={{ stroke: "hsl(var(--border))" }}
                      tickLine={false}
                    />
                    <Tooltip
                      cursor={{ fill: "hsl(var(--muted) / 0.3)" }}
                      contentStyle={{
                        background: "hsl(var(--background))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: 8,
                        fontSize: 12,
                      }}
                    />
                    <Bar
                      dataKey="count"
                      fill="hsl(var(--primary))"
                      radius={[4, 4, 0, 0]}
                      cursor="pointer"
                      onClick={handleChartBarClick}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {filteredReplacements.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No replacement issues match these filters.
            </p>
          ) : (
            <div
              data-replacement-table
              tabIndex={-1}
              aria-label="Filtered replacement issues"
              className={`overflow-x-auto rounded-md outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary/60 ${
                tableHighlight ? "animate-highlight-pulse ring-2 ring-primary/40" : ""
              }`}
            >
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>UID</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Window</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead>Filed</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredReplacements.slice(0, 50).map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-mono text-xs">{r.reported_uid}</TableCell>
                      <TableCell>
                        <Badge
                          className={
                            r.outcome === "pending"
                              ? "bg-warning/20 text-warning hover:bg-warning/20 capitalize"
                              : r.outcome === "replaced" || r.outcome === "refunded"
                              ? "bg-success/20 text-success hover:bg-success/20 capitalize"
                              : r.outcome === "rejected"
                              ? "bg-destructive/20 text-destructive hover:bg-destructive/20 capitalize"
                              : "bg-muted text-muted-foreground capitalize"
                          }
                        >
                          {r.outcome.replace("_", " ")}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs">
                        {r.in_window ? (
                          <span className="text-success">in window</span>
                        ) : (
                          <span className="text-muted-foreground">out</span>
                        )}
                      </TableCell>
                      <TableCell className="max-w-[280px] truncate text-xs text-muted-foreground">
                        {r.outcome_reason ?? "—"}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {new Date(r.created_at).toLocaleString()}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {filteredReplacements.length > 50 && (
                <div className="border-t border-border/60 px-4 py-2 text-xs text-muted-foreground">
                  Showing first 50 of {filteredReplacements.length}
                </div>
              )}
            </div>
          )}

          <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
            <DialogContent className="max-w-3xl">
              <DialogHeader>
                <DialogTitle>Export preview</DialogTitle>
                <DialogDescription>
                  {(() => {
                    const rows = getExportRows();
                    return `${rows.length} row${rows.length === 1 ? "" : "s"} will be exported · showing first ${Math.min(20, rows.length)}`;
                  })()}
                </DialogDescription>
              </DialogHeader>
              <div className="max-h-[60vh] overflow-auto rounded-md border border-border/60">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>UID</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Window</TableHead>
                      <TableHead>Reason</TableHead>
                      <TableHead>Filed</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {getExportRows().slice(0, 20).map((r) => {
                      const catId = r.account_id ? accountCategoryMap[r.account_id] : undefined;
                      const catName =
                        (catId && categories.find((c) => c.id === catId)?.name) || "Unknown";
                      return (
                        <TableRow key={r.id}>
                          <TableCell className="font-mono text-xs">{r.reported_uid}</TableCell>
                          <TableCell className="text-xs">{catName}</TableCell>
                          <TableCell className="text-xs capitalize">{r.outcome.replace("_", " ")}</TableCell>
                          <TableCell className="text-xs">{r.in_window ? "in" : "out"}</TableCell>
                          <TableCell className="max-w-[240px] truncate text-xs text-muted-foreground">
                            {r.outcome_reason ?? "—"}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {new Date(r.created_at).toLocaleString()}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
                {getExportRows().length === 0 && (
                  <p className="py-6 text-center text-sm text-muted-foreground">
                    No rows match the current filters and window option.
                  </p>
                )}
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setPreviewOpen(false)}>Cancel</Button>
                <Button
                  onClick={exportReplacementsCsv}
                  disabled={getExportRows().length === 0}
                  className="bg-gradient-brand text-primary-foreground hover:opacity-90"
                >
                  <Download className="mr-2 h-4 w-4" /> Download CSV
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </Card>
      </main>
    </div>
  );
};

export default SellerDashboard;