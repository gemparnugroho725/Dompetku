import { analyzeTransactionText, generateAuditRecommendation } from "../_shared/ai.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { env } from "../_shared/env.ts";
import { adminClient } from "../_shared/supabase.ts";
import { answerTelegramCallback, sendTelegramMessage } from "../_shared/telegram.ts";
import type { ParsedTransaction } from "../_shared/types.ts";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(amount);

const BUSINESS_TIMEZONE = "Asia/Bangkok";
const getDateInTimezone = (date = new Date()) => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: BUSINESS_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const year = parts.find((part) => part.type === "year")?.value ?? "1970";
  const month = parts.find((part) => part.type === "month")?.value ?? "01";
  const day = parts.find((part) => part.type === "day")?.value ?? "01";
  return `${year}-${month}-${day}`;
};

const shiftDate = (dateString: string, days: number) => {
  const [year, month, day] = dateString.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

const getMonthRange = (dateString: string) => {
  const [year, month] = dateString.split("-").map(Number);
  const start = `${year}-${String(month).padStart(2, "0")}-01`;
  const endDate = new Date(Date.UTC(year, month, 0));
  return {
    startDate: start,
    endDate: endDate.toISOString().slice(0, 10),
  };
};

const getWeekRange = (dateString: string) => {
  const [year, month, day] = dateString.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  const dayOfWeek = date.getUTCDay();
  const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const startDate = new Date(date);
  startDate.setUTCDate(date.getUTCDate() + diffToMonday);
  const endDate = new Date(startDate);
  endDate.setUTCDate(startDate.getUTCDate() + 6);

  return {
    startDate: startDate.toISOString().slice(0, 10),
    endDate: endDate.toISOString().slice(0, 10),
  };
};

const getPreviousWeekRange = (dateString: string) => {
  const current = getWeekRange(dateString);
  const previousEnd = shiftDate(current.startDate, -1);
  const previousStart = shiftDate(previousEnd, -6);
  return {
    startDate: previousStart,
    endDate: previousEnd,
  };
};

const getPreviousMonthRange = (dateString: string) => {
  const [year, month] = dateString.split("-").map(Number);
  const previousMonthDate = new Date(Date.UTC(year, month - 2, 1));
  return getMonthRange(previousMonthDate.toISOString().slice(0, 10));
};

const buildConfirmationText = (parsed: ParsedTransaction) =>
  [
    "Saya baca transaksinya seperti ini:",
    `Tipe: ${
      parsed.type === "expense"
        ? "Pengeluaran"
        : parsed.type === "income"
          ? "Pemasukan"
          : "Transfer Antar Akun"
    }`,
    `Jumlah: ${formatCurrency(parsed.amount)}`,
    ...(parsed.type === "transfer"
      ? [
          `Dari: ${parsed.sourceAccountName ?? "-"}`,
          `Ke: ${parsed.destinationAccountName ?? "-"}`,
        ]
      : [`Kategori: ${parsed.category}`]),
    `Tanggal: ${parsed.date}`,
    `Catatan: ${parsed.description}`,
    `Confidence AI: ${(parsed.confidence * 100).toFixed(0)}%`,
    "",
    "Kalau sudah benar, tekan Benar. Kalau belum, tekan Salah lalu kirim ulang dengan format yang lebih jelas.",
  ].join("\n");

const extractTokenFromStart = (text: string) => {
  const match = text.trim().match(/^\/start(?:\s+(.+))?$/);
  return match?.[1]?.trim() ?? null;
};

const DEFAULT_CATEGORY_NAMES = {
  expense: "Makanan & Minuman",
  income: "Gaji",
} as const;

type AccountOption = {
  id: string;
  name: string;
  initial_balance?: number | string;
};

type TransactionSummary = {
  income: number;
  expense: number;
  net: number;
  topCategoryName: string | null;
  topCategoryAmount: number;
  expenseByCategory: Array<{ name: string; amount: number }>;
};

type PendingAccountRole = "single" | "source" | "destination";

const compactUuid = (value: string) => value.replaceAll("-", "");
const expandCompactUuid = (value: string) =>
  `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
const decodeUuidToken = (value?: string) => {
  if (!value) return undefined;
  return value.includes("-") ? value : expandCompactUuid(value);
};
const AWAITING_ACCOUNT_MARKER = "awaiting_account_name";
const buildAwaitingAccountMarker = (role: PendingAccountRole) => `${AWAITING_ACCOUNT_MARKER}:${role}`;
const parseAwaitingAccountMarker = (value?: string | null): PendingAccountRole | null => {
  if (!value || !value.startsWith(`${AWAITING_ACCOUNT_MARKER}:`)) {
    return null;
  }

  const role = value.slice(AWAITING_ACCOUNT_MARKER.length + 1);
  return role === "single" || role === "source" || role === "destination" ? role : null;
};
const normalizeText = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const linkTelegramAccount = async (
  chatId: number,
  telegramUser: {
    id: number;
    username?: string;
    first_name?: string;
    last_name?: string;
  },
  token: string,
) => {
  const { data: tokenRow, error: tokenError } = await adminClient
    .from("telegram_link_tokens")
    .select("id, user_id, expires_at, consumed_at")
    .eq("token", token)
    .maybeSingle();

  if (tokenError) throw tokenError;
  if (!tokenRow) {
    await sendTelegramMessage(chatId, "Token penghubung tidak ditemukan. Buat token baru dari aplikasi Dompetku.");
    return;
  }

  if (tokenRow.consumed_at) {
    await sendTelegramMessage(chatId, "Token ini sudah pernah dipakai. Buat token baru dari aplikasi Dompetku.");
    return;
  }

  if (new Date(tokenRow.expires_at).getTime() < Date.now()) {
    await sendTelegramMessage(chatId, "Token sudah kedaluwarsa. Buat token baru dari aplikasi Dompetku.");
    return;
  }

  const linkPayload = {
    user_id: tokenRow.user_id,
    telegram_chat_id: chatId,
    telegram_user_id: telegramUser.id,
    telegram_username: telegramUser.username ?? null,
    telegram_first_name: telegramUser.first_name ?? null,
    telegram_last_name: telegramUser.last_name ?? null,
    is_active: true,
    linked_at: new Date().toISOString(),
    last_interaction_at: new Date().toISOString(),
  };

  const { error: upsertError } = await adminClient
    .from("telegram_links")
    .upsert(linkPayload, {
      onConflict: "user_id",
    });

  if (upsertError) throw upsertError;

  const { error: consumeError } = await adminClient
    .from("telegram_link_tokens")
    .update({ consumed_at: new Date().toISOString() })
    .eq("id", tokenRow.id);

  if (consumeError) throw consumeError;

  await sendTelegramMessage(
    chatId,
    "Akun Telegram berhasil dihubungkan ke Dompetku. Sekarang kamu bisa kirim chat transaksi seperti: beli kopi 18000",
  );
};

const resolveCategoryId = async (userId: string, type: "income" | "expense", categoryName: string) => {
  let { data, error } = await adminClient
    .from("categories")
    .select("id, name")
    .eq("user_id", userId)
    .eq("type", type)
    .order("name", { ascending: true });

  if (error) throw error;
  if (!data || data.length === 0) {
    const { data: insertedCategory, error: insertError } = await adminClient
      .from("categories")
      .insert({
        user_id: userId,
        name: DEFAULT_CATEGORY_NAMES[type],
        type,
      })
      .select("id, name")
      .single();

    if (insertError) throw insertError;
    data = [insertedCategory];
  }

  const lowered = categoryName.toLowerCase();
  const exactMatch = data.find((item) => item.name.toLowerCase() === lowered);
  if (exactMatch) return exactMatch.id;

  const containsMatch = data.find((item) => item.name.toLowerCase().includes(lowered) || lowered.includes(item.name.toLowerCase()));
  if (containsMatch) return containsMatch.id;

  const nextCategoryName = categoryName.trim() || DEFAULT_CATEGORY_NAMES[type];
  const { data: insertedCategory, error: insertError } = await adminClient
    .from("categories")
    .insert({
      user_id: userId,
      name: nextCategoryName,
      type,
    })
    .select("id, name")
    .single();

  if (insertError) throw insertError;
  return insertedCategory.id;
};

const getUserAccounts = async (userId: string): Promise<AccountOption[]> => {
  const { data, error } = await adminClient
    .from("accounts")
    .select("id, name")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return data ?? [];
};

const detectMentionedAccounts = async (userId: string, ...candidates: string[]) => {
  const accounts = await getUserAccounts(userId);
  if (accounts.length === 0) {
    return [];
  }

  const normalizedCandidates = candidates
    .map((candidate) => normalizeText(candidate))
    .filter(Boolean);

  return accounts.filter((account) => {
    const accountName = normalizeText(account.name);
    if (!accountName) return false;

    return normalizedCandidates.some((candidate) =>
      candidate === accountName ||
      candidate.includes(accountName) ||
      accountName.includes(candidate)
    );
  });
};

const detectMentionedAccount = async (userId: string, ...candidates: string[]) => {
  const matches = await detectMentionedAccounts(userId, ...candidates);
  return matches[0] ?? null;
};

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const inferTransferAccountFromText = (
  accounts: AccountOption[],
  sourceMessage: string,
  role: "source" | "destination",
) => {
  const normalizedMessage = normalizeText(sourceMessage);

  for (const account of accounts) {
    const accountName = normalizeText(account.name);
    if (!accountName) continue;

    const escapedName = escapeRegex(accountName).replace(/\s+/g, "\\s+");
    const patterns = role === "source"
      ? [
          new RegExp(`\\bdari\\s+${escapedName}\\b`),
          new RegExp(`\\bpakai\\s+${escapedName}\\b`),
          new RegExp(`\\bvia\\s+${escapedName}\\b`),
        ]
      : [
          new RegExp(`\\bke\\s+${escapedName}\\b`),
          new RegExp(`\\bke\\s+akun\\s+${escapedName}\\b`),
          new RegExp(`\\bke\\s+rekening\\s+${escapedName}\\b`),
          new RegExp(`\\bmasuk\\s+(?:ke\\s+)?${escapedName}\\b`),
        ];

    if (patterns.some((pattern) => pattern.test(normalizedMessage))) {
      return account;
    }
  }

  return null;
};

const pickAccountByHint = (accounts: AccountOption[], hint?: string | null) => {
  const normalizedHint = normalizeText(hint ?? "");
  if (!normalizedHint) {
    return null;
  }

  return accounts.find((account) => {
    const accountName = normalizeText(account.name);
    return accountName === normalizedHint || accountName.includes(normalizedHint) || normalizedHint.includes(accountName);
  }) ?? null;
};

const resolveTransferAccounts = async (
  userId: string,
  parsed: ParsedTransaction,
  sourceMessage: string,
) => {
  const accounts = await getUserAccounts(userId);
  if (accounts.length === 0) {
    return { sourceAccount: null, destinationAccount: null };
  }

  const mentionedAccounts = await detectMentionedAccounts(
    userId,
    sourceMessage,
    parsed.description ?? "",
    parsed.sourceAccountName ?? "",
    parsed.destinationAccountName ?? "",
  );

  const sourceByHint = pickAccountByHint(accounts, parsed.sourceAccountName);
  const destinationByHint = pickAccountByHint(accounts, parsed.destinationAccountName);
  const sourceByText = inferTransferAccountFromText(accounts, sourceMessage, "source");
  const destinationByText = inferTransferAccountFromText(accounts, sourceMessage, "destination");

  let sourceAccount = sourceByHint ?? sourceByText ?? null;
  let destinationAccount = destinationByHint ?? destinationByText ?? null;

  if (!sourceAccount && mentionedAccounts.length > 0) {
    sourceAccount = mentionedAccounts[0];
  }

  if (!destinationAccount) {
    destinationAccount = mentionedAccounts.find((account) => account.id !== sourceAccount?.id) ?? null;
  }

  if (sourceAccount?.id === destinationAccount?.id) {
    if (!sourceByHint) {
      sourceAccount = null;
    }
    if (!destinationByHint) {
      destinationAccount = null;
    }
  }

  return { sourceAccount, destinationAccount };
};

const createAccountForUser = async (userId: string, name: string) => {
  const trimmedName = name.trim();
  if (!trimmedName) {
    throw new Error("Nama akun tidak boleh kosong");
  }

  const { data, error } = await adminClient
    .from("accounts")
    .insert({
      user_id: userId,
      name: trimmedName,
      initial_balance: 0,
    })
    .select("id, name")
    .single();

  if (error) throw error;
  return data;
};

const resolveLinkedUserIdByChat = async (chatId: number) => {
  const { data: linkRow, error } = await adminClient
    .from("telegram_links")
    .select("user_id")
    .eq("telegram_chat_id", chatId)
    .eq("is_active", true)
    .maybeSingle();

  if (error) throw error;
  return linkRow?.user_id ?? null;
};

const sendLinkingInstructions = async (chatId: number) => {
  const botHandle = env.telegramBotUsername ? `@${env.telegramBotUsername}` : "bot ini";
  await sendTelegramMessage(
    chatId,
    `Akun Telegram kamu belum terhubung. Login dulu ke Dompetku, buat token linking, lalu kirim /start <token> ke ${botHandle}.`,
  );
};

const buildHelpText = () =>
  [
    "Perintah yang bisa dipakai:",
    "/help - lihat daftar perintah",
    "/checksaldo - cek saldo total dan per akun",
    "/saldo <akun> - cek saldo akun tertentu",
    "/mutasi - lihat 5 transaksi terakhir",
    "/cari <kata> - cari transaksi dari kata kunci",
    "/akun - lihat daftar akun",
    "/budget - cek budget bulan ini",
    "/ringkasan - ringkasan hari ini, minggu ini, bulan ini",
    "/topkategori - kategori pengeluaran terbesar bulan ini",
    "/boros - bandingkan pengeluaran periode sekarang vs sebelumnya",
    "/status - cek status bot",
    "/hapus terakhir - hapus transaksi terakhir",
    "/auditharian - audit pengeluaran hari ini",
    "/auditmingguan - audit minggu kalender ini",
    "/auditbulanan - audit bulan berjalan",
    "",
    "Kamu juga bisa langsung chat transaksi, misalnya:",
    "beli kopi 10000 cash",
    "masuk ke BCA 250000",
    "transfer BRI ke Cash 100000",
  ].join("\n");

const getAccountsWithBalances = async (userId: string) => {
  const { data: accounts, error: accountsError } = await adminClient
    .from("accounts")
    .select("id, name, initial_balance")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });

  if (accountsError) throw accountsError;

  const { data: transactions, error: txError } = await adminClient
    .from("transactions")
    .select("type, amount, account_id, to_account_id")
    .eq("user_id", userId);

  if (txError) throw txError;

  const balances = new Map<string, number>();

  for (const account of accounts ?? []) {
    balances.set(account.id, Number(account.initial_balance ?? 0));
  }

  for (const tx of transactions ?? []) {
    const amount = Number(tx.amount ?? 0);

    if (tx.type === "income") {
      balances.set(tx.account_id, (balances.get(tx.account_id) ?? 0) + amount);
      continue;
    }

    if (tx.type === "expense") {
      balances.set(tx.account_id, (balances.get(tx.account_id) ?? 0) - amount);
      continue;
    }

    if (tx.type === "transfer") {
      balances.set(tx.account_id, (balances.get(tx.account_id) ?? 0) - amount);
      if (tx.to_account_id) {
        balances.set(tx.to_account_id, (balances.get(tx.to_account_id) ?? 0) + amount);
      }
    }
  }

  return (accounts ?? []).map((account) => ({
    id: account.id,
    name: account.name,
    balance: balances.get(account.id) ?? Number(account.initial_balance ?? 0),
  }));
};

const handleCheckSaldoCommand = async (chatId: number, userId: string) => {
  const accounts = await getAccountsWithBalances(userId);

  if (accounts.length === 0) {
    await sendTelegramMessage(chatId, "Belum ada akun. Tambahkan akun dulu di aplikasi atau lewat flow transaksi.");
    return;
  }

  const total = accounts.reduce((sum, account) => sum + account.balance, 0);
  const lines = [
    `Total saldo: ${formatCurrency(total)}`,
    "",
    ...accounts.map((account) => `${account.name}: ${formatCurrency(account.balance)}`),
  ];

  await sendTelegramMessage(chatId, lines.join("\n"));
};

const handleAkunCommand = async (chatId: number, userId: string) => {
  const accounts = await getAccountsWithBalances(userId);

  if (accounts.length === 0) {
    await sendTelegramMessage(chatId, "Belum ada akun yang terdaftar.");
    return;
  }

  const lines = [
    "Daftar akun kamu:",
    ...accounts.map((account, index) => `${index + 1}. ${account.name} - ${formatCurrency(account.balance)}`),
  ];

  await sendTelegramMessage(chatId, lines.join("\n"));
};

const handleMutasiCommand = async (chatId: number, userId: string) => {
  const { data, error } = await adminClient
    .from("transactions")
    .select(`
      id,
      date,
      type,
      amount,
      description,
      accounts:account_id (name),
      to_accounts:to_account_id (name),
      categories:category_id (name)
    `)
    .eq("user_id", userId)
    .order("date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(5);

  if (error) throw error;

  if (!data || data.length === 0) {
    await sendTelegramMessage(chatId, "Belum ada transaksi yang tercatat.");
    return;
  }

  const lines = [
    "5 transaksi terakhir:",
    ...data.map((tx, index) => {
      const amount = formatCurrency(Number(tx.amount ?? 0));
      const accountName = tx.accounts?.name ?? "-";
      const categoryName = tx.categories?.name ?? (tx.type === "transfer" ? "Transfer" : "Tanpa kategori");
      const description = tx.description ? ` - ${tx.description}` : "";

      if (tx.type === "transfer") {
        const toAccountName = tx.to_accounts?.name ?? "?";
        return `${index + 1}. ${tx.date} | Transfer ${amount} | ${accountName} -> ${toAccountName}${description}`;
      }

      const label = tx.type === "income" ? "Masuk" : "Keluar";
      return `${index + 1}. ${tx.date} | ${label} ${amount} | ${categoryName} | ${accountName}${description}`;
    }),
  ];

  await sendTelegramMessage(chatId, lines.join("\n"));
};

const handleBudgetCommand = async (chatId: number, userId: string) => {
  const today = getDateInTimezone();
  const monthRange = getMonthRange(today);
  const [transactions, monthlyBudget] = await Promise.all([
    getTransactionsForRange(userId, monthRange.startDate, monthRange.endDate),
    getMonthlyBudget(userId),
  ]);

  const summary = summarizeTransactions(transactions);

  if (monthlyBudget <= 0) {
    await sendTelegramMessage(
      chatId,
      `Budget bulanan belum disetel. Pengeluaran bulan ini: ${formatCurrency(summary.expense)}.`,
    );
    return;
  }

  const remaining = monthlyBudget - summary.expense;
  const usage = (summary.expense / monthlyBudget) * 100;
  const status =
    usage >= 100
      ? "Budget bulan ini sudah terlewati."
      : usage >= 90
        ? "Budget bulan ini hampir habis."
        : usage >= 70
          ? "Budget bulan ini mulai ketat."
          : "Budget bulan ini masih aman.";

  await sendTelegramMessage(
    chatId,
    [
      "Status budget bulan ini:",
      `Budget: ${formatCurrency(monthlyBudget)}`,
      `Terpakai: ${formatCurrency(summary.expense)} (${usage.toFixed(0)}%)`,
      `Sisa: ${formatCurrency(remaining)}`,
      status,
    ].join("\n"),
  );
};

const handleSaldoCommand = async (chatId: number, userId: string, query: string | null) => {
  const accounts = await getAccountsWithBalances(userId);

  if (accounts.length === 0) {
    await sendTelegramMessage(chatId, "Belum ada akun yang terdaftar.");
    return;
  }

  if (!query) {
    await handleCheckSaldoCommand(chatId, userId);
    return;
  }

  const normalizedQuery = normalizeText(query);
  const matched = accounts.find((account) => {
    const accountName = normalizeText(account.name);
    return accountName === normalizedQuery || accountName.includes(normalizedQuery) || normalizedQuery.includes(accountName);
  });

  if (!matched) {
    await sendTelegramMessage(chatId, `Akun "${query}" tidak ditemukan.`);
    return;
  }

  await sendTelegramMessage(chatId, `${matched.name}: ${formatCurrency(matched.balance)}`);
};

const handleCariCommand = async (chatId: number, userId: string, query: string | null) => {
  if (!query) {
    await sendTelegramMessage(chatId, 'Pakai format: /cari <kata>. Contoh: /cari kopi');
    return;
  }

  const { data, error } = await adminClient
    .from("transactions")
    .select(`
      id,
      date,
      type,
      amount,
      description,
      accounts:account_id (name),
      categories:category_id (name)
    `)
    .eq("user_id", userId)
    .or(`description.ilike.%${query}%,categories.name.ilike.%${query}%`)
    .order("date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(10);

  if (error) throw error;

  if (!data || data.length === 0) {
    await sendTelegramMessage(chatId, `Tidak ada transaksi yang cocok dengan "${query}".`);
    return;
  }

  const lines = [
    `Hasil pencarian "${query}":`,
    ...data.map((tx, index) => {
      const direction = tx.type === "income" ? "+" : tx.type === "expense" ? "-" : "";
      return `${index + 1}. ${tx.date} | ${direction}${formatCurrency(Number(tx.amount ?? 0))} | ${tx.categories?.name ?? "Tanpa kategori"} | ${tx.accounts?.name ?? "-"}${tx.description ? ` - ${tx.description}` : ""}`;
    }),
  ];

  await sendTelegramMessage(chatId, lines.join("\n"));
};

const buildCompactSummaryLine = (label: string, summary: TransactionSummary) =>
  `${label}: masuk ${formatCurrency(summary.income)}, keluar ${formatCurrency(summary.expense)}, selisih ${formatCurrency(summary.net)}`;

const handleRingkasanCommand = async (chatId: number, userId: string) => {
  const today = getDateInTimezone();
  const dayRange = { startDate: today, endDate: today };
  const weekRange = getWeekRange(today);
  const monthRange = getMonthRange(today);

  const [daily, weekly, monthly] = await Promise.all([
    getTransactionsForRange(userId, dayRange.startDate, dayRange.endDate),
    getTransactionsForRange(userId, weekRange.startDate, weekRange.endDate),
    getTransactionsForRange(userId, monthRange.startDate, monthRange.endDate),
  ]);

  const dailySummary = summarizeTransactions(daily);
  const weeklySummary = summarizeTransactions(weekly);
  const monthlySummary = summarizeTransactions(monthly);

  const lines = [
    "Ringkasan cepat:",
    buildCompactSummaryLine("Hari ini", dailySummary),
    buildCompactSummaryLine("Minggu ini", weeklySummary),
    buildCompactSummaryLine("Bulan ini", monthlySummary),
  ];

  if (monthlySummary.topCategoryName) {
    lines.push(`Kategori terbesar bulan ini: ${monthlySummary.topCategoryName} (${formatCurrency(monthlySummary.topCategoryAmount)})`);
  }

  await sendTelegramMessage(chatId, lines.join("\n"));
};

const handleTopKategoriCommand = async (chatId: number, userId: string) => {
  const today = getDateInTimezone();
  const monthRange = getMonthRange(today);
  const transactions = await getTransactionsForRange(userId, monthRange.startDate, monthRange.endDate);
  const summary = summarizeTransactions(transactions);

  if (summary.expenseByCategory.length === 0) {
    await sendTelegramMessage(chatId, "Belum ada pengeluaran bulan ini.");
    return;
  }

  const totalExpense = summary.expense || 1;
  const lines = [
    "Top kategori pengeluaran bulan ini:",
    ...summary.expenseByCategory.slice(0, 5).map((item, index) => {
      const share = (item.amount / totalExpense) * 100;
      return `${index + 1}. ${item.name} - ${formatCurrency(item.amount)} (${share.toFixed(0)}%)`;
    }),
  ];

  await sendTelegramMessage(chatId, lines.join("\n"));
};

const handleBorosCommand = async (chatId: number, userId: string) => {
  const today = getDateInTimezone();
  const currentWeek = getWeekRange(today);
  const previousWeek = getPreviousWeekRange(today);
  const currentMonth = getMonthRange(today);
  const previousMonth = getPreviousMonthRange(today);

  const [currentWeekTx, previousWeekTx, currentMonthTx, previousMonthTx] = await Promise.all([
    getTransactionsForRange(userId, currentWeek.startDate, currentWeek.endDate),
    getTransactionsForRange(userId, previousWeek.startDate, previousWeek.endDate),
    getTransactionsForRange(userId, currentMonth.startDate, currentMonth.endDate),
    getTransactionsForRange(userId, previousMonth.startDate, previousMonth.endDate),
  ]);

  const currentWeekSummary = summarizeTransactions(currentWeekTx);
  const previousWeekSummary = summarizeTransactions(previousWeekTx);
  const currentMonthSummary = summarizeTransactions(currentMonthTx);
  const previousMonthSummary = summarizeTransactions(previousMonthTx);

  const weekDiff = currentWeekSummary.expense - previousWeekSummary.expense;
  const monthDiff = currentMonthSummary.expense - previousMonthSummary.expense;

  const lines = [
    "Deteksi boros:",
    `Minggu ini vs minggu lalu: ${formatCurrency(currentWeekSummary.expense)} vs ${formatCurrency(previousWeekSummary.expense)} (${weekDiff >= 0 ? "+" : ""}${formatCurrency(weekDiff)})`,
    `Bulan ini vs bulan lalu: ${formatCurrency(currentMonthSummary.expense)} vs ${formatCurrency(previousMonthSummary.expense)} (${monthDiff >= 0 ? "+" : ""}${formatCurrency(monthDiff)})`,
  ];

  lines.push(
    weekDiff > 0
      ? "Pengeluaran minggu ini lebih tinggi dari minggu lalu. Cek transaksi impulsif atau kategori yang naik."
      : "Pengeluaran minggu ini tidak lebih boros dari minggu lalu.",
  );
  lines.push(
    monthDiff > 0
      ? "Pengeluaran bulan ini lebih tinggi dari bulan lalu. Perhatikan kategori yang mulai membengkak."
      : "Pengeluaran bulan ini masih lebih terkendali dibanding bulan lalu.",
  );

  await sendTelegramMessage(chatId, lines.join("\n"));
};

const handleStatusCommand = async (chatId: number, userId: string) => {
  const [accounts, latestTransactions] = await Promise.all([
    getUserAccounts(userId),
    getLatestTransactions(userId, 1),
  ]);

  const lines = [
    "Status bot:",
    `Bot Telegram: ${env.telegramBotUsername ? `@${env.telegramBotUsername}` : "aktif"}`,
    `Model AI: ${env.aerolinkModel}`,
    `Jumlah akun: ${accounts.length}`,
    `Transaksi terakhir: ${latestTransactions[0] ? `${latestTransactions[0].date} - ${formatCurrency(Number(latestTransactions[0].amount ?? 0))}` : "belum ada"}`,
  ];

  await sendTelegramMessage(chatId, lines.join("\n"));
};

const handleDeleteLastCommand = async (chatId: number, userId: string) => {
  const latestTransactions = await getLatestTransactions(userId, 1);
  const latest = latestTransactions[0];

  if (!latest) {
    await sendTelegramMessage(chatId, "Belum ada transaksi yang bisa dihapus.");
    return;
  }

  await sendTelegramMessage(
    chatId,
    `Hapus transaksi terakhir?\n${latest.date} | ${formatCurrency(Number(latest.amount ?? 0))} | ${latest.categories?.name ?? "Tanpa kategori"}${latest.description ? ` - ${latest.description}` : ""}`,
    {
      replyMarkup: {
        inline_keyboard: [[
          { text: "Ya, hapus", callback_data: `dl:${compactUuid(latest.id)}` },
          { text: "Batal", callback_data: `dc:${compactUuid(latest.id)}` },
        ]],
      },
    },
  );
};

const getTransactionsForRange = async (userId: string, startDate: string, endDate: string) => {
  const { data, error } = await adminClient
    .from("transactions")
    .select(`
      id,
      date,
      type,
      amount,
      description,
      categories:category_id (name)
    `)
    .eq("user_id", userId)
    .gte("date", startDate)
    .lte("date", endDate)
    .order("date", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data ?? [];
};

const summarizeTransactions = (transactions: Array<{
  type: string;
  amount: number | string;
  categories?: { name?: string | null } | null;
}>) => {
  let income = 0;
  let expense = 0;
  const expenseByCategory = new Map<string, number>();

  for (const tx of transactions) {
    const amount = Number(tx.amount ?? 0);

    if (tx.type === "income") {
      income += amount;
      continue;
    }

    if (tx.type === "expense") {
      expense += amount;
      const categoryName = tx.categories?.name ?? "Tanpa kategori";
      expenseByCategory.set(categoryName, (expenseByCategory.get(categoryName) ?? 0) + amount);
    }
  }

  const ranked = Array.from(expenseByCategory.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([name, amount]) => ({ name, amount }));

  return {
    income,
    expense,
    net: income - expense,
    topCategoryName: ranked[0]?.name ?? null,
    topCategoryAmount: ranked[0]?.amount ?? 0,
    expenseByCategory: ranked,
  } satisfies TransactionSummary;
};

const getMonthlyBudget = async (userId: string) => {
  const { data, error } = await adminClient
    .from("profiles")
    .select("monthly_budget")
    .eq("id", userId)
    .maybeSingle();

  if (error) throw error;
  return Number(data?.monthly_budget ?? 0);
};

const getLatestTransactions = async (userId: string, limit: number) => {
  const { data, error } = await adminClient
    .from("transactions")
    .select(`
      id,
      date,
      type,
      amount,
      description,
      account_id,
      accounts:account_id (name),
      categories:category_id (name)
    `)
    .eq("user_id", userId)
    .order("date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data ?? [];
};

const buildFallbackAuditRecommendations = ({
  periodLabel,
  income,
  expense,
  budgetUsage,
  topCategoryName,
  topCategoryAmount,
}: {
  periodLabel: string;
  income: number;
  expense: number;
  budgetUsage: number | null;
  topCategoryName: string | null;
  topCategoryAmount: number;
}) => {
  const recommendations: string[] = [];
  const net = income - expense;

  if (budgetUsage !== null) {
    if (budgetUsage >= 90) {
      recommendations.push(`Pengeluaran ${periodLabel} sudah sangat tinggi, sekitar ${budgetUsage.toFixed(0)}% dari budget bulanan.`);
    } else if (budgetUsage >= 70) {
      recommendations.push(`Pengeluaran ${periodLabel} mulai berat, sudah memakai ${budgetUsage.toFixed(0)}% dari budget bulanan.`);
    } else {
      recommendations.push(`Pengeluaran ${periodLabel} masih relatif aman di ${budgetUsage.toFixed(0)}% dari budget bulanan.`);
    }
  }

  if (net < 0) {
    recommendations.push(`Arus kas ${periodLabel} negatif. Pengeluaran lebih besar dari pemasukan.`);
  } else if (income > 0 && expense <= income * 0.6) {
    recommendations.push(`Arus kas ${periodLabel} sehat. Pemasukan masih lebih kuat daripada pengeluaran.`);
  }

  if (topCategoryName && expense > 0) {
    const share = (topCategoryAmount / expense) * 100;
    if (share >= 40) {
      recommendations.push(`Kategori paling dominan adalah ${topCategoryName}, sekitar ${share.toFixed(0)}% dari total pengeluaran.`);
    }
  }

  if (recommendations.length === 0) {
    recommendations.push(`Belum ada sinyal berlebihan untuk ${periodLabel}. Tetap jaga konsistensi pencatatan.`);
  }

  return recommendations;
};

const handleAuditCommand = async (
  chatId: number,
  userId: string,
  period: "daily" | "weekly" | "monthly",
) => {
  const today = getDateInTimezone();
  const periodConfig =
    period === "daily"
      ? { label: "hari ini", startDate: today, endDate: today }
      : period === "weekly"
        ? { label: "minggu ini", ...getWeekRange(today) }
        : { label: "bulan ini", ...getMonthRange(today) };

  const [transactions, monthlyBudget] = await Promise.all([
    getTransactionsForRange(userId, periodConfig.startDate, periodConfig.endDate),
    getMonthlyBudget(userId),
  ]);

  if (transactions.length === 0) {
    await sendTelegramMessage(
      chatId,
      `Belum ada transaksi untuk ${periodConfig.label}, jadi saya belum bisa bikin audit. Coba catat transaksi dulu ya.`,
    );
    return;
  }

  let income = 0;
  let expense = 0;
  const expenseByCategory = new Map<string, number>();

  for (const tx of transactions) {
    const amount = Number(tx.amount ?? 0);
    if (tx.type === "income") {
      income += amount;
    } else if (tx.type === "expense") {
      expense += amount;
      const categoryName = tx.categories?.name ?? "Tanpa kategori";
      expenseByCategory.set(categoryName, (expenseByCategory.get(categoryName) ?? 0) + amount);
    }
  }

  const sortedCategories = Array.from(expenseByCategory.entries()).sort((a, b) => b[1] - a[1]);
  const [topCategoryName, topCategoryAmount = 0] = sortedCategories[0] ?? [null, 0];
  const budgetUsage = monthlyBudget > 0 ? (expense / monthlyBudget) * 100 : null;
  const fallbackRecommendations = buildFallbackAuditRecommendations({
    periodLabel: periodConfig.label,
    income,
    expense,
    budgetUsage,
    topCategoryName,
    topCategoryAmount,
  });

  const lines = [
    `Audit ${periodConfig.label}:`,
    `Pemasukan: ${formatCurrency(income)}`,
    `Pengeluaran: ${formatCurrency(expense)}`,
    `Selisih: ${formatCurrency(income - expense)}`,
  ];

  if (topCategoryName) {
    lines.push(`Kategori terbesar: ${topCategoryName} (${formatCurrency(topCategoryAmount)})`);
  }

  if (budgetUsage !== null) {
    lines.push(`Pemakaian budget bulanan: ${budgetUsage.toFixed(0)}%`);
  }

  lines.push("");

  try {
    const aiRecommendation = await generateAuditRecommendation({
      periodLabel: periodConfig.label,
      income,
      expense,
      net: income - expense,
      budgetUsage,
      topCategoryName,
      topCategoryAmount,
      transactionCount: transactions.length,
    });
    lines.push(aiRecommendation);
  } catch (_error) {
    lines.push("Rekomendasi:");
    lines.push(...fallbackRecommendations.map((item, index) => `${index + 1}. ${item}`));
  }

  await sendTelegramMessage(chatId, lines.join("\n"));
};

const handleCommandMessage = async (chatId: number, text: string) => {
  const [command, ...args] = text.split(/\s+/);
  const normalizedCommand = command.toLowerCase();
  const query = args.join(" ").trim() || null;

  if (normalizedCommand === "/help" || normalizedCommand === "/start") {
    await sendTelegramMessage(chatId, buildHelpText());
    return true;
  }

  const userId = await resolveLinkedUserIdByChat(chatId);
  if (!userId) {
    await sendLinkingInstructions(chatId);
    return true;
  }

  if (normalizedCommand === "/checksaldo") {
    await handleCheckSaldoCommand(chatId, userId);
    return true;
  }

  if (normalizedCommand === "/saldo") {
    await handleSaldoCommand(chatId, userId, query);
    return true;
  }

  if (normalizedCommand === "/akun") {
    await handleAkunCommand(chatId, userId);
    return true;
  }

  if (normalizedCommand === "/mutasi") {
    await handleMutasiCommand(chatId, userId);
    return true;
  }

  if (normalizedCommand === "/cari") {
    await handleCariCommand(chatId, userId, query);
    return true;
  }

  if (normalizedCommand === "/budget") {
    await handleBudgetCommand(chatId, userId);
    return true;
  }

  if (normalizedCommand === "/ringkasan") {
    await handleRingkasanCommand(chatId, userId);
    return true;
  }

  if (normalizedCommand === "/topkategori") {
    await handleTopKategoriCommand(chatId, userId);
    return true;
  }

  if (normalizedCommand === "/boros") {
    await handleBorosCommand(chatId, userId);
    return true;
  }

  if (normalizedCommand === "/status") {
    await handleStatusCommand(chatId, userId);
    return true;
  }

  if (
    normalizedCommand === "/hapus_terakhir" ||
    (normalizedCommand === "/hapus" && normalizeText(query ?? "") === "terakhir")
  ) {
    await handleDeleteLastCommand(chatId, userId);
    return true;
  }

  if (normalizedCommand === "/auditharian") {
    await handleAuditCommand(chatId, userId, "daily");
    return true;
  }

  if (normalizedCommand === "/auditmingguan") {
    await handleAuditCommand(chatId, userId, "weekly");
    return true;
  }

  if (normalizedCommand === "/auditbulanan") {
    await handleAuditCommand(chatId, userId, "monthly");
    return true;
  }

  if (normalizedCommand.startsWith("/")) {
    await sendTelegramMessage(chatId, "Perintah belum tersedia. Coba /help untuk lihat daftar perintah.");
    return true;
  }

  return false;
};

const getAwaitingAccountPendingTransaction = async (userId: string) => {
  const { data, error } = await adminClient
    .from("telegram_pending_transactions")
    .select("id, user_id, status, parsed_payload, error_message, source_message")
    .eq("user_id", userId)
    .eq("status", "pending")
    .like("error_message", `${AWAITING_ACCOUNT_MARKER}:%`)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data;
};

const setPendingAwaitingAccountName = async (pendingId: string, role: PendingAccountRole) => {
  const { error } = await adminClient
    .from("telegram_pending_transactions")
    .update({
      error_message: buildAwaitingAccountMarker(role),
    })
    .eq("id", pendingId)
    .eq("status", "pending");

  if (error) throw error;
};

const updatePendingParsedPayload = async (pendingId: string, parsed: ParsedTransaction) => {
  const { error } = await adminClient
    .from("telegram_pending_transactions")
    .update({
      parsed_payload: parsed,
      error_message: null,
    })
    .eq("id", pendingId)
    .eq("status", "pending");

  if (error) throw error;
};

const handleTransactionMessage = async (
  chatId: number,
  userId: string,
  text: string,
) => {
  const awaitingPending = await getAwaitingAccountPendingTransaction(userId);
  if (awaitingPending) {
    const awaitingRole = parseAwaitingAccountMarker(awaitingPending.error_message) ?? "single";
    const account = await createAccountForUser(userId, text);
    const parsedPayload = awaitingPending.parsed_payload as ParsedTransaction;

    if (parsedPayload.type !== "transfer" || awaitingRole === "single") {
      const parsed = await savePendingTransaction(awaitingPending.id, account.id);
      await sendTelegramMessage(
        chatId,
        `Akun ${account.name} sudah saya buat. ${buildSavedTransactionMessage(parsed, account.name)}`,
      );
      return;
    }

    const nextParsed: ParsedTransaction = {
      ...parsedPayload,
      sourceAccountName: awaitingRole === "source" ? account.name : parsedPayload.sourceAccountName,
      destinationAccountName: awaitingRole === "destination" ? account.name : parsedPayload.destinationAccountName,
    };

    await updatePendingParsedPayload(awaitingPending.id, nextParsed);

    const transferAccounts = await resolveTransferAccounts(
      userId,
      nextParsed,
      awaitingPending.source_message ?? "",
    );

    if (transferAccounts.sourceAccount && transferAccounts.destinationAccount) {
      const saved = await savePendingTransaction(
        awaitingPending.id,
        transferAccounts.sourceAccount.id,
        transferAccounts.destinationAccount.id,
      );
      await sendTelegramMessage(
        chatId,
        `Akun ${account.name} sudah saya buat. ${buildSavedTransactionMessage(
          saved,
          transferAccounts.sourceAccount.name,
          transferAccounts.destinationAccount.name,
        )}`,
      );
      return;
    }

    await sendTelegramMessage(chatId, `Akun ${account.name} sudah saya buat.`);
    await askForAccountSelection(
      chatId,
      awaitingPending.id,
      userId,
      nextParsed,
      transferAccounts.sourceAccount ? "destination" : "source",
    );
    return;
  }

  const parsed = await analyzeTransactionText(text);

  const { data: pendingRow, error } = await adminClient
    .from("telegram_pending_transactions")
    .insert({
      user_id: userId,
      telegram_chat_id: chatId,
      source_message: text,
      parsed_payload: parsed,
      ai_model: env.aerolinkModel,
      status: "pending",
    })
    .select("id")
    .single();

  if (error) throw error;

  const telegramResponse = await sendTelegramMessage(chatId, buildConfirmationText(parsed), {
    replyMarkup: {
      inline_keyboard: [[
        { text: "Benar", callback_data: `confirm:${pendingRow.id}` },
        { text: "Salah", callback_data: `reject:${pendingRow.id}` },
      ]],
    },
  });

  const { error: updateError } = await adminClient
    .from("telegram_pending_transactions")
    .update({
      telegram_message_id: telegramResponse.result?.message_id ?? null,
    })
    .eq("id", pendingRow.id);

  if (updateError) throw updateError;
};

const getPendingTransaction = async (pendingId: string) => {
  const { data: pendingRow, error } = await adminClient
    .from("telegram_pending_transactions")
    .select("id, user_id, status, parsed_payload, source_message, error_message")
    .eq("id", pendingId)
    .maybeSingle();

  if (error) throw error;
  if (!pendingRow) throw new Error("Draft transaksi tidak ditemukan");
  if (pendingRow.status !== "pending") throw new Error("Draft transaksi ini sudah diproses");

  return pendingRow;
};

const savePendingTransaction = async (pendingId: string, accountId: string, toAccountId?: string | null) => {
  const pendingRow = await getPendingTransaction(pendingId);

  const parsed = pendingRow.parsed_payload as ParsedTransaction;
  const isTransfer = parsed.type === "transfer";

  if (isTransfer && !toAccountId) {
    throw new Error("Akun tujuan transfer belum dipilih");
  }

  if (isTransfer && accountId === toAccountId) {
    throw new Error("Akun asal dan tujuan transfer tidak boleh sama");
  }

  const categoryId = isTransfer
    ? null
    : await resolveCategoryId(pendingRow.user_id, parsed.type as "income" | "expense", parsed.category);

  const { data: transactionRow, error: transactionError } = await adminClient
    .from("transactions")
    .insert({
      user_id: pendingRow.user_id,
      date: parsed.date,
      type: parsed.type,
      account_id: accountId,
      to_account_id: isTransfer ? toAccountId : null,
      category_id: categoryId,
      amount: parsed.amount,
      description: parsed.description,
      tags: "telegram,ai",
      receipt_url: null,
    })
    .select("id")
    .single();

  if (transactionError) throw transactionError;

  const { error: updateError } = await adminClient
    .from("telegram_pending_transactions")
    .update({
      status: "confirmed",
      transaction_id: transactionRow.id,
      confirmed_at: new Date().toISOString(),
    })
    .eq("id", pendingId);

  if (updateError) throw updateError;

  return parsed;
};

const buildSavedTransactionMessage = (
  parsed: ParsedTransaction,
  sourceAccountName?: string | null,
  destinationAccountName?: string | null,
) => {
  if (parsed.type === "transfer") {
    return `Sip, transfer ${formatCurrency(parsed.amount)} dari ${sourceAccountName ?? "-"} ke ${destinationAccountName ?? "-"} sudah saya simpan.`;
  }

  return `Sip, transaksi ${parsed.type === "expense" ? "pengeluaran" : "pemasukan"} sebesar ${formatCurrency(parsed.amount)} sudah saya simpan${sourceAccountName ? ` ke akun ${sourceAccountName}` : ""}.`;
};

const askForAccountSelection = async (
  chatId: number,
  pendingId: string,
  userId: string,
  parsed: ParsedTransaction,
  role: PendingAccountRole = "single",
) => {
  const accounts = await getUserAccounts(userId);

  const prompt =
    role === "source"
      ? "Oke. Uangnya pindah dari akun yang mana?"
      : role === "destination"
        ? "Oke. Uangnya masuk ke akun yang mana?"
        : parsed.type === "expense"
          ? "Oke. Pembayarannya pakai akun yang mana?"
          : "Oke. Uang masuk ke akun yang mana?";

  const rows = accounts.map((account, index) => [
    {
      text: account.name,
      callback_data: `${
        role === "source" ? "as" : role === "destination" ? "ad" : "a"
      }:${compactUuid(pendingId)}:${index}`,
    },
  ]);
  rows.push([
    {
      text: "Tambah akun baru",
      callback_data: `${role === "source" ? "ns" : role === "destination" ? "nd" : "n"}:${compactUuid(pendingId)}`,
    },
  ]);

  await sendTelegramMessage(chatId, prompt, {
    replyMarkup: {
      inline_keyboard: rows,
    },
  });
};

const rejectPendingTransaction = async (pendingId: string) => {
  const { error } = await adminClient
    .from("telegram_pending_transactions")
    .update({
      status: "rejected",
      confirmed_at: new Date().toISOString(),
    })
    .eq("id", pendingId);

  if (error) throw error;
};

const deleteTransactionById = async (transactionId: string) => {
  const { error } = await adminClient
    .from("transactions")
    .delete()
    .eq("id", transactionId);

  if (error) throw error;
};

const markPendingTransactionFailed = async (pendingId: string, message: string) => {
  const { error } = await adminClient
    .from("telegram_pending_transactions")
    .update({
      status: "failed",
      error_message: message,
      confirmed_at: new Date().toISOString(),
    })
    .eq("id", pendingId)
    .eq("status", "pending");

  if (error) {
    console.error("Failed to mark pending transaction as failed", error);
  }
};

const toUserFacingErrorMessage = (error: unknown) => {
  const message = error instanceof Error ? error.message : "Terjadi kesalahan tak terduga";

  if (message.includes("Invalid amount returned by AI")) {
    return "Saya belum bisa membaca nominalnya. Coba kirim lagi dengan jumlah yang lebih jelas, misalnya: beli kopi 10000 cash atau masuk ke BCA 250000.";
  }

  if (message.includes("Aerolink request failed: 503")) {
    return "Layanan AI lagi sibuk sementara. Coba kirim lagi beberapa saat lagi ya.";
  }

  return `Maaf, saya belum bisa memproses pesan ini: ${message}`;
};

const handleCallbackQuery = async (callbackQuery: {
  id: string;
  data?: string;
  message?: { chat: { id: number } };
}) => {
  const chatId = callbackQuery.message?.chat.id;
  const data = callbackQuery.data;

  if (!chatId || !data) {
    return;
  }

  const [action, pendingToken, accountToken] = data.split(":");
  const pendingId = decodeUuidToken(pendingToken);
  const accountIndex = accountToken ? Number(accountToken) : undefined;

  if (!pendingId && action !== "dl" && action !== "dc") {
    await answerTelegramCallback(callbackQuery.id, "Aksi tidak valid");
    return;
  }

  if (action === "dl") {
    try {
      const transactionId = decodeUuidToken(pendingToken);
      if (!transactionId) {
        await answerTelegramCallback(callbackQuery.id, "Transaksi tidak valid");
        return;
      }
      await deleteTransactionById(transactionId);
      await answerTelegramCallback(callbackQuery.id, "Transaksi dihapus");
      await sendTelegramMessage(chatId, "Oke, transaksi terakhir sudah saya hapus.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Gagal menghapus transaksi";
      await answerTelegramCallback(callbackQuery.id, "Gagal menghapus");
      await sendTelegramMessage(chatId, `Maaf, transaksi belum bisa dihapus: ${message}`);
    }
    return;
  }

  if (action === "dc") {
    await answerTelegramCallback(callbackQuery.id, "Dibatalkan");
    await sendTelegramMessage(chatId, "Oke, penghapusan transaksi saya batalkan.");
    return;
  }

  if (action === "confirm") {
    try {
      const pendingRow = await getPendingTransaction(pendingId);
      const parsed = pendingRow.parsed_payload as ParsedTransaction;

      if (parsed.type === "transfer") {
        const transferAccounts = await resolveTransferAccounts(
          pendingRow.user_id,
          parsed,
          pendingRow.source_message ?? "",
        );

        if (transferAccounts.sourceAccount && transferAccounts.destinationAccount) {
          const saved = await savePendingTransaction(
            pendingId,
            transferAccounts.sourceAccount.id,
            transferAccounts.destinationAccount.id,
          );
          await answerTelegramCallback(callbackQuery.id, "Transfer disimpan");
          await sendTelegramMessage(
            chatId,
            buildSavedTransactionMessage(
              saved,
              transferAccounts.sourceAccount.name,
              transferAccounts.destinationAccount.name,
            ),
          );
          return;
        }

        const nextParsed: ParsedTransaction = {
          ...parsed,
          sourceAccountName: transferAccounts.sourceAccount?.name ?? parsed.sourceAccountName ?? null,
          destinationAccountName: transferAccounts.destinationAccount?.name ?? parsed.destinationAccountName ?? null,
        };
        await updatePendingParsedPayload(pendingId, nextParsed);

        await answerTelegramCallback(callbackQuery.id, "Pilih akun dulu");
        await askForAccountSelection(
          chatId,
          pendingId,
          pendingRow.user_id,
          nextParsed,
          transferAccounts.sourceAccount ? "destination" : "source",
        );
        return;
      }

      const matchedAccount = await detectMentionedAccount(
        pendingRow.user_id,
        pendingRow.source_message ?? "",
        parsed.description ?? "",
        parsed.destinationAccountName ?? "",
      );

      if (matchedAccount) {
        const saved = await savePendingTransaction(pendingId, matchedAccount.id);
        await answerTelegramCallback(callbackQuery.id, `Disimpan ke ${matchedAccount.name}`);
        await sendTelegramMessage(chatId, buildSavedTransactionMessage(saved, matchedAccount.name));
        return;
      }

      await answerTelegramCallback(callbackQuery.id, "Pilih akun dulu");
      await askForAccountSelection(chatId, pendingId, pendingRow.user_id, parsed);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Terjadi kesalahan saat menyiapkan pilihan akun";
      await answerTelegramCallback(callbackQuery.id, "Gagal menyiapkan akun");
      await sendTelegramMessage(chatId, `Maaf, saya belum bisa menampilkan pilihan akun: ${message}`);
    }
    return;
  }

  if (action === "n" || action === "ns" || action === "nd") {
    try {
      const role: PendingAccountRole =
        action === "ns" ? "source" : action === "nd" ? "destination" : "single";
      await setPendingAwaitingAccountName(pendingId, role);
      await answerTelegramCallback(callbackQuery.id, "Ketik nama akun baru");
      await sendTelegramMessage(
        chatId,
        "Balas chat ini dengan nama akun baru yang mau dipakai, misalnya: BCA, Dana, GoPay, Cash.",
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Gagal menyiapkan input akun baru";
      await answerTelegramCallback(callbackQuery.id, "Gagal menyiapkan akun baru");
      await sendTelegramMessage(chatId, `Maaf, saya belum bisa menyiapkan akun baru: ${message}`);
    }
    return;
  }

  if (action === "a" || action === "as" || action === "ad") {
    if (accountIndex === undefined || Number.isNaN(accountIndex) || accountIndex < 0) {
      await answerTelegramCallback(callbackQuery.id, "Akun tidak valid");
      return;
    }

    try {
      const pendingRow = await getPendingTransaction(pendingId);
      const accounts = await getUserAccounts(pendingRow.user_id);
      const selectedAccount = accounts[accountIndex];

      if (!selectedAccount) {
        await answerTelegramCallback(callbackQuery.id, "Akun tidak ditemukan");
        await sendTelegramMessage(chatId, "Maaf, akun yang dipilih tidak ditemukan. Coba kirim ulang transaksi ya.");
        return;
      }

      const parsedPayload = pendingRow.parsed_payload as ParsedTransaction;

      if (parsedPayload.type === "transfer" && action !== "a") {
        const nextParsed: ParsedTransaction = {
          ...parsedPayload,
          sourceAccountName: action === "as" ? selectedAccount.name : parsedPayload.sourceAccountName ?? null,
          destinationAccountName: action === "ad" ? selectedAccount.name : parsedPayload.destinationAccountName ?? null,
        };

        await updatePendingParsedPayload(pendingId, nextParsed);

        const transferAccounts = await resolveTransferAccounts(
          pendingRow.user_id,
          nextParsed,
          pendingRow.source_message ?? "",
        );

        if (transferAccounts.sourceAccount && transferAccounts.destinationAccount) {
          const saved = await savePendingTransaction(
            pendingId,
            transferAccounts.sourceAccount.id,
            transferAccounts.destinationAccount.id,
          );
          await answerTelegramCallback(callbackQuery.id, "Transfer disimpan");
          await sendTelegramMessage(
            chatId,
            buildSavedTransactionMessage(
              saved,
              transferAccounts.sourceAccount.name,
              transferAccounts.destinationAccount.name,
            ),
          );
          return;
        }

        await answerTelegramCallback(callbackQuery.id, "Pilih akun berikutnya");
        await askForAccountSelection(
          chatId,
          pendingId,
          pendingRow.user_id,
          nextParsed,
          transferAccounts.sourceAccount ? "destination" : "source",
        );
        return;
      }

      const parsed = await savePendingTransaction(pendingId, selectedAccount.id);
      await answerTelegramCallback(callbackQuery.id, "Transaksi disimpan");
      await sendTelegramMessage(chatId, buildSavedTransactionMessage(parsed, selectedAccount.name));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Terjadi kesalahan saat menyimpan transaksi";
      if (message.includes("Akun asal dan tujuan transfer tidak boleh sama")) {
        await answerTelegramCallback(callbackQuery.id, "Pilih akun yang berbeda");
        await sendTelegramMessage(chatId, "Untuk transfer, akun asal dan tujuan harus beda ya. Coba pilih akun lain.");
        return;
      }
      await markPendingTransactionFailed(pendingId, message);
      await answerTelegramCallback(callbackQuery.id, "Gagal menyimpan transaksi");
      await sendTelegramMessage(chatId, `Maaf, transaksi belum bisa disimpan: ${message}`);
    }
    return;
  }

  if (action === "reject") {
    try {
      await rejectPendingTransaction(pendingId);
      await answerTelegramCallback(callbackQuery.id, "Draft dibatalkan");
      await sendTelegramMessage(chatId, "Oke, draft ini saya batalkan. Kirim ulang chat yang lebih jelas ya.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Gagal membatalkan draft";
      await answerTelegramCallback(callbackQuery.id, "Gagal membatalkan draft");
      await sendTelegramMessage(chatId, `Maaf, draft belum bisa dibatalkan: ${message}`);
    }
    return;
  }

  await answerTelegramCallback(callbackQuery.id, "Aksi tidak dikenali");
};

const handleTelegramMessage = async (message: {
  chat: { id: number };
  from?: { id: number; username?: string; first_name?: string; last_name?: string };
  text?: string;
}) => {
  const chatId = message.chat.id;
  const text = message.text?.trim();

  if (!text) {
    await sendTelegramMessage(chatId, "Saat ini saya baru bisa memproses pesan teks transaksi.");
    return;
  }

  const startToken = extractTokenFromStart(text);
  if (startToken && message.from) {
    await linkTelegramAccount(chatId, message.from, startToken);
    return;
  }

  if (await handleCommandMessage(chatId, text)) {
    return;
  }

  const userId = await resolveLinkedUserIdByChat(chatId);
  if (!userId) {
    await sendLinkingInstructions(chatId);
    return;
  }

  await adminClient
    .from("telegram_links")
    .update({ last_interaction_at: new Date().toISOString() })
    .eq("telegram_chat_id", chatId);

  try {
    await handleTransactionMessage(chatId, userId, text);
  } catch (error) {
    console.error(error);
    await sendTelegramMessage(chatId, toUserFacingErrorMessage(error));
  }
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const update = await request.json();

    if (update.callback_query) {
      await handleCallbackQuery(update.callback_query);
      return json({ ok: true });
    }

    if (update.message) {
      await handleTelegramMessage(update.message);
      return json({ ok: true });
    }

    return json({ ok: true, ignored: true });
  } catch (error) {
    console.error(error);
    return json(
      { error: error instanceof Error ? error.message : "Unexpected error" },
      500,
    );
  }
});
