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

export interface MethodEnabledMap {
  bkash: boolean;
  nagad: boolean;
  binance: boolean;
  plisio: boolean;
}

const DEFAULT_ACCOUNTS: PaymentAccountsMap = {
  bkash:   { number: "01971814603", label: "Bkash (Send Money only)", note: "পারসোনাল নম্বর — শুধু সেন্ড মানি করবেন" },
  nagad:   { number: "01971814603", label: "Nagad (Send Money only)", note: "পারসোনাল নম্বর — শুধু সেন্ড মানি করবেন" },
  binance: { number: "488586141",   label: "Binance Pay ID",          note: "Binance ID দিয়ে USDT পাঠান" },
};

const DEFAULT_MIN: MinDepositMap = { bkash: 10, nagad: 10, binance: 120 };

const DEFAULT_ENABLED: MethodEnabledMap = {
  bkash: true, nagad: true, binance: true, plisio: false,
};

const CACHE_KEY = "nx_payment_accounts_v1";
const POLL_MS = 60_000;

const sanitize = (raw: any): { accounts: PaymentAccountsMap; min: MinDepositMap; enabled: MethodEnabledMap; plisioOn: boolean } => {
  const a = raw?.accounts ?? {};
  const m = raw?.min ?? {};
  const e = raw?.enabled ?? {};
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
    enabled: {
      bkash:   e.bkash   !== false,
      nagad:   e.nagad   !== false,
      binance: e.binance !== false,
      plisio:  e.plisio  === true,
    },
    plisioOn: !!raw?.plisioOn,
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
  const [enabledMethods, setEnabledMethods] = useState<MethodEnabledMap>(cached?.enabled ?? DEFAULT_ENABLED);
  const [plisioOn, setPlisioOn] = useState<boolean>(cached?.plisioOn ?? false);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const res = await api.get<{ settings: Record<string, any> }>("/api/settings", {
        keys: "payment_accounts,min_deposit,payment_methods_enabled,plisio_enabled",
      });
      const next = sanitize({
        accounts: res.settings?.payment_accounts,
        min: res.settings?.min_deposit,
        enabled: res.settings?.payment_methods_enabled,
        plisioOn: res.settings?.plisio_enabled === true,
      });
      setAccounts(next.accounts);
      setMinDeposit(next.min);
      setEnabledMethods(next.enabled);
      setPlisioOn(next.plisioOn);
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

  return { accounts, minDeposit, enabledMethods, plisioOn, loading, refresh };
};

export const PAYMENT_METHODS: PaymentMethod[] = ["bkash", "nagad", "binance"];
export const METHOD_LABELS: Record<PaymentMethod, string> = {
  bkash: "bKash",
  nagad: "Nagad",
  binance: "Binance",
};
export const PAYMENT_DEFAULTS = { accounts: DEFAULT_ACCOUNTS, min: DEFAULT_MIN };
