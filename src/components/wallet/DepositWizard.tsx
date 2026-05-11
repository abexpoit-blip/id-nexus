import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  ArrowLeft, ArrowRight, Check, Copy, Loader2, Upload, AlertTriangle, Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import {
  usePaymentAccounts, PAYMENT_METHODS, METHOD_LABELS, type PaymentMethod,
} from "@/hooks/usePaymentAccounts";

interface Props {
  isSeller: boolean;
  onSubmitted: () => void;
}

const STEPS = [
  { key: "method", label: "Method" },
  { key: "sender", label: "Sender" },
  { key: "amount", label: "Amount" },
  { key: "screenshot", label: "Screenshot" },
] as const;

const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/jpg", "image/webp"];
const MAX_SIZE_BYTES = 5 * 1024 * 1024;

/**
 * Multi-step deposit wizard.
 * Steps: Method → Sender number → Amount → Screenshot → Submit.
 * Reads payment numbers + per-method min deposit from app_settings via realtime.
 */
export const DepositWizard = ({ isSeller, onSubmitted }: Props) => {
  const { accounts, minDeposit } = usePaymentAccounts();

  const [stepIdx, setStepIdx] = useState(0);
  const [method, setMethod] = useState<PaymentMethod>("bkash");
  const [sender, setSender] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [txn, setTxn] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const step = STEPS[stepIdx];
  const acc = accounts[method];
  const min = minDeposit[method];
  const amt = Number(amount);

  const senderValid = useMemo(() => {
    const v = sender.trim();
    if (method === "binance") return v.length >= 4;
    return /^01\d{9}$/.test(v);
  }, [sender, method]);

  const reset = () => {
    if (preview) URL.revokeObjectURL(preview);
    setStepIdx(0); setMethod("bkash"); setSender(""); setAmount("");
    setNote(""); setTxn(""); setFile(null); setPreview(null);
  };

  const copy = (text: string) => {
    navigator.clipboard.writeText(text).then(
      () => toast.success("Copied!"),
      () => toast.error("Copy failed"),
    );
  };

  const handleFile = (f: File | null) => {
    if (preview) URL.revokeObjectURL(preview);
    if (!f) { setFile(null); setPreview(null); return; }
    if (!ALLOWED_TYPES.includes(f.type.toLowerCase())) {
      toast.error("Only PNG, JPG, or WEBP allowed");
      return;
    }
    if (f.size > MAX_SIZE_BYTES) {
      toast.error("File too large (max 5 MB)");
      return;
    }
    setFile(f);
    setPreview(URL.createObjectURL(f));
  };

  const next = () => {
    if (step.key === "method") {
      // method picked, move on
    } else if (step.key === "sender") {
      if (!senderValid) {
        toast.error(method === "binance" ? "Enter valid Binance ID/UID" : "Enter valid 11-digit number (01XXXXXXXXX)");
        return;
      }
    } else if (step.key === "amount") {
      if (!amt || amt < min) { toast.error(`Minimum deposit ৳${min}`); return; }
      if (!txn.trim()) { toast.error("Transaction ID required"); return; }
    }
    setStepIdx((i) => Math.min(i + 1, STEPS.length - 1));
  };

  const back = () => setStepIdx((i) => Math.max(0, i - 1));

  const uploadScreenshot = async (): Promise<string | null> => {
    if (!file) return null;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const { data, error } = await supabase.functions.invoke("upload-screenshot", { body: fd });
      if (error) throw new Error(error.message);
      const url = (data as any)?.url;
      if (!url) throw new Error("Server did not return URL");
      return url;
    } catch (e: any) {
      toast.error(`Upload failed: ${e?.message ?? e}`);
      return null;
    } finally { setUploading(false); }
  };

  const submit = async () => {
    if (!file) return toast.error("Screenshot required");
    if (!isSeller) {
      const ok = window.confirm(
        "ডিপোজিট করা টাকা ফেরতযোগ্য নয়। শুধু এখানের প্রোডাক্ট কিনতে ব্যবহার করা যাবে। চালিয়ে যাবেন?"
      );
      if (!ok) return;
    }
    setSubmitting(true);
    try {
      const url = await uploadScreenshot();
      if (!url) throw new Error("Upload failed");
      const { error } = await supabase.rpc("submit_topup_request", {
        p_amount: amt,
        p_method: method,
        p_sender_number: sender.trim(),
        p_txn_id: txn.trim(),
        p_screenshot_url: url,
        p_note: note || null,
      });
      if (error) throw new Error(error.message);
      toast.success("✅ Deposit request submitted — admin review করছেন");
      onSubmitted();
      reset();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to submit");
    } finally { setSubmitting(false); }
  };

  return (
    <Card className="border-border/60 bg-gradient-card p-6">
      {/* Header */}
      <div className="mb-5 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 font-display text-lg font-semibold">
            <Sparkles className="h-4 w-4 text-primary" />
            Add money to wallet
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Step-by-step deposit · Step <strong>{stepIdx + 1}</strong> of {STEPS.length}: <span className="text-primary">{step.label}</span>
          </p>
        </div>
        {!isSeller && (
          <div className="hidden items-start gap-2 rounded-md border border-warning/40 bg-warning/10 p-2 text-xs text-warning md:flex">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5" />
            Non-refundable
          </div>
        )}
      </div>

      {/* Progress dots */}
      <div className="mb-6 flex items-center gap-2">
        {STEPS.map((s, i) => (
          <div key={s.key} className="flex flex-1 items-center gap-2">
            <div
              className={`flex h-7 w-7 items-center justify-center rounded-full border text-xs font-semibold transition-all ${
                i < stepIdx
                  ? "border-success bg-success/20 text-success"
                  : i === stepIdx
                  ? "border-primary bg-primary/20 text-primary shadow-[0_0_18px_-4px_hsl(var(--primary)/0.7)]"
                  : "border-border/60 text-muted-foreground"
              }`}
            >
              {i < stepIdx ? <Check className="h-3.5 w-3.5" /> : i + 1}
            </div>
            {i < STEPS.length - 1 && (
              <div className={`h-px flex-1 ${i < stepIdx ? "bg-success/60" : "bg-border/60"}`} />
            )}
          </div>
        ))}
      </div>

      {/* Step content */}
      {step.key === "method" && (
        <div className="space-y-3">
          <Label>📱 Choose payment method</Label>
          <div className="grid gap-3 md:grid-cols-3">
            {PAYMENT_METHODS.map((m) => {
              const a = accounts[m];
              const active = method === m;
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMethod(m)}
                  className={`group relative overflow-hidden rounded-xl border p-4 text-left transition-all ${
                    active
                      ? "border-primary bg-primary/10 shadow-[0_0_24px_-6px_hsl(var(--primary)/0.7)]"
                      : "border-border/60 bg-card/40 hover:border-primary/40"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="font-display text-base font-bold">{METHOD_LABELS[m]}</div>
                    {active && <Check className="h-4 w-4 text-primary" />}
                  </div>
                  <div className="mt-2 font-mono text-sm text-primary">{a.number}</div>
                  <div className="mt-1 text-[11px] text-muted-foreground">Min ৳{minDeposit[m]}</div>
                </button>
              );
            })}
          </div>

          <div
            className="mt-4 rounded-lg border border-primary/40 bg-primary/5 p-4"
            style={{ boxShadow: "0 0 24px -8px hsl(var(--primary) / 0.5)" }}
          >
            <div className="text-xs uppercase tracking-widest text-muted-foreground">Send money to</div>
            <div className="mt-1 flex items-center justify-between gap-2">
              <div className="font-mono text-xl font-bold text-primary">{acc.number}</div>
              <Button size="sm" variant="outline" onClick={() => copy(acc.number)}>
                <Copy className="mr-1 h-3.5 w-3.5" /> Copy
              </Button>
            </div>
            <div className="mt-1 text-sm font-medium">{acc.label}</div>
            {acc.note && <div className="mt-1 text-xs text-muted-foreground">⚠️ {acc.note}</div>}
            <div className="mt-2 text-xs text-warning">
              মিনিমাম ডিপোজিট ৳{min}{method === "binance" ? " (≈ 1$)" : ""}
            </div>
          </div>
        </div>
      )}

      {step.key === "sender" && (
        <div className="space-y-3">
          <Label>
            {method === "binance"
              ? "🆔 আপনার Binance ID / UID দিন"
              : "📞 আপনি যে নম্বর দিয়ে টাকা পাঠিয়েছেন"}
          </Label>
          <Input
            value={sender}
            onChange={(e) => setSender(e.target.value)}
            placeholder={method === "binance" ? "488586141" : "01XXXXXXXXX"}
            className="text-lg"
            inputMode={method === "binance" ? "text" : "numeric"}
          />
          <p className="text-xs text-muted-foreground">
            {method === "binance"
              ? "যে Binance account থেকে USDT পাঠিয়েছেন তার ID দিন"
              : "11 digits ছাড়া accept হবে না"}
          </p>
        </div>
      )}

      {step.key === "amount" && (
        <div className="space-y-3">
          <div>
            <Label>💰 কত টাকা পাঠিয়েছেন?</Label>
            <Input
              type="number"
              min={min}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder={String(min)}
              className="text-lg"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Minimum ৳{min}{method === "binance" ? " (Binance ≈ 1$)" : ""}
            </p>
          </div>
          <div>
            <Label>🔢 Transaction ID (TrxID)</Label>
            <Input
              value={txn}
              onChange={(e) => setTxn(e.target.value)}
              placeholder={method === "binance" ? "Order ID / TxHash" : "9A1B2C3D4E"}
              className="font-mono"
            />
          </div>
          <div>
            <Label>📝 Note (optional)</Label>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
          </div>
        </div>
      )}

      {step.key === "screenshot" && (
        <div className="space-y-3">
          <Label>📸 পেমেন্টের স্ক্রিনশট দিন <span className="text-destructive">*</span></Label>
          <div className="rounded-md border border-dashed border-border/60 p-4">
            <input
              id="wizard-screenshot"
              type="file"
              accept="image/png,image/jpeg,image/jpg,image/webp"
              className="hidden"
              onChange={(e) => {
                handleFile(e.target.files?.[0] ?? null);
                e.target.value = "";
              }}
            />
            <label
              htmlFor="wizard-screenshot"
              className="flex cursor-pointer flex-col items-center justify-center gap-2 py-6 text-sm text-muted-foreground hover:text-foreground"
            >
              <Upload className="h-8 w-8" />
              {file ? file.name : "Click to choose screenshot (PNG/JPG, max 5 MB)"}
            </label>
            {preview && (
              <img
                src={preview}
                alt="Preview"
                className="mt-3 max-h-56 w-auto rounded border border-border/60"
              />
            )}
          </div>

          {/* Confirmation summary */}
          <div className="rounded-lg border border-primary/40 bg-primary/5 p-4 text-sm">
            <div className="mb-2 text-xs font-semibold uppercase tracking-widest text-primary">Confirm</div>
            <div className="grid gap-1.5">
              <div className="flex justify-between"><span className="text-muted-foreground">Method:</span><span className="font-semibold">{METHOD_LABELS[method]}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Sender:</span><span className="font-mono">{sender}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Amount:</span><span className="font-bold text-primary">৳ {amt.toFixed(2)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">TrxID:</span><span className="font-mono text-xs">{txn}</span></div>
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            স্ক্রিনশট ছাড়া রিকোয়েস্ট গ্রহণ হবে না। Submit করার পর admin review করবেন।
          </p>
        </div>
      )}

      {/* Footer buttons */}
      <div className="mt-6 flex items-center justify-between">
        <Button type="button" variant="ghost" onClick={back} disabled={stepIdx === 0 || submitting}>
          <ArrowLeft className="mr-1 h-4 w-4" /> Back
        </Button>

        {stepIdx < STEPS.length - 1 ? (
          <Button type="button" onClick={next} className="bg-gradient-brand text-primary-foreground">
            Next <ArrowRight className="ml-1 h-4 w-4" />
          </Button>
        ) : (
          <Button
            type="button"
            onClick={submit}
            disabled={submitting || uploading || !file}
            className="bg-gradient-brand text-primary-foreground"
          >
            {(submitting || uploading) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Submit deposit
          </Button>
        )}
      </div>
    </Card>
  );
};

export default DepositWizard;