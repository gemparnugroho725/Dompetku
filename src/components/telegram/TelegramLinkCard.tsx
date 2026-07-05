import { useEffect, useState } from 'react';
import { Link2, MessageCircle, RefreshCcw, ShieldCheck } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { generateTelegramLinkToken, getTelegramLinkStatus } from '@/services/api';
import type { TelegramLinkStatus } from '@/services/api';

const formatDateTime = (value: string | null) => {
  if (!value) return '-';
  return new Date(value).toLocaleString('id-ID', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
};

export default function TelegramLinkCard() {
  const [status, setStatus] = useState<TelegramLinkStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadStatus = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const data = await getTelegramLinkStatus();
      setStatus(data);
    } catch (err: any) {
      setError(err?.message || 'Gagal memuat status integrasi Telegram.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadStatus();
  }, []);

  const handleGenerateToken = async () => {
    setIsGenerating(true);
    setError(null);

    try {
      const data = await generateTelegramLinkToken();
      setStatus(data);
    } catch (err: any) {
      setError(err?.message || 'Gagal membuat token linking Telegram.');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <Card className="border-blue-100 dark:border-border/40 shadow-sm bg-white dark:bg-card relative overflow-hidden">
      <div className="absolute top-0 right-0 h-28 w-28 rounded-full bg-sky-500/10 blur-3xl" />
      <CardHeader className="relative z-10">
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle className="text-lg font-bold text-blue-950 dark:text-blue-100 flex items-center gap-2">
              <MessageCircle className="h-5 w-5 text-sky-600" />
              Integrasi Telegram
            </CardTitle>
            <CardDescription className="mt-1 text-blue-700/70 dark:text-slate-400">
              Hubungkan bot Telegram agar transaksi bisa dicatat lewat chat lalu dikonfirmasi sebelum disimpan.
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={loadStatus}
            disabled={isLoading}
            className="gap-2 border-blue-200 text-blue-700 hover:bg-blue-50"
          >
            <RefreshCcw className="h-4 w-4" />
            Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent className="relative z-10 space-y-4">
        {error && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-600 dark:border-rose-800 dark:bg-rose-950/20 dark:text-rose-400">
            {error}
          </div>
        )}

        {isLoading ? (
          <div className="text-sm font-medium text-blue-700/70 dark:text-slate-400">
            Memuat status Telegram...
          </div>
        ) : (
          <>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-4 dark:border-border/40 dark:bg-slate-900/30">
                <div className="text-xs font-bold uppercase tracking-wide text-blue-700/60 dark:text-slate-500">
                  Status
                </div>
                <div className="mt-2 flex items-center gap-2 text-sm font-bold text-blue-950 dark:text-blue-100">
                  <ShieldCheck className={`h-4 w-4 ${status?.isLinked ? 'text-emerald-600' : 'text-amber-500'}`} />
                  {status?.isLinked ? 'Sudah terhubung' : 'Belum terhubung'}
                </div>
                <div className="mt-1 text-xs text-blue-700/70 dark:text-slate-400">
                  {status?.isLinked
                    ? `Terhubung pada ${formatDateTime(status.linkedAt)}`
                    : 'Buat token lalu kirim ke bot lewat perintah /start.'}
                </div>
              </div>

              <div className="rounded-xl border border-blue-100 bg-white p-4 dark:border-border/40 dark:bg-slate-900/20">
                <div className="text-xs font-bold uppercase tracking-wide text-blue-700/60 dark:text-slate-500">
                  Bot Telegram
                </div>
                <div className="mt-2 text-sm font-bold text-blue-950 dark:text-blue-100">
                  {status?.botUsername ? `@${status.botUsername}` : 'Set TELEGRAM_BOT_USERNAME di env function'}
                </div>
                <div className="mt-1 text-xs text-blue-700/70 dark:text-slate-400">
                  {status?.telegramUsername ? `Linked ke @${status.telegramUsername}` : 'Belum ada akun Telegram yang ditautkan.'}
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-dashed border-sky-200 bg-sky-50/60 p-4 dark:border-sky-900/50 dark:bg-sky-950/10">
              <div className="flex items-center gap-2 text-sm font-bold text-sky-900 dark:text-sky-100">
                <Link2 className="h-4 w-4" />
                Langkah Hubungkan
              </div>
              <div className="mt-3 space-y-2 text-sm text-sky-900/80 dark:text-sky-100/80">
                <p>1. Klik tombol buat token.</p>
                <p>2. Buka bot Telegram kamu.</p>
                <p>3. Kirim perintah berikut:</p>
              </div>
              <div className="mt-3 rounded-lg bg-slate-950 px-4 py-3 font-mono text-sm text-slate-50">
                /start {status?.linkToken || '<token-belum-dibuat>'}
              </div>
              <div className="mt-2 text-xs text-sky-900/70 dark:text-sky-100/70">
                Token berlaku sampai {formatDateTime(status?.linkExpiresAt ?? null)}.
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <Button
                onClick={handleGenerateToken}
                disabled={isGenerating}
                className="bg-sky-600 hover:bg-sky-700 text-white"
              >
                {isGenerating ? 'Membuat token...' : 'Buat Token Telegram'}
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
