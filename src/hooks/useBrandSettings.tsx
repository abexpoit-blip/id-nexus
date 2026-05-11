import { useEffect, useState } from "react";
import { api } from "@/lib/api";

export interface BrandSettings {
  developer_name: string;
  developer_url: string;
  parent_brand: string;
}

const DEFAULTS: BrandSettings = {
  developer_name: "Shovon",
  developer_url: "https://t.me/basictrickbd",
  parent_brand: "Part of Basictrick MarketPlace",
};

const SETTING_KEY = "brand_credit";
const CACHE_KEY = "nx_brand_credit_v1";
const POLL_MS = 60_000;

const readCache = (): BrandSettings | null => {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    return {
      developer_name: parsed.developer_name || DEFAULTS.developer_name,
      developer_url: parsed.developer_url || DEFAULTS.developer_url,
      parent_brand: parsed.parent_brand || DEFAULTS.parent_brand,
    };
  } catch {
    return null;
  }
};

const writeCache = (s: BrandSettings) => {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
};

export const useBrandSettings = () => {
  const [settings, setSettings] = useState<BrandSettings>(() => readCache() ?? DEFAULTS);
  const [loading, setLoading] = useState(true);

  const apply = (raw: any) => {
    if (!raw || typeof raw !== "object") return;
    const next: BrandSettings = {
      developer_name: raw.developer_name?.trim() || DEFAULTS.developer_name,
      developer_url: raw.developer_url?.trim() || DEFAULTS.developer_url,
      parent_brand: raw.parent_brand?.trim() || DEFAULTS.parent_brand,
    };
    setSettings(next);
    writeCache(next);
  };

  useEffect(() => {
    let mounted = true;
    let timer: ReturnType<typeof setInterval> | null = null;

    const load = async () => {
      try {
        const res = await api.get<{ settings: Record<string, any> }>("/api/settings", {
          keys: SETTING_KEY,
        });
        if (!mounted) return;
        if (res.settings?.[SETTING_KEY]) apply(res.settings[SETTING_KEY]);
      } catch {
        /* keep cached */
      } finally {
        if (mounted) setLoading(false);
      }
    };

    load();
    timer = setInterval(load, POLL_MS);
    return () => {
      mounted = false;
      if (timer) clearInterval(timer);
    };
  }, []);

  return { settings, loading };
};

export const BRAND_SETTING_KEY = SETTING_KEY;
export const BRAND_DEFAULTS = DEFAULTS;
