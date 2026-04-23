import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type PaymentMethod = "bkash" | "nagad" | "binance";

export interface PaymentAccount {
  number: string;
  label: string;
  note?: string;
}

export interface PaymentAccountsMap {
  bkash: PaymentAccount;
  nagad: PaymentAccount;
  binance: PaymentAccount;
}

export interface MinDepositMap {
  bkash: number;
  nagad: number;
  binance: number;
}

const DEFAULT_ACCOUNTS: PaymentAccountsMap = {
  bkash:   { number: "01971814603", label: "Bkash (Send Money only)", note: "পারসোনাল নম্বর — শুধু সেন্ড মানি করবেন" },
  nagad:   { number: "01971814603", label: "Nagad (Send Money only)", note: "পারসোনাল নম্বর — শুধু সেন্ড মানি করবেন" },
  binance: { number: "488586141",   label: "Binance Pay ID",          note: "Binance ID দিয়ে USDT পাঠান" },
};

const DEFAULT_MIN: MinDepositMap = { bkash: 10, nagad: 10, binance: 120 };

const CACHE_KEY = "nx_payment_accounts_v1";

const sanitize = (raw: any): { accounts: PaymentAccountsMap; min: MinDepositMap } => {
  const a = raw?.accounts ?? {};
  const m = raw?.min ?? {};
  return {
    accounts: {
      bkash:   { ...DEFAULT_ACCOUNTS.bkash,   ...(a.bkash   ?? {}) },
      nagad:   { ...DEFAULT_ACCOUNTS.nagad,   ...(a.nagad   ?? {}) },
      binance: { ...DEFAULT_ACCOUNTS.binance, ...(a.binance ?? {}) },
    },
    min: {
      bkash:   Number(m.bkash   ?? DEFAULT_MIN.bkash),
      nagad:   Number(m.nagad   ?? DEFAULT_MIN.nagad),
      binance: Number(m.binance ?? DEFAULT_MIN.binance),
    },
  };
};

const readCache = () => {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    return sanitize(JSON.parse(raw));
  } catch { return null; }
};

const writeCache = (data: { accounts: PaymentAccountsMap; min: MinDepositMap }) => {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(data)); } catch { /* ignore */ }
};

/**
 * Loads payment account numbers + per-method min deposits from app_settings,
 * with localStorage cache fallback and realtime updates.
 */
export const usePaymentAccounts = () => {
  const cached = readCache();
  const [accounts, setAccounts] = useState<PaymentAccountsMap>(cached?.accounts ?? DEFAULT_ACCOUNTS);
  const [minDeposit, setMinDeposit] = useState<MinDepositMap>(cached?.min ?? DEFAULT_MIN);
  const [loading, setLoading] = useState(true);

  const apply = (accRaw: any, minRaw: any) => {
    const next = sanitize({ accounts: accRaw, min: minRaw });
    setAccounts(next.accounts);
    setMinDeposit(next.min);
    writeCache(next);
  };

  const refresh = async () => {
    const { data } = await supabase
      .from("app_settings")
      .select("key,value")
      .in("key", ["payment_accounts", "min_deposit"]);
    const accRow = data?.find((r) => r.key === "payment_accounts")?.value;
    const minRow = data?.find((r) => r.key === "min_deposit")?.value;
    apply(accRow, minRow);
    setLoading(false);
  };

  useEffect(() => {
    refresh();
    const ch = supabase
      .channel("payment-accounts-settings")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "app_settings", filter: "key=eq.payment_accounts" },
        refresh
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "app_settings", filter: "key=eq.min_deposit" },
        refresh
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { accounts, minDeposit, loading, refresh };
};

export const PAYMENT_METHODS: PaymentMethod[] = ["bkash", "nagad", "binance"];
export const METHOD_LABELS: Record<PaymentMethod, string> = {
  bkash: "bKash",
  nagad: "Nagad",
  binance: "Binance",
};
export const PAYMENT_DEFAULTS = { accounts: DEFAULT_ACCOUNTS, min: DEFAULT_MIN };