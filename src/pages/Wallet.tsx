import { useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft, Loader2, Wallet as WalletIcon, ArrowDownToLine, ArrowUpFromLine, AlertTriangle, Upload, Image as ImageIcon } from "lucide-react";
import { toast } from "sonner";
import { NotificationsBell } from "@/components/NotificationsBell";

type Method = "bkash" | "nagad";

interface TopupRow {
  id: string;
  amount_bdt: number;
  method: Method;
  sender_number: string;
  txn_id: string;
  status: string;
  admin_note: string | null;
  created_at: string;
}

interface WithdrawRow {
  id: string;
  amount_bdt: number;
  method: Method;
  receiver_number: string;
  status: string;
  admin_note: string | null;
  payout_txn_id: string | null;
  created_at: string;
}

const statusBadge = (s: string) => {
  const cls =
    s === "approved" || s === "paid"
      ? "bg-success/20 text-success"
      : s === "rejected"
      ? "bg-destructive/20 text-destructive"
      : "bg-warning/20 text-warning";
  return <Badge className={`${cls} hover:${cls}`}>{s}</Badge>;
};

const Wallet = () => {
  const { user, roles, loading: authLoading } = useAuth();
  const [balance, setBalance] = useState(0);
  const [topups, setTopups] = useState<TopupRow[]>([]);
  const [withdraws, setWithdraws] = useState<WithdrawRow[]>([]);
  const [busy, setBusy] = useState(false);

  // Topup form
  const [tAmount, setTAmount] = useState("");
  const [tMethod, setTMethod] = useState<Method>("bkash");
  const [tSender, setTSender] = useState("");
  const [tTxn, setTTxn] = useState("");
  const [tNote, setTNote] = useState("");
  const [tFile, setTFile] = useState<File | null>(null);
  const [tPreview, setTPreview] = useState<string | null>(null);
  const [tUploading, setTUploading] = useState(false);
  const [tUploadedUrl, setTUploadedUrl] = useState<string | null>(null);
  const [tUploadError, setTUploadError] = useState<string | null>(null);
  const [tFileMeta, setTFileMeta] = useState<{ width: number; height: number; sizeKB: number } | null>(null);

  // Client-side screenshot validation rules
  const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/jpg", "image/webp"];
  const MAX_SIZE_BYTES = 5 * 1024 * 1024;
  const MIN_WIDTH = 200;
  const MIN_HEIGHT = 200;
  const MAX_WIDTH = 6000;
  const MAX_HEIGHT = 8000;

  const validateScreenshot = (f: File): Promise<{ width: number; height: number; sizeKB: number }> =>
    new Promise((resolve, reject) => {
      // 1. MIME type check
      if (!ALLOWED_TYPES.includes(f.type.toLowerCase())) {
        return reject(new Error(`Wrong file type "${f.type || "unknown"}". Only PNG, JPG or WEBP allowed.`));
      }
      // 2. Extension sanity check
      const ext = (f.name.split(".").pop() || "").toLowerCase();
      if (!["png", "jpg", "jpeg", "webp"].includes(ext)) {
        return reject(new Error(`File extension ".${ext}" is not allowed. Use .png, .jpg or .webp.`));
      }
      // 3. Size check
      if (f.size === 0) return reject(new Error("File is empty (0 bytes)."));
      if (f.size > MAX_SIZE_BYTES) {
        return reject(new Error(`File too large (${(f.size / 1024 / 1024).toFixed(2)} MB). Max 5 MB.`));
      }
      // 4. Image dimensions check (catches PDFs/text renamed to .jpg)
      const url = URL.createObjectURL(f);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        const { naturalWidth: w, naturalHeight: h } = img;
        if (w < MIN_WIDTH || h < MIN_HEIGHT) {
          return reject(new Error(`Image too small (${w}×${h}px). Minimum ${MIN_WIDTH}×${MIN_HEIGHT}px.`));
        }
        if (w > MAX_WIDTH || h > MAX_HEIGHT) {
          return reject(new Error(`Image too large (${w}×${h}px). Maximum ${MAX_WIDTH}×${MAX_HEIGHT}px.`));
        }
        resolve({ width: w, height: h, sizeKB: Math.round(f.size / 1024) });
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("File is not a valid image (corrupted or wrong format)."));
      };
      img.src = url;
    });

  const handleFilePick = async (f: File | null) => {
    if (tPreview) URL.revokeObjectURL(tPreview);
    setTUploadedUrl(null);
    setTUploadError(null);
    setTFileMeta(null);
    if (!f) {
      setTFile(null);
      setTPreview(null);
      return;
    }
    try {
      const meta = await validateScreenshot(f);
      setTFile(f);
      setTFileMeta(meta);
      setTPreview(URL.createObjectURL(f));
      toast.success(`Valid screenshot (${meta.width}×${meta.height}px, ${meta.sizeKB} KB)`);
    } catch (e: any) {
      setTFile(null);
      setTPreview(null);
      const msg = e?.message ?? "Invalid file";
      setTUploadError(msg);
      toast.error(msg);
    }
  };

  // Withdraw form
  const [wAmount, setWAmount] = useState("");
  const [wMethod, setWMethod] = useState<Method>("bkash");
  const [wReceiver, setWReceiver] = useState("");
  const [wNote, setWNote] = useState("");

  const isSeller = roles.includes("seller") || roles.includes("admin");

  const loadAll = async () => {
    if (!user) return;
    const [{ data: prof }, { data: tp }, { data: wd }] = await Promise.all([
      supabase.from("profiles").select("balance_bdt").eq("id", user.id).maybeSingle(),
      supabase.from("topup_requests").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(50),
      supabase.from("withdraw_requests").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(50),
    ]);
    setBalance(Number(prof?.balance_bdt ?? 0));
    setTopups((tp ?? []) as TopupRow[]);
    setWithdraws((wd ?? []) as WithdrawRow[]);
  };

  useEffect(() => {
    loadAll();
    if (!user) return;
    const ch = supabase
      .channel("wallet-" + user.id)
      .on("postgres_changes", { event: "*", schema: "public", table: "topup_requests", filter: `user_id=eq.${user.id}` }, loadAll)
      .on("postgres_changes", { event: "*", schema: "public", table: "withdraw_requests", filter: `user_id=eq.${user.id}` }, loadAll)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "profiles", filter: `id=eq.${user.id}` }, loadAll)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const submitTopup = async () => {
    const amt = Number(tAmount);
    if (!amt || amt < 50) return toast.error("Minimum top-up ৳50");
    if (!tSender.trim() || !tTxn.trim()) return toast.error("Fill sender number and txn ID");
    if (!tFile) return toast.error("Screenshot of payment is required");
    if (tFile.size > 5 * 1024 * 1024) return toast.error("Screenshot must be under 5MB");
    if (!isSeller) {
      const ok = window.confirm(
        "IMPORTANT: Wallet deposits are NON-REFUNDABLE. Buyers cannot withdraw money once deposited — funds can only be used to purchase accounts on this platform. Continue?",
      );
      if (!ok) return;
    }
    setBusy(true);
    try {
      // 1) Upload screenshot via edge function -> VPS (reuse if already uploaded)
      let url = tUploadedUrl;
      if (!url) {
        url = await uploadScreenshot();
        if (!url) throw new Error("Upload failed");
      }

      // 2) Submit top-up request
      const { error } = await supabase.rpc("submit_topup_request", {
        p_amount: amt, p_method: tMethod, p_sender_number: tSender,
        p_txn_id: tTxn, p_screenshot_url: url, p_note: tNote || null,
      });
      if (error) throw new Error(error.message);
      toast.success("Top-up submitted — admin will review.");
      setTAmount(""); setTSender(""); setTTxn(""); setTNote("");
      setTFile(null); setTPreview(null);
      setTUploadedUrl(null); setTUploadError(null);
      loadAll();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to submit");
    } finally {
      setBusy(false);
    }
  };

  const uploadScreenshot = async (): Promise<string | null> => {
    if (!tFile) return null;
    setTUploading(true);
    setTUploadError(null);
    setTUploadedUrl(null);
    try {
      const fd = new FormData();
      fd.append("file", tFile);
      const { data, error } = await supabase.functions.invoke("upload-screenshot", { body: fd });
      if (error) throw new Error(error.message);
      const url = (data as any)?.url;
      if (!url) throw new Error("Server did not return a URL");
      setTUploadedUrl(url);
      toast.success("Screenshot uploaded ✓");
      return url;
    } catch (e: any) {
      const msg = e?.message ?? "Upload failed";
      setTUploadError(msg);
      toast.error(`Upload failed: ${msg}`);
      return null;
    } finally {
      setTUploading(false);
    }
  };

  const submitWithdraw = async () => {
    const amt = Number(wAmount);
    if (!amt || amt < 100) return toast.error("Minimum withdraw ৳100");
    if (!wReceiver.trim()) return toast.error("Enter receiver number");
    setBusy(true);
    const { error } = await supabase.rpc("submit_withdraw_request", {
      p_amount: amt, p_method: wMethod, p_receiver_number: wReceiver, p_note: wNote || null,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Withdraw submitted — admin will process.");
    setWAmount(""); setWReceiver(""); setWNote("");
    loadAll();
  };

  if (authLoading) return <div className="flex min-h-screen items-center justify-center bg-background"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  if (!user) return <Navigate to="/auth" replace />;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-xl">
        <div className="container flex h-16 items-center justify-between">
          <div className="flex items-center gap-4">
            <Link to="/dashboard" className="text-sm text-muted-foreground hover:text-foreground">
              <ArrowLeft className="inline h-4 w-4" /> Dashboard
            </Link>
            <Logo size="sm" showTagline={false} />
            <Badge variant="outline">Wallet</Badge>
          </div>
          <NotificationsBell />
        </div>
      </header>

      <main className="container py-8">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl font-bold md:text-3xl">Wallet</h1>
            <p className="text-sm text-muted-foreground">Top-up via bKash/Nagad. Sellers can request payouts.</p>
          </div>
          <Card className="border-border/60 bg-gradient-card p-5">
            <div className="text-xs uppercase tracking-widest text-muted-foreground">Current balance</div>
            <div className="mt-1 flex items-center gap-2 font-display text-3xl font-bold text-primary">
              <WalletIcon className="h-6 w-6" /> ৳ {balance.toFixed(2)}
            </div>
          </Card>
        </div>

        <Tabs defaultValue="topup">
          <TabsList>
            <TabsTrigger value="topup"><ArrowDownToLine className="mr-2 h-4 w-4" />Top-up</TabsTrigger>
            {isSeller && <TabsTrigger value="withdraw"><ArrowUpFromLine className="mr-2 h-4 w-4" />Withdraw</TabsTrigger>}
            <TabsTrigger value="history">History</TabsTrigger>
          </TabsList>

          <TabsContent value="topup" className="mt-4">
            <Card className="border-border/60 bg-gradient-card p-6">
              <div className="mb-4">
                <div className="font-display text-lg font-semibold">Add money to your wallet</div>
                <p className="mt-1 text-sm text-muted-foreground">
                  Send the amount to admin's bKash/Nagad number, then submit your sender number + transaction ID. Admin will approve within 30 minutes (typically).
                </p>
                {!isSeller && (
                  <div className="mt-3 flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                    <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                    <div>
                      <div className="font-semibold">Deposits are non-refundable</div>
                      <div className="mt-1 text-xs text-destructive/90">
                        Once you deposit money into your wallet, it <strong>cannot be withdrawn</strong>. Buyers can only spend the balance on accounts available in this marketplace. Please deposit only what you intend to spend.
                      </div>
                    </div>
                  </div>
                )}
                <div className="mt-3 rounded-md border border-primary/30 bg-primary/5 p-3 text-sm">
                  <div className="font-medium">Send Money to:</div>
                  <div className="mt-1 font-mono text-base">bKash / Nagad: <span className="text-primary">01XXXXXXXXX</span> (Personal)</div>
                  <div className="mt-1 text-xs text-muted-foreground">Use "Send Money", not "Payment". Save the TrxID before submitting.</div>
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <Label>Method</Label>
                  <Select value={tMethod} onValueChange={(v) => setTMethod(v as Method)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="bkash">bKash</SelectItem>
                      <SelectItem value="nagad">Nagad</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Amount (৳)</Label>
                  <Input type="number" min={50} value={tAmount} onChange={(e) => setTAmount(e.target.value)} placeholder="500" />
                </div>
                <div>
                  <Label>Your bKash/Nagad number</Label>
                  <Input value={tSender} onChange={(e) => setTSender(e.target.value)} placeholder="01XXXXXXXXX" />
                </div>
                <div>
                  <Label>Transaction ID (TrxID)</Label>
                  <Input value={tTxn} onChange={(e) => setTTxn(e.target.value)} placeholder="9A1B2C3D4E" />
                </div>
                <div className="md:col-span-2">
                  <Label>Note (optional)</Label>
                  <Textarea value={tNote} onChange={(e) => setTNote(e.target.value)} placeholder="anything admin should know" rows={2} />
                </div>
                <div className="md:col-span-2">
                  <Label>Payment screenshot <span className="text-destructive">*</span></Label>
                  <div className="mt-1 flex flex-col gap-2 rounded-md border border-dashed border-border/60 p-3">
                    <input
                      id="topup-screenshot"
                      type="file"
                      accept="image/png,image/jpeg,image/jpg,image/webp"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0] ?? null;
                        handleFilePick(f);
                        e.target.value = ""; // allow re-selecting same file after fix
                      }}
                    />
                    <label htmlFor="topup-screenshot" className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
                      <Upload className="h-4 w-4" />
                      {tFile ? tFile.name : "Click to choose screenshot (jpg/png, max 5MB)"}
                    </label>
                    {tFileMeta && (
                      <div className="text-xs text-muted-foreground">
                        ✓ {tFileMeta.width}×{tFileMeta.height}px · {tFileMeta.sizeKB} KB · {tFile?.type}
                      </div>
                    )}
                    {tPreview && (
                      <img src={tPreview} alt="Screenshot preview" className="max-h-48 w-auto self-start rounded border border-border/60" />
                    )}
                    {tFile && !tUploadedUrl && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={uploadScreenshot}
                        disabled={tUploading}
                        className="self-start"
                      >
                        {tUploading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Uploading…</> : <><Upload className="mr-2 h-4 w-4" />Upload now (test)</>}
                      </Button>
                    )}
                    {tUploadedUrl && (
                      <div className="rounded-md border border-success/40 bg-success/10 p-2 text-xs">
                        <div className="font-medium text-success">✓ Uploaded successfully</div>
                        <a href={tUploadedUrl} target="_blank" rel="noopener noreferrer" className="mt-1 block break-all text-primary underline">
                          {tUploadedUrl}
                        </a>
                      </div>
                    )}
                    {tUploadError && (
                      <div className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
                        ✗ {tUploadError}
                      </div>
                    )}
                    <p className="text-xs text-muted-foreground">
                      Required for proof. Auto-deleted 6 hours after admin approval.
                    </p>
                  </div>
                </div>
              </div>
              <div className="mt-4 flex justify-end">
                <Button onClick={submitTopup} disabled={busy} className="bg-gradient-brand text-primary-foreground">
                  {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Submit top-up
                </Button>
              </div>
            </Card>
          </TabsContent>

          {isSeller && (
            <TabsContent value="withdraw" className="mt-4">
              <Card className="border-border/60 bg-gradient-card p-6">
                <div className="mb-4">
                  <div className="font-display text-lg font-semibold">Request withdraw</div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Available balance: <span className="font-semibold text-primary">৳ {balance.toFixed(2)}</span>. Pending withdraws are reserved automatically.
                  </p>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <Label>Method</Label>
                    <Select value={wMethod} onValueChange={(v) => setWMethod(v as Method)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="bkash">bKash</SelectItem>
                        <SelectItem value="nagad">Nagad</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Amount (৳)</Label>
                    <Input type="number" min={100} value={wAmount} onChange={(e) => setWAmount(e.target.value)} placeholder="1000" />
                  </div>
                  <div className="md:col-span-2">
                    <Label>Receiver number</Label>
                    <Input value={wReceiver} onChange={(e) => setWReceiver(e.target.value)} placeholder="01XXXXXXXXX (your number)" />
                  </div>
                  <div className="md:col-span-2">
                    <Label>Note (optional)</Label>
                    <Textarea value={wNote} onChange={(e) => setWNote(e.target.value)} rows={2} />
                  </div>
                </div>
                <div className="mt-4 flex justify-end">
                  <Button onClick={submitWithdraw} disabled={busy} className="bg-gradient-brand text-primary-foreground">
                    {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Request withdraw
                  </Button>
                </div>
              </Card>
            </TabsContent>
          )}

          <TabsContent value="history" className="mt-4 space-y-6">
            <Card className="border-border/60 bg-gradient-card p-6">
              <div className="mb-3 font-display text-lg font-semibold">Top-up history</div>
              {topups.length === 0 ? <p className="text-sm text-muted-foreground">No top-ups yet.</p> : (
                <div className="overflow-x-auto"><Table>
                  <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Method</TableHead><TableHead>Amount</TableHead><TableHead>TxnID</TableHead><TableHead>Status</TableHead><TableHead>Note</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {topups.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString()}</TableCell>
                        <TableCell>{r.method}</TableCell>
                        <TableCell>৳ {Number(r.amount_bdt).toFixed(2)}</TableCell>
                        <TableCell className="font-mono text-xs">{r.txn_id}</TableCell>
                        <TableCell>{statusBadge(r.status)}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{r.admin_note ?? "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table></div>
              )}
            </Card>

            {isSeller && (
              <Card className="border-border/60 bg-gradient-card p-6">
                <div className="mb-3 font-display text-lg font-semibold">Withdraw history</div>
                {withdraws.length === 0 ? <p className="text-sm text-muted-foreground">No withdraws yet.</p> : (
                  <div className="overflow-x-auto"><Table>
                    <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Method</TableHead><TableHead>Amount</TableHead><TableHead>Receiver</TableHead><TableHead>Status</TableHead><TableHead>Payout TxnID</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {withdraws.map((r) => (
                        <TableRow key={r.id}>
                          <TableCell className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString()}</TableCell>
                          <TableCell>{r.method}</TableCell>
                          <TableCell>৳ {Number(r.amount_bdt).toFixed(2)}</TableCell>
                          <TableCell className="font-mono text-xs">{r.receiver_number}</TableCell>
                          <TableCell>{statusBadge(r.status)}</TableCell>
                          <TableCell className="font-mono text-xs">{r.payout_txn_id ?? "—"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table></div>
                )}
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
};

export default Wallet;