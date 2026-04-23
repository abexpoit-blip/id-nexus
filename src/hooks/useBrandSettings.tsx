import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

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
    /* ignore quota errors */
  }
};

/**
 * Reads brand credit from app_settings (key = brand_credit) and
 * keeps it in sync via Supabase realtime so footer/favicon labels
 * update instantly when an admin saves new values.
 */
export const useBrandSettings = () => {
  // Hydrate immediately from localStorage so footer/banner never flash
  // back to defaults if realtime is delayed or temporarily fails.
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
    supabase
      .from("app_settings")
      .select("value")
      .eq("key", SETTING_KEY)
      .maybeSingle()
      .then(({ data }) => {
        if (!mounted) return;
        if (data?.value) apply(data.value);
        setLoading(false);
      });

    const channel = supabase
      .channel("brand-credit-settings")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "app_settings", filter: `key=eq.${SETTING_KEY}` },
        (payload: any) => {
          if (payload.new?.value) apply(payload.new.value);
        }
      )
      .subscribe();

    return () => {
      mounted = false;
      supabase.removeChannel(channel);
    };
  }, []);

  return { settings, loading };
};

export const BRAND_SETTING_KEY = SETTING_KEY;
export const BRAND_DEFAULTS = DEFAULTS;