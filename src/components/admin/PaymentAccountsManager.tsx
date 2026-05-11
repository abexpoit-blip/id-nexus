import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Save, Sparkles } from "lucide-react";
import { toast } from "sonner";
import {
  usePaymentAccounts, PAYMENT_METHODS, METHOD_LABELS, type PaymentMethod,
  type PaymentAccount, type PaymentAccountsMap, type MinDepositMap,
} from "@/hooks/usePaymentAccounts";

/**
 * Admin manager for editing payment numbers (bKash/Nagad/Binance) and per-method
 * minimum deposits. Saves via admin_save_payment_accounts RPC, with audit logging.
 */
export const PaymentAccountsManager = () => {
  const { accounts, minDeposit, refresh } = usePaymentAccounts();
  const [draft, setDraft] = useState<PaymentAccountsMap>(accounts);
  const [draftMin, setDraftMin] = useState<MinDepositMap>(minDeposit);
  const [saving, setSaving] = useState(false);

  // Hydrate when realtime updates land
  useEffect(() => { setDraft(accounts); }, [accounts]);
  useEffect(() => { setDraftMin(minDeposit); }, [minDeposit]);

  const updateField = (m: PaymentMethod, field: keyof PaymentAccount, value: string) => {
    setDraft((d) => ({ ...d, [m]: { ...d[m], [field]: value } }));
  };

  const save = async () => {
    for (const m of PAYMENT_METHODS) {
      if (!draft[m].number.trim()) return toast.error(`${METHOD_LABELS[m]} number ফাঁকা থাকতে পারবে না`);
      if (!Number.isFinite(draftMin[m]) || draftMin[m] < 1) return toast.error(`${METHOD_LABELS[m]} min deposit invalid`);
    }
    setSaving(true);
    try {
      await api.put(`/api/admin/settings/payment_accounts`, { value: draft });
      await api.put(`/api/admin/settings/min_deposit`, { value: draftMin });
      toast.success("✅ Payment accounts saved");
      refresh();
    } catch (e: any) {
      toast.error(e?.message ?? "Save failed");
    } finally { setSaving(false); }
  };

  return (
    <div className="space-y-6">
      <Card className="border-border/60 bg-gradient-card p-6">
        <div className="mb-4 flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <div>
            <div className="font-display text-lg font-semibold">Payment accounts</div>
            <p className="text-sm text-muted-foreground">
              Users will see এই numbers/IDs in the deposit wizard. Realtime — সবার ব্রাউজারে instant update হবে।
            </p>
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          {PAYMENT_METHODS.map((m) => (
            <div key={m} className="space-y-3 rounded-lg border border-border/60 bg-card/40 p-4">
              <div className="flex items-center justify-between">
                <div className="font-display text-base font-bold">{METHOD_LABELS[m]}</div>
                <span className="rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 text-[10px] uppercase tracking-widest text-primary">
                  {m}
                </span>
              </div>
              <div>
                <Label>Number / ID</Label>
                <Input
                  value={draft[m].number}
                  onChange={(e) => updateField(m, "number", e.target.value)}
                  placeholder={m === "binance" ? "488586141" : "01XXXXXXXXX"}
                  className="font-mono"
                />
              </div>
              <div>
                <Label>Label</Label>
                <Input
                  value={draft[m].label}
                  onChange={(e) => updateField(m, "label", e.target.value)}
                />
              </div>
              <div>
                <Label>Note (shown to users)</Label>
                <Textarea
                  rows={2}
                  value={draft[m].note ?? ""}
                  onChange={(e) => updateField(m, "note", e.target.value)}
                />
              </div>
              <div>
                <Label>Min deposit (৳)</Label>
                <Input
                  type="number"
                  min={1}
                  value={draftMin[m]}
                  onChange={(e) => setDraftMin((d) => ({ ...d, [m]: Number(e.target.value) }))}
                />
              </div>
            </div>
          ))}
        </div>

        <div className="mt-6 flex justify-end">
          <Button onClick={save} disabled={saving} className="bg-gradient-brand text-primary-foreground">
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Save changes
          </Button>
        </div>
      </Card>

      {/* Live preview of how user will see the deposit step */}
      <Card className="border-border/60 bg-gradient-card p-6">
        <div className="mb-3 font-display text-lg font-semibold">Live preview (user-facing)</div>
        <div className="grid gap-3 md:grid-cols-3">
          {PAYMENT_METHODS.map((m) => (
            <div
              key={m}
              className="rounded-xl border border-primary/30 bg-card/60 p-4"
              style={{ boxShadow: "0 0 24px -10px hsl(var(--primary) / 0.5)" }}
            >
              <div className="font-display text-base font-bold">{METHOD_LABELS[m]}</div>
              <div className="mt-2 font-mono text-lg text-primary">{draft[m].number}</div>
              <div className="mt-1 text-sm">{draft[m].label}</div>
              {draft[m].note && (
                <div className="mt-1 text-xs text-muted-foreground">⚠️ {draft[m].note}</div>
              )}
              <div className="mt-2 text-xs text-warning">Min ৳{draftMin[m]}</div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
};

export default PaymentAccountsManager;