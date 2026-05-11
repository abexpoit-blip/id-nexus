import { useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api";

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
const POLL_MS = 60_000;

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

export const usePaymentAccounts = () => {
  const cached = readCache();
  const [accounts, setAccounts] = useState<PaymentAccountsMap>(cached?.accounts ?? DEFAULT_ACCOUNTS);
  const [minDeposit, setMinDeposit] = useState<MinDepositMap>(cached?.min ?? DEFAULT_MIN);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const res = await api.get<{ settings: Record<string, any> }>("/api/settings", {
        keys: "payment_accounts,min_deposit",
      });
      const next = sanitize({
        accounts: res.settings?.payment_accounts,
        min: res.settings?.min_deposit,
      });
      setAccounts(next.accounts);
      setMinDeposit(next.min);
      writeCache(next);
    } catch {
      /* keep cached */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, POLL_MS);
    return () => clearInterval(timer);
  }, [refresh]);

  return { accounts, minDeposit, loading, refresh };
};

export const PAYMENT_METHODS: PaymentMethod[] = ["bkash", "nagad", "binance"];
export const METHOD_LABELS: Record<PaymentMethod, string> = {
  bkash: "bKash",
  nagad: "Nagad",
  binance: "Binance",
};
export const PAYMENT_DEFAULTS = { accounts: DEFAULT_ACCOUNTS, min: DEFAULT_MIN };
