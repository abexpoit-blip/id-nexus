import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Send, RefreshCcw, CheckCircle2, XCircle, Info } from "lucide-react";
import { toast } from "sonner";

interface Status {
  bot_token_set: boolean;
  admin_chat_id_set: boolean;
  admin_chat_id_preview: string | null;
}

export const TelegramSettingsManager = () => {
  const [status, setStatus] = useState<Status | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [testText, setTestText] = useState(
    "✅ NexusX admin test — deposits will land here.",
  );

  const loadStatus = async () => {
    setLoading(true);
    const { data, error } = await supabase.functions.invoke("admin-telegram-test", {
      body: { action: "status" },
    });
    if (error) toast.error(error.message);
    else setStatus(data as Status);
    setLoading(false);
  };

  useEffect(() => {
    loadStatus();
  }, []);

  const sendTest = async () => {
    setSending(true);
    const { data, error } = await supabase.functions.invoke("admin-telegram-test", {
      body: { action: "test", text: testText.trim() || undefined },
    });
    setSending(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    if ((data as any)?.ok) {
      toast.success(`Test message delivered to ${(data as any).chat_id_preview}`);
    } else {
      toast.error((data as any)?.error || "Test failed");
    }
  };

  return (
    <div className="space-y-6">
      <Card className="border-border/60 bg-gradient-card p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="font-display text-lg font-semibold">Telegram admin mirror</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Website deposit screenshots are forwarded to this Telegram group with Approve / Reject buttons.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={loadStatus} disabled={loading}>
            <RefreshCcw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border border-border/60 bg-background/40 p-4">
            <div className="text-xs uppercase tracking-widest text-muted-foreground">Bot token</div>
            <div className="mt-2 flex items-center gap-2">
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              ) : status?.bot_token_set ? (
                <Badge className="bg-success/20 text-success hover:bg-success/20">
                  <CheckCircle2 className="mr-1 h-3 w-3" /> Configured
                </Badge>
              ) : (
                <Badge variant="outline" className="border-destructive/40 text-destructive">
                  <XCircle className="mr-1 h-3 w-3" /> Missing
                </Badge>
              )}
              <span className="text-xs text-muted-foreground">TELEGRAM_BOT_TOKEN</span>
            </div>
          </div>
          <div className="rounded-lg border border-border/60 bg-background/40 p-4">
            <div className="text-xs uppercase tracking-widest text-muted-foreground">Admin chat ID</div>
            <div className="mt-2 flex items-center gap-2">
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              ) : status?.admin_chat_id_set ? (
                <Badge className="bg-success/20 text-success hover:bg-success/20">
                  <CheckCircle2 className="mr-1 h-3 w-3" /> {status.admin_chat_id_preview}
                </Badge>
              ) : (
                <Badge variant="outline" className="border-destructive/40 text-destructive">
                  <XCircle className="mr-1 h-3 w-3" /> Missing
                </Badge>
              )}
              <span className="text-xs text-muted-foreground">TELEGRAM_ADMIN_CHAT_ID</span>
            </div>
          </div>
        </div>

        <div className="mt-6 space-y-3">
          <Label htmlFor="test-text">Test message</Label>
          <Input
            id="test-text"
            value={testText}
            onChange={(e) => setTestText(e.target.value)}
            placeholder="Test message to send to admin group"
          />
          <Button
            onClick={sendTest}
            disabled={sending || loading || !status?.admin_chat_id_set || !status?.bot_token_set}
          >
            {sending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Send className="mr-2 h-4 w-4" />
            )}
            Send test to admin group
          </Button>
        </div>
      </Card>

      <Card className="border-border/60 bg-gradient-card p-6">
        <div className="flex items-start gap-3">
          <Info className="mt-0.5 h-5 w-5 text-primary" />
          <div className="space-y-3 text-sm text-muted-foreground">
            <p className="font-medium text-foreground">কীভাবে কাজ করে / Setup steps</p>
            <ol className="list-decimal space-y-2 pl-5">
              <li>
                Telegram-এ একটা group বানান এবং আপনার bot-কে admin হিসেবে add করুন (post + read messages permissions দিন)।
              </li>
              <li>
                Group-এ একটা message পাঠান। তারপর এই URL খুলুন:{" "}
                <code className="rounded bg-background/60 px-1 py-0.5 text-xs">
                  https://api.telegram.org/bot&lt;BOT_TOKEN&gt;/getUpdates
                </code>{" "}
                — সেখান থেকে <code>chat.id</code> (negative number) copy করুন।
              </li>
              <li>
                সেই ID টা <code>TELEGRAM_ADMIN_CHAT_ID</code> secret-এ save করুন (Lovable Cloud → Settings → Secrets)।
              </li>
              <li>উপরের "Send test" বাটন চাপ দিয়ে confirm করুন group-এ message পৌঁছাচ্ছে।</li>
              <li>
                এরপর website থেকে যে কোনো deposit এলে screenshot + Approve/Reject button সরাসরি এই group-এ যাবে।
              </li>
            </ol>
          </div>
        </div>
      </Card>
    </div>
  );
};