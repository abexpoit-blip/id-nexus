import { useEffect, useState } from "react";
import {
  CommandDialog, CommandEmpty, CommandGroup, CommandInput,
  CommandItem, CommandList, CommandSeparator,
} from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import { Search } from "lucide-react";
import { api } from "@/lib/api";

type SearchResults = {
  users: { id: string; email: string; display_name: string | null; balance_bdt: number }[];
  orders: { id: string; status: string; total_bdt: number; buyer_email: string | null }[];
  accounts: { id: string; uid: string; status: string; category_name: string | null }[];
  replacements: { id: string; reported_uid: string; outcome: string; request_id: string }[];
};

const empty: SearchResults = { users: [], orders: [], accounts: [], replacements: [] };

export const GlobalSearch = ({ onJump }: { onJump: (s: string) => void }) => {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [data, setData] = useState<SearchResults>(empty);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey)) {
        e.preventDefault(); setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  useEffect(() => {
    if (!open || q.trim().length < 2) { setData(empty); return; }
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const r = await api.get<SearchResults>(`/api/admin/search?q=${encodeURIComponent(q.trim())}`);
        setData(r);
      } catch { /* ignore */ }
      setLoading(false);
    }, 200);
    return () => clearTimeout(t);
  }, [q, open]);

  const go = (section: string) => { onJump(section); setOpen(false); setQ(""); };

  return (
    <>
      <Button
        variant="outline" size="sm"
        className="gap-2 text-muted-foreground hover:text-foreground"
        onClick={() => setOpen(true)}
      >
        <Search className="h-4 w-4" />
        <span className="hidden sm:inline">Search…</span>
        <kbd className="hidden rounded border border-border/60 bg-muted px-1.5 py-0.5 text-[10px] font-medium sm:inline">
          ⌘K
        </kbd>
      </Button>
      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput
          placeholder="Search users, orders, account UIDs, replacements…"
          value={q}
          onValueChange={setQ}
        />
        <CommandList>
          <CommandEmpty>
            {loading ? "Searching…" : q.length < 2 ? "Type at least 2 characters." : "No results."}
          </CommandEmpty>
          {data.users.length > 0 && (
            <CommandGroup heading="Users">
              {data.users.map((u) => (
                <CommandItem key={u.id} value={`user-${u.id}`} onSelect={() => go("users")}>
                  <span className="flex-1">{u.email}</span>
                  <span className="text-xs text-muted-foreground">৳{Number(u.balance_bdt || 0).toFixed(2)}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          {data.orders.length > 0 && (
            <>
              <CommandSeparator />
              <CommandGroup heading="Orders">
                {data.orders.map((o) => (
                  <CommandItem key={o.id} value={`order-${o.id}`} onSelect={() => go("orders")}>
                    <span className="flex-1 font-mono text-xs">#{o.id.slice(0, 8)} · {o.buyer_email}</span>
                    <span className="text-xs">৳{Number(o.total_bdt).toFixed(2)} · {o.status}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </>
          )}
          {data.accounts.length > 0 && (
            <>
              <CommandSeparator />
              <CommandGroup heading="Accounts (UID)">
                {data.accounts.map((a) => (
                  <CommandItem key={a.id} value={`acct-${a.id}`} onSelect={() => go("stock")}>
                    <span className="flex-1 font-mono text-xs">{a.uid}</span>
                    <span className="text-xs text-muted-foreground">{a.category_name} · {a.status}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </>
          )}
          {data.replacements.length > 0 && (
            <>
              <CommandSeparator />
              <CommandGroup heading="Replacements">
                {data.replacements.map((r) => (
                  <CommandItem key={r.id} value={`rep-${r.id}`} onSelect={() => go("replacements")}>
                    <span className="flex-1 font-mono text-xs">{r.reported_uid}</span>
                    <span className="text-xs text-muted-foreground capitalize">{r.outcome.replace("_", " ")}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </>
          )}
        </CommandList>
      </CommandDialog>
    </>
  );
};