import { env } from "./env.ts";

const telegramApiBase = `https://api.telegram.org/bot${env.telegramBotToken}`;

type InlineKeyboardButton = {
  text: string;
  callback_data: string;
};

type SendMessageOptions = {
  replyMarkup?: {
    inline_keyboard: InlineKeyboardButton[][];
  };
};

const telegramFetch = async (method: string, payload: Record<string, unknown>) => {
  const response = await fetch(`${telegramApiBase}/${method}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Telegram API error: ${response.status} ${body}`);
  }

  return response.json();
};

export const sendTelegramMessage = async (
  chatId: number | string,
  text: string,
  options: SendMessageOptions = {},
) => {
  return telegramFetch("sendMessage", {
    chat_id: chatId,
    text,
    reply_markup: options.replyMarkup,
  });
};

export const getTelegramFile = async (fileId: string) => {
  return telegramFetch("getFile", {
    file_id: fileId,
  });
};

export const downloadTelegramFile = async (filePath: string) => {
  const response = await fetch(`https://api.telegram.org/file/bot${env.telegramBotToken}/${filePath}`);
  if (!response.ok) {
    throw new Error(`Failed to download file from Telegram: ${response.statusText}`);
  }
  return response.arrayBuffer();
};

export const answerTelegramCallback = async (callbackQueryId: string, text: string) => {
  return telegramFetch("answerCallbackQuery", {
    callback_query_id: callbackQueryId,
    text,
  });
};

export const registerTelegramBotCommands = async () => {
  return telegramFetch("setMyCommands", {
    commands: [
      { command: "help", description: "Daftar perintah bot" },
      { command: "aimodels", description: "Kelola model AI & API Key (Rolling)" },
      { command: "tambahmodel", description: "Tambah custom AI model" },
      { command: "hapusmodel", description: "Hapus custom AI model" },
      { command: "checksaldo", description: "Cek saldo total & per akun" },
      { command: "saldo", description: "Cek saldo akun tertentu" },
      { command: "mutasi", description: "Lihat 5 transaksi terakhir" },
      { command: "cari", description: "Cari transaksi dari kata kunci" },
      { command: "akun", description: "Daftar akun keuangan" },
      { command: "budget", description: "Cek status budget bulan ini" },
      { command: "ringkasan", description: "Ringkasan hari, minggu, bulan" },
      { command: "topkategori", description: "Kategori pengeluaran terbesar" },
      { command: "boros", description: "Bandingkan pengeluaran vs lalu" },
      { command: "status", description: "Cek status keaktifan bot" },
      { command: "auditharian", description: "Audit pengeluaran hari ini" },
      { command: "auditmingguan", description: "Audit pengeluaran minggu ini" },
      { command: "auditbulanan", description: "Audit pengeluaran bulan ini" },
    ],
  });
};
