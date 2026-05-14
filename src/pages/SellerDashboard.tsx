import { useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import * as XLSX from "xlsx";
import { useAuth } from "@/hooks/useAuth";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
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
import { ArrowLeft, Upload, FileSpreadsheet, Loader2, CheckCircle2, AlertTriangle, Download, Copy, Eye, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { AppShell } from "@/components/layout/AppShell";
import { parseSellerUpload } from "@/lib/parseSellerUpload";
import { SampleFormatHelp } from "@/components/seller/SampleFormatHelp";
import { MessagesPanel } from "@/components/MessagesPanel";
import { NotificationPrefsPanel } from "@/components/NotificationPrefsPanel";
import { NoticesBoard } from "@/components/NoticesBoard";
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

type UploadValidationRule = "in_stock" | "in_file" | "already_replaced" | "category_mismatch";

interface DuplicateInfo {
  duplicatesInFile: string[]; // duplicate within uploaded file
  duplicatesInStock: string[]; // already in seller's existing accounts
  duplicatesReplaced: string[]; // uid already exists in any account marked 'replaced' (own or other sellers)
  invalidCategoryUids: string[]; // UID does not match selected category base (61xxx / 1000xxx)
  categoryBase: string | null;
  ruleByUid: Record<string, UploadValidationRule>;
  checkedAt: number;
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
  const { user, profile, roles, loading: authLoading } = useAuth();
  const navigate = useNavigate();
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
  const [skipDuplicates, setSkipDuplicates] = useState(true);
  const [dupModalOpen, setDupModalOpen] = useState(false);
  const [dupModalPage, setDupModalPage] = useState(1);
  const [dupModalTab, setDupModalTab] = useState<"stock" | "file" | "replaced" | "category">("stock");
  const [recheckLoading, setRecheckLoading] = useState(false);
  const [audits, setAudits] = useState<any[]>([]);
  const [auditsLoading, setAuditsLoading] = useState(false);
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

  // First-time auto-redirect to onboarding wizard.
  // Skip if already onboarded (profiles.buyer_settings.seller_onboarded_at exists)
  // or admin (admins don't need the seller wizard).
  useEffect(() => {
    if (!user || authLoading) return;
    if (!roles.includes("seller")) return; // admins skip
    const onboarded =
      (profile?.buyer_settings as any)?.seller_onboarded_at ||
      (profile?.buyer_settings as any)?.seller_onboarded;
    if (!onboarded) {
      navigate("/seller/onboarding", { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, authLoading, roles.join(","), profile?.buyer_settings]);

  // Pre-select category chosen during onboarding wizard
  useEffect(() => {
    const pre = sessionStorage.getItem("seller_default_category");
    if (pre) {
      setCategoryId(pre);
      sessionStorage.removeItem("seller_default_category");
    }
  }, []);

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
    let data: any;
    try {
      data = await api.get<any>("/api/seller/overview");
    } catch (err: any) {
      setCategoriesError(err?.message || "Failed to load");
      setCategoriesLoading(false);
      return;
    }
    const cats = data.categories as any[];
    const myAccounts = data.my_accounts as any[];
    const recentRows = data.recent as any[];
    setCategories((cats ?? []) as Category[]);
    setCategoriesLoading(false);
    setSoldToday(Number(data.sold_today ?? 0));
    setSoldWeek(Number(data.sold_week ?? 0));
    setReplacements((data.replacements ?? []) as ReplacementRow[]);
    setDailyLimit(Number(data.daily_limit ?? 0));
    setUsedToday(Number(data.used_today ?? 0));

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
    const t = setInterval(loadAll, 30_000);
    return () => clearInterval(t);
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

  // Inspect normalized rows and classify each colliding UID against latest DB state.
  // Returns null on DB error (after surfacing toast / parseError).
  const detectDuplicates = async (rows: ParsedRow[]): Promise<DuplicateInfo | null> => {
    const seen = new Set<string>();
    const dupInFile = new Set<string>();
    for (const r of rows) {
      if (seen.has(r.uid)) dupInFile.add(r.uid);
      else seen.add(r.uid);
    }
    const dupInStock = new Set<string>();
    const dupReplaced = new Set<string>();
    const invalidCategory = new Set<string>();
    const selectedCategory = categories.find((c) => c.id === categoryId);
    const categoryBase = selectedCategory?.slug?.match(/^((?:61|1000)\d*)x{2,}$/i)?.[1]
      ?? selectedCategory?.name?.toLowerCase().match(/((?:61|1000)\d*)x{2,}/i)?.[1]
      ?? null;
    if (user) {
      const uidList = Array.from(seen);
      const CHUNK = 500;
      for (let i = 0; i < uidList.length; i += CHUNK) {
        const slice = uidList.slice(i, i + CHUNK);
        try {
          const duplicateCheck = await api.post<{
            rows: { uid: string; status: string; seller_id: string }[];
            self_id: string;
            invalid_category_uids?: string[];
          }>("/api/seller/check-uids", { uids: slice, category_id: categoryId });
          const existing = duplicateCheck.rows ?? [];
          const self_id = duplicateCheck.self_id;
          for (const uid of duplicateCheck.invalid_category_uids ?? []) invalidCategory.add(String(uid));
          for (const row of existing ?? []) {
            const uid = String(row.uid);
            if (row.status === "replaced") {
              dupReplaced.add(uid);
            } else if (row.seller_id === self_id) {
              dupInStock.add(uid);
            } else {
              dupInStock.add(uid);
            }
          }
        } catch (e: any) {
          const msg = "Could not verify duplicates: " + (e?.message || "error");
          setParseError(msg);
          setUploadStep("error");
          toast.error(msg);
          return null;
        }
      }
    }
    // Build rule map. Priority: already_replaced > in_stock > in_file
    const ruleByUid: Record<string, UploadValidationRule> = {};
    dupInFile.forEach((u) => { ruleByUid[u] = "in_file"; });
    dupInStock.forEach((u) => { ruleByUid[u] = "in_stock"; });
    dupReplaced.forEach((u) => { ruleByUid[u] = "already_replaced"; });
    invalidCategory.forEach((u) => { ruleByUid[u] = "category_mismatch"; });
    return {
      duplicatesInFile: Array.from(dupInFile),
      duplicatesInStock: Array.from(dupInStock),
      duplicatesReplaced: Array.from(dupReplaced),
      invalidCategoryUids: Array.from(invalidCategory),
      categoryBase,
      ruleByUid,
      checkedAt: Date.now(),
    };
  };

  const recheckDuplicates = async () => {
    if (!parsed) return;
    setRecheckLoading(true);
    const info = await detectDuplicates(parsed);
    setRecheckLoading(false);
    if (!info) return;
    setDuplicates(info);
    const total =
      info.duplicatesInFile.length +
      info.duplicatesInStock.length +
      info.duplicatesReplaced.length +
      info.invalidCategoryUids.length;
    toast.success(
      total === 0
        ? "Recheck complete — no duplicate or category issues left."
        : `Recheck complete — ${total} UID issue${total > 1 ? "s" : ""} flagged with latest stock state.`,
    );
  };

  const loadAudits = async () => {
    if (!user) return;
    setAuditsLoading(true);
    try {
      const { audits } = await api.get<{ audits: any[] }>("/api/seller/uploads");
      setAudits(audits ?? []);
    } catch (e: any) {
      toast.error("Failed to load upload history: " + (e?.message || "error"));
    } finally {
      setAuditsLoading(false);
    }
  };

  useEffect(() => {
    if (user) loadAudits();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

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

      // Smart parser: handles named-header layout + headerless 3-col cookie format
      // (auto-extracts UID from `c_user=` and recovers from Excel scientific notation).
      const matrix: any[][] = XLSX.utils.sheet_to_json(ws, {
        header: 1,
        defval: "",
        raw: false, // force string conversion so 1.00093E+14 stays as text
      }) as any[][];
      const result = parseSellerUpload(matrix);
      if (result.ok === false) {
        const msg =
          result.reason === "empty"
            ? "The file appears to be empty."
            : result.detail || "Format not recognised.";
        setParseError(msg);
        setUploadStep("error");
        toast.error(msg);
        setParsed(null);
        return;
      }
      const normalized: ParsedRow[] = result.rows.map((r) => ({
        uid: r.uid,
        password: r.password,
        two_fa: r.two_fa,
        email: r.email,
        email_password: r.email_password,
      }));
      if (result.recoveredFromCookie > 0) {
        toast.message(
          `Recovered ${result.recoveredFromCookie} UID${
            result.recoveredFromCookie > 1 ? "s" : ""
          } from cookies (Excel scientific-notation auto-fixed).`,
        );
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

      const dupInfo = await detectDuplicates(normalized);
      if (!dupInfo) {
        setParsed(null);
        return;
      }
      setDuplicates(dupInfo);
      setParsed(normalized);
      persistParsed(normalized, file.name, categoryId);
      setUploadStep("idle");
      const dupTotal =
        dupInfo.duplicatesInFile.length +
        dupInfo.duplicatesInStock.length +
        dupInfo.duplicatesReplaced.length +
        dupInfo.invalidCategoryUids.length;
      if (dupTotal > 0) {
        toast.warning(
          `Parsed ${normalized.length} rows. ${dupTotal} UID issue${dupTotal > 1 ? "s" : ""} detected — review before confirm.`,
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
    // Final safety net: recheck duplicates against latest stock right before insert.
    // If new collisions appeared since the modal/last check, BLOCK and surface them.
    setUploadStep("validating");
    setUploadError(null);
    const prevDupSet = new Set<string>([
      ...(duplicates?.duplicatesInStock ?? []),
      ...(duplicates?.duplicatesInFile ?? []),
      ...(duplicates?.duplicatesReplaced ?? []),
      ...(duplicates?.invalidCategoryUids ?? []),
    ]);
    const fresh = await detectDuplicates(parsed);
    if (!fresh) {
      // detectDuplicates already surfaced the error
      return;
    }
    setDuplicates(fresh);
    if (fresh.invalidCategoryUids.length > 0) {
      const sample = fresh.invalidCategoryUids.slice(0, 5).join(", ");
      const more = fresh.invalidCategoryUids.length > 5 ? ` (+${fresh.invalidCategoryUids.length - 5} more)` : "";
      const msg = `Category mismatch: ${fresh.invalidCategoryUids.length} UID${fresh.invalidCategoryUids.length > 1 ? "s" : ""} do not match ${fresh.categoryBase ?? "the selected category"}. Fix the file or choose the correct category. ${sample}${more}`;
      setUploadError(msg);
      setUploadStep("error");
      toast.error(msg, { duration: 8000 });
      setDupModalTab("category");
      setDupModalPage(1);
      setDupModalOpen(true);
      return;
    }
    const freshDupSet = new Set<string>([
      ...fresh.duplicatesInStock,
      ...fresh.duplicatesInFile,
      ...fresh.duplicatesReplaced,
      ...fresh.invalidCategoryUids,
    ]);
    const newCollisions: string[] = [];
    freshDupSet.forEach((u) => { if (!prevDupSet.has(u)) newCollisions.push(u); });
    if (newCollisions.length > 0) {
      const sample = newCollisions.slice(0, 5).join(", ");
      const more = newCollisions.length > 5 ? ` (+${newCollisions.length - 5} more)` : "";
      const msg = `Recheck found ${newCollisions.length} NEW duplicate UID${
        newCollisions.length > 1 ? "s" : ""
      } since you opened the review. Review the duplicates panel and confirm again. New: ${sample}${more}`;
      setUploadError(msg);
      setUploadStep("error");
      toast.error(msg, { duration: 8000 });
      setDupModalTab(
        fresh.invalidCategoryUids.length > 0
          ? "category"
          : fresh.duplicatesInStock.length > 0
          ? "stock"
          : fresh.duplicatesReplaced.length > 0
            ? "replaced"
            : "file",
      );
      setDupModalPage(1);
      setDupModalOpen(true);
      return;
    }
    setUploadStep("idle");
    // Apply client-side dedup based on user's choice
    const dupSet = new Set<string>([
      ...fresh.duplicatesInStock,
      ...fresh.duplicatesInFile,
      ...fresh.duplicatesReplaced,
      ...fresh.invalidCategoryUids,
    ]);
    let rowsToSend = parsed;
    if (skipDuplicates && dupSet.size > 0) {
      const seenLocal = new Set<string>();
      rowsToSend = parsed.filter((r) => {
        if (dupSet.has(r.uid)) return false;
        if (seenLocal.has(r.uid)) return false;
        seenLocal.add(r.uid);
        return true;
      });
    }
    if (rowsToSend.length === 0) {
      const msg = "Nothing left to upload after skipping duplicates.";
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
    let r: any;
    try {
      r = await api.post<any>("/api/seller/accounts", {
        category_id: categoryId,
        rows: rowsToSend,
        file_name: fileName || undefined,
        skip_duplicates: skipDuplicates,
      });
    } catch (e: any) {
      window.clearInterval(tick);
      setUploading(false);
      const m = e?.message || "Upload failed";
      setUploadError(m);
      setUploadStep("error");
      toast.error(m);
      return;
    }
    window.clearInterval(tick);
    setUploadProgress(100);
    setUploadStep("confirming");
    setUploading(false);
    const overLimit = Number(r.over_limit_skipped ?? 0);
    const inserted = Number(r.rows_inserted ?? 0);
    const dupCount =
      Number(r.duplicates_in_file ?? 0) +
      Number(r.duplicates_in_stock ?? 0) +
      Number(r.duplicates_already_replaced ?? 0);
    const invalid = Number(r.invalid_rows ?? 0);
    let msg = `Inserted ${inserted} new IDs. Duplicates: ${dupCount}, invalid: ${invalid}.`;
    if (overLimit > 0) {
      msg += ` ${overLimit} rows skipped — daily limit reached.`;
      toast.warning(msg);
    } else {
      toast.success(msg);
    }
    loadAudits();

    setParsed(null);
    setFileName("");
    clearPersistedParsed();
    setLastFile(null);
    setDuplicates(null);
    setDupModalOpen(false);
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
  if (!user) return <Navigate to="/login" replace />;
  if (!isSeller) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <Card className="max-w-md glass-panel border-0 p-8 text-center">
          <AlertTriangle className="mx-auto h-10 w-10 text-warning" />
          <h2 className="mt-4 font-display text-xl font-semibold">Seller access required</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Your account doesn't have seller permissions yet. Submit an application — admin approval takes a few hours.
          </p>
          <div className="mt-6 flex flex-col gap-2">
            <Button asChild className="btn-gold" size="lg">
              <Link to="/apply-seller">Apply to become a seller</Link>
            </Button>
            <Button asChild variant="ghost" size="sm">
              <Link to="/dashboard">Back to dashboard</Link>
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <AppShell
      mode="seller"
      title="Seller workspace"
      subtitle="Upload your stock as Excel — UID + Password required, 2FA & email optional. Globally duplicate UIDs are skipped automatically."
      actions={
        <Button
          variant="outline"
          size="sm"
          onClick={() => navigate("/seller/onboarding")}
          className="border-primary/40 text-primary hover:bg-primary/10"
        >
          <Sparkles className="mr-1.5 h-3.5 w-3.5" /> Setup wizard
        </Button>
      }
    >
        <div className="mb-6"><NoticesBoard title="Seller notices" /></div>

        {/* Stats */}
        <div className="mb-6 grid gap-4 md:grid-cols-3 lg:grid-cols-6">
          <Card className="glass-panel border-0 p-5">
            <div className="text-xs uppercase tracking-widest text-muted-foreground">Available stock</div>
            <div className="mt-2 font-display text-3xl font-bold text-primary">{totals.available}</div>
          </Card>
          <Card className="glass-panel border-0 p-5">
            <div className="text-xs uppercase tracking-widest text-muted-foreground">Today's quota</div>
            <div className="mt-2 font-display text-2xl font-bold">
              <span className={usedToday >= dailyLimit ? "text-destructive" : "text-foreground"}>{usedToday}</span>
              <span className="text-muted-foreground"> / {dailyLimit}</span>
            </div>
            <div className="mt-1 text-[11px] text-muted-foreground">
              {Math.max(dailyLimit - usedToday, 0)} uploads left today (UTC)
            </div>
          </Card>
          <Card className="glass-panel border-0 p-5">
            <div className="text-xs uppercase tracking-widest text-muted-foreground">Sold (all-time)</div>
            <div className="mt-2 font-display text-3xl font-bold">{totals.sold}</div>
          </Card>
          <Card className="glass-panel border-0 p-5">
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
          <Card className="glass-panel border-0 p-5">
            <div className="text-xs uppercase tracking-widest text-muted-foreground">Pending replacements</div>
            <div className="mt-2 font-display text-3xl font-bold text-warning">{pendingReplacements}</div>
          </Card>
          <Card className="glass-panel border-0 p-5">
            <div className="text-xs uppercase tracking-widest text-muted-foreground">Categories</div>
            <div className="mt-2 font-display text-3xl font-bold">{categories.length}</div>
          </Card>
        </div>

        {/* Upload */}
        <Card className="mb-6 glass-panel border-0 p-6">
          <div className="font-display text-lg font-semibold">Upload stock</div>
          <p className="text-xs text-muted-foreground">
            Excel or CSV columns expected: <code>UID</code>, <code>Password</code>,{" "}
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
            <div className="mt-2 space-y-3">
              <div className="flex items-center justify-between gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
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
              <SampleFormatHelp message={parseError} />
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
              {duplicates && (() => {
                const dupStockCount = duplicates.duplicatesInStock.length;
                const dupFileCount = duplicates.duplicatesInFile.length;
                const dupReplacedCount = duplicates.duplicatesReplaced.length;
                const categoryMismatchCount = duplicates.invalidCategoryUids.length;
                const totalDup = dupStockCount + dupFileCount + dupReplacedCount + categoryMismatchCount;
                const uniqueDupSet = new Set<string>([
                  ...duplicates.duplicatesInStock,
                  ...duplicates.duplicatesInFile,
                  ...duplicates.duplicatesReplaced,
                  ...duplicates.invalidCategoryUids,
                ]);
                // rows that survive client-side skip (also dedup intra-file)
                const seenLocal = new Set<string>();
                const willInsert = parsed.filter((r) => {
                  if (uniqueDupSet.has(r.uid)) return false;
                  if (seenLocal.has(r.uid)) return false;
                  seenLocal.add(r.uid);
                  return true;
                }).length;
                const willSend = skipDuplicates ? willInsert : parsed.length;
                if (totalDup === 0) return null;
                return (
                  <div className="rounded-md border border-warning/40 bg-warning/10 p-3 text-xs">
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2 font-medium text-warning">
                        <AlertTriangle className="h-4 w-4" />
                        Duplicate UID warning
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 gap-1 px-2 text-xs"
                          onClick={recheckDuplicates}
                          disabled={recheckLoading || uploading}
                        >
                          {recheckLoading ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <RefreshCw className="h-3 w-3" />
                          )}
                          Recheck duplicates
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 gap-1 px-2 text-xs"
                          onClick={() => {
                            setDupModalTab(
                              categoryMismatchCount > 0 ? "category" : dupStockCount > 0 ? "stock" : dupFileCount > 0 ? "file" : "replaced",
                            );
                            setDupModalPage(1);
                            setDupModalOpen(true);
                          }}
                        >
                          <Eye className="h-3 w-3" /> View full duplicates
                        </Button>
                      </div>
                    </div>
                    <div className="grid gap-2 text-[11px] sm:grid-cols-4">
                      <div className="rounded border border-border/60 bg-background/40 p-2">
                        <div className="text-muted-foreground">Wrong category</div>
                        <div className="font-display text-base font-semibold">{categoryMismatchCount}</div>
                      </div>
                      <div className="rounded border border-border/60 bg-background/40 p-2">
                        <div className="text-muted-foreground">Already in your stock</div>
                        <div className="font-display text-base font-semibold">{dupStockCount}</div>
                      </div>
                      <div className="rounded border border-border/60 bg-background/40 p-2">
                        <div className="text-muted-foreground">Repeated in file</div>
                        <div className="font-display text-base font-semibold">{dupFileCount}</div>
                      </div>
                      <div className="rounded border border-border/60 bg-background/40 p-2">
                        <div className="text-muted-foreground">Already replaced</div>
                        <div className="font-display text-base font-semibold">{dupReplacedCount}</div>
                      </div>
                    </div>
                    <div className="mt-2 text-[10px] text-muted-foreground">
                      Last checked: {new Date(duplicates.checkedAt).toLocaleTimeString()} ·
                      Click <strong>Recheck duplicates</strong> right before Confirm to re-query latest stock.
                    </div>
                    <div className="mt-3 flex items-start justify-between gap-3 rounded-md border border-border/60 bg-background/40 p-2">
                      <div className="flex-1">
                        <Label htmlFor="skip-dup" className="text-[11px] font-medium">
                          Skip duplicates automatically
                        </Label>
                        <p className="mt-0.5 text-[10px] text-muted-foreground">
                          ON: client filters duplicates before sending — safer & faster.
                          OFF: send everything; server will still skip — useful for full server-side audit.
                          Overwriting existing UIDs is not supported (they may already be sold).
                        </p>
                      </div>
                      <Switch
                        id="skip-dup"
                        checked={skipDuplicates}
                        onCheckedChange={setSkipDuplicates}
                        disabled={uploading}
                      />
                    </div>
                    <div className="mt-2 rounded border border-primary/30 bg-primary/5 p-2 text-[11px]">
                      <span className="font-medium text-primary">Upload summary:</span>{" "}
                      Will send <strong>{willSend}</strong> row{willSend === 1 ? "" : "s"} ·
                      Estimated insert: <strong>{willInsert}</strong> ·
                      Skipped: <strong>{parsed.length - willSend}</strong>
                      {!skipDuplicates && totalDup > 0 && (
                        <span className="text-muted-foreground"> (server will reject {totalDup} duplicates)</span>
                      )}
                    </div>
                  </div>
                );
              })()}
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
                    setDuplicates(null);
                  }}
                  disabled={uploading}
                >
                  Discard
                </Button>
                <Button
                  onClick={confirmUpload}
                  disabled={
                    uploading ||
                    !categoryId ||
                    uploadStep === "parsing" ||
                    uploadStep === "validating" ||
                    uploadStep === "uploading" ||
                    uploadStep === "confirming"
                  }
                  className="btn-gold"
                >
                  {uploading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  <Upload className="mr-2 h-4 w-4" /> Confirm upload
                </Button>
              </div>
            </div>
          )}
        </Card>

        {/* Per-category stock */}
        <Card className="mb-6 glass-panel border-0 p-6">
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
        <Card className="glass-panel border-0 p-6">
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

        {/* Upload audit history */}
        <Card className="mt-6 glass-panel border-0 p-6">
          <div className="mb-4 flex items-center justify-between gap-2">
            <div>
              <div className="font-display text-lg font-semibold">Upload history</div>
              <p className="text-xs text-muted-foreground">
                Per Confirm Upload: how many rows were sent, inserted, and skipped (with reason).
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={audits.length === 0}
                onClick={() => {
                  const a = audits[0];
                  if (!a) return;
                  const headers = [
                    "When",
                    "Category",
                    "File",
                    "Rows in file",
                    "Rows sent",
                    "Rows inserted",
                    "Skipped (duplicates in stock)",
                    "Skipped (duplicates in file)",
                    "Skipped (already replaced)",
                    "Skipped (over daily limit)",
                    "Invalid rows",
                    "Skip duplicates setting",
                  ];
                  const escape = (v: string | number | null | undefined) => {
                    const s = v == null ? "" : String(v);
                    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
                  };
                  const row = [
                    new Date(a.created_at).toISOString(),
                    a.category_name ?? "",
                    a.file_name ?? "",
                    a.rows_in_file,
                    a.rows_sent,
                    a.rows_inserted,
                    a.duplicates_in_stock,
                    a.duplicates_in_file,
                    a.duplicates_already_replaced,
                    a.over_limit_skipped,
                    a.invalid_rows,
                    a.skip_duplicates_setting ? "on" : "off",
                  ];
                  const csv =
                    headers.join(",") + "\n" + row.map(escape).join(",") + "\n";
                  const blob = new Blob(["\ufeff" + csv], {
                    type: "text/csv;charset=utf-8;",
                  });
                  const url = URL.createObjectURL(blob);
                  const link = document.createElement("a");
                  link.href = url;
                  const stamp = new Date(a.created_at)
                    .toISOString()
                    .replace(/[:.]/g, "-");
                  link.download = `last-upload-${stamp}.csv`;
                  document.body.appendChild(link);
                  link.click();
                  document.body.removeChild(link);
                  URL.revokeObjectURL(url);
                  toast.success("Exported last upload");
                }}
              >
                <Download className="mr-1 h-3 w-3" /> Download last upload CSV
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={audits.length === 0}
                onClick={() => {
                  const headers = [
                    "When",
                    "Category",
                    "File",
                    "Rows in file",
                    "Rows sent",
                    "Rows inserted",
                    "Duplicates in stock",
                    "Duplicates in file",
                    "Duplicates already replaced",
                    "Invalid rows",
                    "Over-limit skipped",
                    "Skip duplicates setting",
                  ];
                  const escape = (v: string | number | null | undefined) => {
                    const s = v == null ? "" : String(v);
                    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
                  };
                  const lines = [headers.join(",")];
                  audits.forEach((a) => {
                    lines.push(
                      [
                        new Date(a.created_at).toISOString(),
                        a.category_name ?? "",
                        a.file_name ?? "",
                        a.rows_in_file,
                        a.rows_sent,
                        a.rows_inserted,
                        a.duplicates_in_stock,
                        a.duplicates_in_file,
                        a.duplicates_already_replaced,
                        a.invalid_rows,
                        a.over_limit_skipped,
                        a.skip_duplicates_setting ? "on" : "off",
                      ]
                        .map(escape)
                        .join(","),
                    );
                  });
                  const blob = new Blob(["\ufeff" + lines.join("\n")], {
                    type: "text/csv;charset=utf-8;",
                  });
                  const url = URL.createObjectURL(blob);
                  const link = document.createElement("a");
                  link.href = url;
                  link.download = `upload-history-${new Date().toISOString().slice(0, 10)}.csv`;
                  document.body.appendChild(link);
                  link.click();
                  document.body.removeChild(link);
                  URL.revokeObjectURL(url);
                  toast.success(`Exported ${audits.length} upload row${audits.length === 1 ? "" : "s"}`);
                }}
              >
                <Download className="mr-1 h-3 w-3" /> Download CSV
              </Button>
              <Button size="sm" variant="outline" onClick={loadAudits} disabled={auditsLoading}>
                {auditsLoading ? (
                  <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                ) : (
                  <RefreshCw className="mr-1 h-3 w-3" />
                )}
                Refresh
              </Button>
            </div>
          </div>
          {audits.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              No uploads recorded yet.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>When</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>File</TableHead>
                    <TableHead className="text-right">In file</TableHead>
                    <TableHead className="text-right">Sent</TableHead>
                    <TableHead className="text-right">Inserted</TableHead>
                    <TableHead className="text-right">Dup (stock)</TableHead>
                    <TableHead className="text-right">Dup (file)</TableHead>
                    <TableHead className="text-right">Dup (replaced)</TableHead>
                    <TableHead className="text-right">Invalid</TableHead>
                    <TableHead className="text-right">Over limit</TableHead>
                    <TableHead>Skip mode</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {audits.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                        {new Date(a.created_at).toLocaleString()}
                      </TableCell>
                      <TableCell className="text-xs">{a.category_name ?? "—"}</TableCell>
                      <TableCell className="max-w-[180px] truncate font-mono text-xs">
                        {a.file_name ?? "—"}
                      </TableCell>
                      <TableCell className="text-right text-xs">{a.rows_in_file}</TableCell>
                      <TableCell className="text-right text-xs">{a.rows_sent}</TableCell>
                      <TableCell className="text-right text-xs font-semibold text-success">
                        {a.rows_inserted}
                      </TableCell>
                      <TableCell className="text-right text-xs">{a.duplicates_in_stock}</TableCell>
                      <TableCell className="text-right text-xs">{a.duplicates_in_file}</TableCell>
                      <TableCell className="text-right text-xs">{a.duplicates_already_replaced}</TableCell>
                      <TableCell className="text-right text-xs">{a.invalid_rows}</TableCell>
                      <TableCell className="text-right text-xs">{a.over_limit_skipped}</TableCell>
                      <TableCell className="text-xs">
                        <Badge variant="outline" className="text-[10px]">
                          {a.skip_duplicates_setting ? "skip on" : "skip off"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </Card>

        {/* Replacement issues */}
        <Card ref={replacementsRef} className="mt-6 glass-panel border-0 p-6 scroll-mt-24">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="font-display text-lg font-semibold">Replacement issues <span className="ml-2 rounded-md bg-muted px-2 py-0.5 text-xs font-normal text-muted-foreground">View only</span></div>
              <p className="text-xs text-muted-foreground">
                Buyer-reported problems on IDs you sold. Only admin can resolve — you cannot accept or reject.
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
                  className="btn-gold"
                >
                  <Download className="mr-2 h-4 w-4" /> Download CSV
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </Card>

        {/* Duplicate UID inspection modal */}
        <Dialog
          open={dupModalOpen}
          onOpenChange={(o) => {
            setDupModalOpen(o);
            if (!o) setDupModalPage(1);
          }}
        >
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Duplicate UIDs</DialogTitle>
              <DialogDescription>
                Review every duplicate before confirming. Use Copy to paste into a sheet for cleanup.
              </DialogDescription>
            </DialogHeader>
            {duplicates && (() => {
              const list =
                dupModalTab === "category"
                  ? duplicates.invalidCategoryUids
                  : dupModalTab === "stock"
                  ? duplicates.duplicatesInStock
                  : dupModalTab === "file"
                    ? duplicates.duplicatesInFile
                    : duplicates.duplicatesReplaced;
              const PAGE_SIZE = 50;
              const totalPages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
              const page = Math.min(Math.max(1, dupModalPage), totalPages);
              const start = (page - 1) * PAGE_SIZE;
              const slice = list.slice(start, start + PAGE_SIZE);
              const copyAll = async () => {
                try {
                  await navigator.clipboard.writeText(list.join("\n"));
                  toast.success(`Copied ${list.length} UID${list.length === 1 ? "" : "s"} to clipboard`);
                } catch {
                  toast.error("Clipboard blocked — select text manually");
                }
              };
              const ruleLabel: Record<string, { label: string; cls: string }> = {
                in_stock: { label: "In stock", cls: "bg-warning/20 text-warning" },
                in_file: { label: "Repeated in file", cls: "bg-muted text-muted-foreground" },
                already_replaced: { label: "Already replaced", cls: "bg-destructive/20 text-destructive" },
                category_mismatch: { label: "Wrong category", cls: "bg-destructive/20 text-destructive" },
              };
              return (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      size="sm"
                      variant={dupModalTab === "category" ? "default" : "outline"}
                      onClick={() => { setDupModalTab("category"); setDupModalPage(1); }}
                    >
                      Wrong category ({duplicates.invalidCategoryUids.length})
                    </Button>
                    <Button
                      size="sm"
                      variant={dupModalTab === "stock" ? "default" : "outline"}
                      onClick={() => { setDupModalTab("stock"); setDupModalPage(1); }}
                    >
                      In your stock ({duplicates.duplicatesInStock.length})
                    </Button>
                    <Button
                      size="sm"
                      variant={dupModalTab === "file" ? "default" : "outline"}
                      onClick={() => { setDupModalTab("file"); setDupModalPage(1); }}
                    >
                      Repeated in file ({duplicates.duplicatesInFile.length})
                    </Button>
                    <Button
                      size="sm"
                      variant={dupModalTab === "replaced" ? "default" : "outline"}
                      onClick={() => { setDupModalTab("replaced"); setDupModalPage(1); }}
                    >
                      Already replaced ({duplicates.duplicatesReplaced.length})
                    </Button>
                    <div className="ml-auto">
                      <Button
                        size="sm"
                        variant="outline"
                        className="mr-2 gap-1"
                        onClick={recheckDuplicates}
                        disabled={recheckLoading}
                      >
                        {recheckLoading ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <RefreshCw className="h-3 w-3" />
                        )}
                        Recheck
                      </Button>
                      <Button size="sm" variant="outline" className="gap-1" onClick={copyAll} disabled={list.length === 0}>
                        <Copy className="h-3 w-3" /> Copy {list.length}
                      </Button>
                    </div>
                  </div>
                  {list.length === 0 ? (
                    <div className="rounded-md border border-border/60 bg-background/40 p-6 text-center text-sm text-muted-foreground">
                      No duplicates in this category.
                    </div>
                  ) : (
                    <>
                      <div className="max-h-72 overflow-auto rounded-md border border-border/60 bg-background/40 p-3 font-mono text-xs">
                        {slice.map((u) => {
                          const rule = duplicates.ruleByUid[u] ?? "in_file";
                          const meta = ruleLabel[rule];
                          return (
                            <div
                              key={u}
                              className="flex items-center justify-between gap-2 border-b border-border/40 py-1 last:border-0"
                            >
                              <span>{u}</span>
                              <Badge className={`${meta.cls} text-[10px]`}>{meta.label}</Badge>
                            </div>
                          );
                        })}
                      </div>
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>
                          Showing {start + 1}–{Math.min(start + PAGE_SIZE, list.length)} of {list.length}
                        </span>
                        <div className="flex items-center gap-1">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={page <= 1}
                            onClick={() => setDupModalPage(page - 1)}
                          >
                            Prev
                          </Button>
                          <span className="px-2">
                            Page {page} / {totalPages}
                          </span>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={page >= totalPages}
                            onClick={() => setDupModalPage(page + 1)}
                          >
                            Next
                          </Button>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              );
            })()}
            <DialogFooter>
              <Button variant="ghost" onClick={() => setDupModalOpen(false)}>Close</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <div className="mt-8 grid gap-4 lg:grid-cols-2">
          <MessagesPanel />
          <NotificationPrefsPanel />
        </div>
    </AppShell>
  );
};

export default SellerDashboard;