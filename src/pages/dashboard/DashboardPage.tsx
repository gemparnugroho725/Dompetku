import { useState, useEffect, useMemo } from 'react';
import { getTransactions, getProfile, updateMonthlyBudget, deleteTransaction } from '@/services/api';
import TransactionEditModal from '@/components/transactions/TransactionEditModal';
import TelegramLinkCard from '@/components/telegram/TelegramLinkCard';
import type { Transaction } from '@/services/api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatRupiah } from '@/lib/utils';
import { ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { ArrowDownCircle, ArrowUpCircle, Download, Pencil, Check, X, Trash2 } from 'lucide-react';

const COLORS = ['#0ea5e9', '#2563eb', '#1d4ed8', '#38bdf8', '#60a5fa', '#0c4a6e'];

export default function DashboardPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  const [monthlyBudget, setMonthlyBudget] = useState(5000000);
  const [isEditingBudget, setIsEditingBudget] = useState(false);
  const [budgetInput, setBudgetInput] = useState('');
  const [isSavingBudget, setIsSavingBudget] = useState(false);

  const dateObj = new Date();
  const [month, setMonth] = useState(dateObj.getMonth() + 1);
  const [year, setYear] = useState(dateObj.getFullYear());
  const [timeFrame, setTimeFrame] = useState<'daily' | 'weekly' | 'monthly'>('daily');

  // Edit/Delete State
  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);

  useEffect(() => {
    loadData();
  }, [month, year, timeFrame]);

  const loadData = async () => {
    setIsLoading(true);
    try {
      // If timeframe is monthly, we fetch all transactions for the year
      const targetMonth = timeFrame === 'monthly' ? undefined : month;
      
      const [data, profile] = await Promise.all([
        getTransactions({ month: targetMonth, year }),
        getProfile().catch(() => null)
      ]);
      setTransactions(data);
      if (profile && profile.monthly_budget) {
        setMonthlyBudget(profile.monthly_budget);
      }
    } catch (error) {
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveBudget = async () => {
    if (!budgetInput) return;
    
    // Safety check just in case string has other chars
    const numericValue = Number(budgetInput.toString().replace(/[^0-9]/g, ''));
    
    if (isNaN(numericValue) || numericValue <= 0) {
      alert("Harap masukkan angka yang valid.");
      return;
    }

    setIsSavingBudget(true);
    try {
      await updateMonthlyBudget(numericValue);
      setMonthlyBudget(numericValue);
      setIsEditingBudget(false);
    } catch (error: any) {
      console.error("Gagal menyimpan budget limit", error);
      alert("Gagal menyimpan batas pengeluaran: " + (error?.message || "Terjadi kesalahan di database. Pastikan sudah menjalankan SQL penambahan kolom monthly_budget."));
    } finally {
      setIsSavingBudget(false);
    }
  };

  const summary = useMemo(() => {
    let income = 0;
    let expense = 0;
    transactions.forEach(tx => {
      if (tx.type === 'income') income += Number(tx.amount);
      if (tx.type === 'expense') expense += Number(tx.amount);
    });
    return { income, expense };
  }, [transactions]);

  const expenseByCategory = useMemo(() => {
    const map = new Map<string, number>();
    transactions.forEach(tx => {
      if (tx.type === 'expense' && tx.categories) {
        const current = map.get(tx.categories.name) || 0;
        map.set(tx.categories.name, current + Number(tx.amount));
      }
    });
    return Array.from(map.entries()).map(([name, value]) => ({ name, value }));
  }, [transactions]);

  const expenseByAccount = useMemo(() => {
    const map = new Map<string, number>();
    transactions.forEach(tx => {
      if (tx.type === 'expense' && tx.accounts) {
        const current = map.get(tx.accounts.name) || 0;
        map.set(tx.accounts.name, current + Number(tx.amount));
      }
    });
    return Array.from(map.entries()).map(([name, value]) => ({ name, value }));
  }, [transactions]);

  const trendData = useMemo(() => {
    if (timeFrame === 'daily') {
      const daysInMonth = new Date(year, month, 0).getDate();
      const map = new Map<string, number>();
      for (let i = 1; i <= daysInMonth; i++) {
        const dayKey = i.toString().padStart(2, '0');
        map.set(dayKey, 0);
      }
      transactions.forEach(tx => {
        if (tx.type === 'expense') {
          const day = tx.date.split('-')[2];
          const current = map.get(day) || 0;
          map.set(day, current + Number(tx.amount));
        }
      });
      return Array.from(map.entries()).map(([label, amount]) => ({ label, amount })).sort((a,b) => a.label.localeCompare(b.label));
    } else if (timeFrame === 'weekly') {
      // Group by weeks of the month (approximate)
      const map = new Map<string, number>();
      for (let i = 1; i <= 5; i++) map.set(`W${i}`, 0);
      
      transactions.forEach(tx => {
        if (tx.type === 'expense') {
          const d = new Date(tx.date).getDate();
          const week = Math.ceil(d / 7);
          const weekKey = `W${Math.min(week, 5)}`;
          map.set(weekKey, (map.get(weekKey) || 0) + Number(tx.amount));
        }
      });
      return Array.from(map.entries()).map(([label, amount]) => ({ label, amount }));
    } else {
      // Monthly for the current year
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
      const map = new Map<string, number>();
      months.forEach(m => map.set(m, 0));

      transactions.forEach(tx => {
        if (tx.type === 'expense') {
          const m = new Date(tx.date).getMonth();
          const monthKey = months[m];
          map.set(monthKey, (map.get(monthKey) || 0) + Number(tx.amount));
        }
      });
      return Array.from(map.entries()).map(([label, amount]) => ({ label, amount }));
    }
  }, [transactions, month, year, timeFrame]);

  const handleExportCSV = () => {
    const headers = ['Date,Type,Category,Account,Amount,Description\n'];
    const rows = transactions.map(tx => {
      return `"${tx.date}","${tx.type}","${tx.categories?.name || ''}","${tx.accounts?.name || ''}",${tx.amount},"${tx.description || ''}"`;
    });
    const csvContent = headers.concat(rows).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `keuangan_pro_export_${year}_${month}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Apakah Anda yakin ingin menghapus transaksi ini?')) return;
    
    try {
      await deleteTransaction(id);
      loadData(); // Reload
    } catch (error) {
      console.error(error);
      alert('Gagal menghapus transaksi.');
    }
  };

  const handleEdit = (tx: Transaction) => {
    setSelectedTx(tx);
    setIsEditModalOpen(true);
  };

  if (isLoading) {
    return <div className="flex h-64 items-center justify-center">Memuat dashboard...</div>;
  }

  const budgetPct = Math.min((summary.expense / monthlyBudget) * 100, 100);

  return (
    <div className="space-y-6 pb-8 relative min-h-screen bg-slate-50 dark:bg-background">
      {/* Decorative background accent */}
      <div className="absolute top-0 inset-x-0 h-64 bg-gradient-to-b from-blue-100/50 to-transparent dark:from-blue-950/20 pointer-events-none" />
      
      {/* Dashboard Header Area */}
      <div className="relative rounded-2xl bg-white dark:bg-card p-6 sm:p-8 border border-blue-100 dark:border-border/40 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 overflow-hidden">
        <div className="absolute -right-10 top-0 w-32 h-32 bg-blue-500/10 rounded-full blur-3xl" />
        <div className="relative z-10">
          <h1 className="text-3xl font-extrabold tracking-tight text-blue-950 dark:text-blue-100">
            Dashboard Keuangan
          </h1>
          <p className="text-blue-600/80 dark:text-muted-foreground mt-1 text-sm font-semibold">Analisis gaya hidup dan arus kas Anda bulan ini.</p>
        </div>
        
        <div className="relative z-10 flex items-center gap-3 bg-white dark:bg-slate-900/50 p-1.5 rounded-lg border border-blue-200 shadow-sm dark:border-border/50">
          <select 
            value={month} 
            onChange={e => setMonth(Number(e.target.value))}
            className="h-9 rounded-md border-0 bg-transparent px-3 py-1 text-sm font-bold text-blue-900 dark:text-blue-100 focus:ring-0 cursor-pointer hover:bg-blue-50 dark:hover:bg-slate-800 transition-colors"
          >
            {Array.from({length: 12}).map((_, i) => (
              <option key={i+1} value={i+1}>{new Date(0, i).toLocaleString('id-ID', { month: 'long' })}</option>
            ))}
          </select>
          <div className="w-px h-5 bg-blue-200 dark:bg-border" />
          <select 
            value={year} 
            onChange={e => setYear(Number(e.target.value))}
            className="h-9 rounded-md border-0 bg-transparent px-3 py-1 text-sm font-bold text-blue-900 dark:text-blue-100 focus:ring-0 cursor-pointer hover:bg-blue-50 dark:hover:bg-slate-800 transition-colors"
          >
            {[2024, 2025, 2026, 2027].map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-6 md:grid-cols-2">
        <Card className="border-blue-100 dark:border-border/40 shadow-sm bg-white dark:bg-card relative overflow-hidden group hover:shadow-md transition-shadow">
          <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/10 rounded-full blur-2xl transform translate-x-1/2 -translate-y-1/2 group-hover:bg-emerald-500/20 transition-colors" />
          <CardHeader className="flex flex-row items-center justify-between pb-2 relative z-10">
            <CardTitle className="text-sm font-extrabold text-blue-900/60 dark:text-slate-400 uppercase tracking-widest">
              Total Pemasukan
            </CardTitle>
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-emerald-100 to-emerald-50 dark:from-emerald-900/30 dark:to-emerald-900/10 border border-emerald-200 dark:border-emerald-800 flex items-center justify-center shadow-sm">
              <ArrowDownCircle className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            </div>
          </CardHeader>
          <CardContent className="relative z-10 pt-1">
            <div className="text-4xl font-black tracking-tight text-blue-950 dark:text-slate-50">
              {formatRupiah(summary.income)}
            </div>
          </CardContent>
        </Card>
        
        <Card className="border-blue-100 dark:border-border/40 shadow-sm bg-white dark:bg-card relative overflow-hidden group hover:shadow-md transition-shadow">
          <div className="absolute top-0 right-0 w-24 h-24 bg-rose-500/10 rounded-full blur-2xl transform translate-x-1/2 -translate-y-1/2 group-hover:bg-rose-500/20 transition-colors" />
          <CardHeader className="flex flex-row items-center justify-between pb-2 relative z-10">
            <CardTitle className="text-sm font-extrabold text-blue-900/60 dark:text-slate-400 uppercase tracking-widest">
              Total Pengeluaran
            </CardTitle>
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-rose-100 to-rose-50 dark:from-rose-900/30 dark:to-rose-900/10 border border-rose-200 dark:border-rose-800 flex items-center justify-center shadow-sm">
              <ArrowUpCircle className="h-5 w-5 text-rose-600 dark:text-rose-400" />
            </div>
          </CardHeader>
          <CardContent className="relative z-10 pt-1">
            <div className="text-4xl font-black tracking-tight text-blue-950 dark:text-slate-50">
              {formatRupiah(summary.expense)}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-blue-100 dark:border-border/40 shadow-sm bg-white dark:bg-card relative overflow-hidden">
        <div className="absolute left-0 bottom-0 w-full h-1/2 bg-gradient-to-t from-blue-50/50 to-transparent dark:hidden pointer-events-none" />
        <CardHeader className="pb-2 relative z-10">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg font-bold text-blue-900 dark:text-blue-100">
              Visualisasi Budget
            </CardTitle>
            <span className="text-xs font-bold px-3 py-1 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 shadow-sm">
              {budgetPct.toFixed(0)}% terpakai
            </span>
          </div>
          {isEditingBudget ? (
            <div className="flex items-center gap-2 mt-2">
              <span className="text-sm font-bold text-blue-900 dark:text-blue-100">Rp</span>
              <Input 
                type="text" 
                inputMode="numeric"
                value={budgetInput} 
                onChange={e => setBudgetInput(e.target.value)}
                className="h-8 w-32 text-sm border-blue-200 dark:border-border/50 bg-white dark:bg-slate-900/50"
                autoFocus
              />
              <Button size="icon" variant="ghost" className="h-8 w-8 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20" onClick={handleSaveBudget} disabled={isSavingBudget}>
                <Check size={16} strokeWidth={3} />
              </Button>
              <Button size="icon" variant="ghost" className="h-8 w-8 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/20" onClick={() => setIsEditingBudget(false)}>
                <X size={16} strokeWidth={3} />
              </Button>
            </div>
          ) : (
            <div className="text-sm font-medium text-blue-700/70 dark:text-slate-400 flex items-center gap-2 mt-1">
              Batas pengeluaran per bulan: <span className="font-bold text-blue-900 dark:text-slate-300">{formatRupiah(monthlyBudget)}</span>
              <button 
                onClick={() => { setBudgetInput(monthlyBudget.toString()); setIsEditingBudget(true); }} 
                className="p-1 hover:bg-blue-100 dark:hover:bg-slate-800 rounded-md text-blue-600 dark:text-blue-400 transition-colors"
                title="Edit Batas Pengeluaran"
              >
                <Pencil size={14} />
              </button>
            </div>
          )}
        </CardHeader>
        <CardContent className="relative z-10">
          <div className="h-4 w-full rounded-full bg-blue-50 dark:bg-slate-800 overflow-hidden border border-blue-100 dark:border-slate-700 shadow-inner p-0.5">
            <div 
              className={`h-full rounded-full transition-all duration-1000 ease-out shadow-sm ${
                budgetPct > 90 
                  ? 'bg-rose-500' 
                  : budgetPct > 70 
                    ? 'bg-amber-400' 
                    : 'bg-blue-500'
              }`} 
              style={{ width: `${budgetPct}%` }}
            />
          </div>
        </CardContent>
      </Card>

      <TelegramLinkCard />

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="border-blue-100 dark:border-border/40 shadow-sm bg-white dark:bg-card group sm:col-span-2">
          <CardHeader className="border-b border-blue-50 dark:border-border/40 pb-4 mb-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <CardTitle className="text-lg font-bold text-blue-950 dark:text-blue-100">Tren Pengeluaran</CardTitle>
            <div className="flex items-center bg-blue-50/50 dark:bg-slate-900/50 p-1 rounded-lg border border-blue-100 dark:border-border/40">
              {(['daily', 'weekly', 'monthly'] as const).map((tf) => (
                <button
                  key={tf}
                  onClick={() => setTimeFrame(tf)}
                  className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${
                    timeFrame === tf
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'text-blue-700/60 dark:text-slate-400 hover:text-blue-900 dark:hover:text-slate-200'
                  }`}
                >
                  {tf === 'daily' ? 'Harian' : tf === 'weekly' ? 'Mingguan' : 'Bulanan'}
                </button>
              ))}
            </div>
          </CardHeader>
          <CardContent>
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trendData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#cbd5e1" strokeOpacity={0.5} />
                  <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: '#475569', fontSize: 12, fontWeight: 600 }} />
                  <YAxis 
                    tickFormatter={(val) => `Rp${(val/1000).toFixed(0)}k`} 
                    axisLine={false} 
                    tickLine={false}
                    tick={{ fill: '#64748b', fontSize: 12 }}
                  />
                  <Tooltip 
                    formatter={(val: any) => formatRupiah(Number(val))}
                    labelFormatter={(label) => timeFrame === 'daily' ? `Tanggal ${label}` : timeFrame === 'weekly' ? `Minggu ${label}` : `Bulan ${label}`}
                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                  />
                  <Line type="monotone" dataKey="amount" stroke="#2563eb" strokeWidth={3} dot={{ r: 4, fill: '#2563eb', strokeWidth: 2, stroke: '#fff' }} activeDot={{ r: 6, strokeWidth: 0 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="border-blue-100 dark:border-border/40 shadow-sm bg-white dark:bg-card">
          <CardHeader className="border-b border-blue-50 dark:border-border/40 pb-4 mb-4">
            <CardTitle className="text-lg font-bold text-blue-950 dark:text-blue-100">Kategori Pengeluaran</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px] w-full">
              {expenseByCategory.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={expenseByCategory}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={90}
                      paddingAngle={2}
                      dataKey="value"
                    >
                      {expenseByCategory.map((_entry: any, index: number) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip 
                      formatter={(val: any) => formatRupiah(Number(val))} 
                      contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-full flex-col items-center justify-center text-blue-900/40 dark:text-slate-500 text-sm font-semibold">
                  <div className="h-10 w-10 mb-2 opacity-50 flex items-center justify-center border-4 border-dashed border-current rounded-full" />
                  Belum ada data pengeluaran.
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="border-blue-100 dark:border-border/40 shadow-sm bg-white dark:bg-card">
          <CardHeader className="border-b border-blue-50 dark:border-border/40 pb-4 mb-4">
            <CardTitle className="text-lg font-bold text-blue-950 dark:text-blue-100">Sumber Akun Pengeluaran</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px] w-full">
              {expenseByAccount.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={expenseByAccount}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={90}
                      paddingAngle={2}
                      dataKey="value"
                    >
                      {expenseByAccount.map((_entry: any, index: number) => (
                        <Cell key={`cell-${index}`} fill={COLORS[(index + 2) % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip 
                      formatter={(val: any) => formatRupiah(Number(val))} 
                      contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-full flex-col items-center justify-center text-blue-900/40 dark:text-slate-500 text-sm font-semibold">
                  <div className="h-10 w-10 mb-2 opacity-50 flex items-center justify-center border-4 border-dashed border-current rounded-full" />
                  Belum ada data pengeluaran.
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-blue-100 dark:border-border/40 shadow-sm bg-white dark:bg-card mt-6">
        <CardHeader className="flex flex-row items-center justify-between border-b border-blue-100 dark:border-border/40 pb-5 bg-blue-50/30 dark:bg-slate-900/20 rounded-t-xl">
          <div>
            <CardTitle className="text-lg font-bold text-blue-950 dark:text-blue-100">Riwayat Transaksi</CardTitle>
            <CardDescription className="text-blue-700/70 font-medium mt-1 dark:text-slate-400">Daftar lengkap transaksi Anda bulan ini.</CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={handleExportCSV} className="gap-2 text-blue-700 border-blue-200 hover:bg-blue-100 font-bold dark:text-blue-400 dark:border-blue-800 dark:hover:bg-blue-900/30">
            <Download size={16} />
            Export CSV
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          {/* Mobile View (shown on small screens) */}
          <div className="md:hidden divide-y divide-blue-50 dark:divide-border/40">
            {transactions.length > 0 ? transactions.map((tx) => (
              <div key={tx.id} className="p-4 bg-white dark:bg-card active:bg-blue-50/50 dark:active:bg-slate-800 transition-colors">
                <div className="flex justify-between items-start mb-2">
                  <div className="flex flex-col">
                    <span className="text-[10px] font-black uppercase text-blue-600/60 dark:text-slate-500 mb-1">{tx.date}</span>
                    <div className="font-bold text-blue-950 dark:text-slate-100 text-sm">
                      {tx.type === 'transfer' ? 'Transfer Antar Akun' : (tx.categories?.name || 'Kategori Baru')}
                    </div>
                    <div className="text-[10px] font-semibold text-blue-600/70 dark:text-slate-500">
                      {tx.type === 'transfer' 
                        ? `${tx.accounts?.name} → ${tx.to_accounts?.name || '???'}`
                        : tx.accounts?.name
                      }
                    </div>
                  </div>
                  <div className={`text-sm font-black tracking-tight ${
                    tx.type === 'income' ? 'text-emerald-600' :
                    tx.type === 'expense' ? 'text-rose-600' :
                    'text-blue-600'
                  }`}>
                    {tx.type === 'income' ? '+' : tx.type === 'expense' ? '-' : ''}
                    {formatRupiah(tx.amount)}
                  </div>
                </div>
                
                {tx.description && (
                  <p className="text-xs text-blue-800/60 dark:text-slate-500 italic line-clamp-1 mb-3">
                    {tx.description}
                  </p>
                )}
                
                <div className="flex items-center justify-end gap-2 mt-2">
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="h-8 px-3 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 gap-1.5 text-[11px] font-bold"
                    onClick={() => handleEdit(tx)}
                  >
                    <Pencil size={12} />
                    Edit
                  </Button>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="h-8 px-3 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/20 gap-1.5 text-[11px] font-bold"
                    onClick={() => handleDelete(tx.id)}
                  >
                    <Trash2 size={12} />
                    Hapus
                  </Button>
                </div>
              </div>
            )) : (
              <div className="p-10 text-center text-slate-400 font-medium text-sm">Belum ada transaksi di periode ini.</div>
            )}
          </div>

          {/* Desktop View (hidden on small screens) */}
          <div className="hidden md:block relative w-full overflow-auto rounded-b-xl">
            <table className="w-full text-sm font-medium">
              <thead className="bg-blue-50/80 dark:bg-blue-950/20 text-blue-900 dark:text-blue-300 border-b border-blue-100 dark:border-border/40">
                <tr>
                  <th className="h-12 px-6 text-left align-middle font-bold tracking-wide">Tgl</th>
                  <th className="h-12 px-6 text-left align-middle font-bold tracking-wide">Kategori & Akun</th>
                  <th className="h-12 px-6 text-left align-middle font-bold tracking-wide max-w-[200px]">Deskripsi</th>
                  <th className="h-12 px-6 text-right align-middle font-bold tracking-wide">Jumlah</th>
                  <th className="h-12 px-6 text-center align-middle font-bold tracking-wide">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-blue-50 dark:divide-border/40">
                {transactions.length > 0 ? transactions.map((tx, idx) => (
                  <tr key={tx.id} className={`transition-colors hover:bg-blue-50/50 dark:hover:bg-slate-800/50 ${idx % 2 === 0 ? 'bg-white dark:bg-card' : 'bg-slate-50/30 dark:bg-slate-900/10'}`}>
                    <td className="p-4 px-6 align-middle whitespace-nowrap text-blue-900/70 font-semibold dark:text-slate-400">{tx.date}</td>
                    <td className="p-4 px-6 align-middle">
                      <div className="font-bold text-blue-950 dark:text-slate-100">
                        {tx.type === 'transfer' ? 'Transfer Antar Akun' : (tx.categories?.name || 'Kategori Baru')}
                      </div>
                      <div className="text-xs font-semibold text-blue-600/70 dark:text-slate-500 mt-0.5">
                        {tx.type === 'transfer' 
                          ? `${tx.accounts?.name} → ${tx.to_accounts?.name || '???'}`
                          : tx.accounts?.name
                        }
                      </div>
                    </td>
                    <td className="p-4 px-6 align-middle truncate max-w-[200px] text-blue-800/80 dark:text-slate-400 border-l border-r border-transparent">
                      {tx.description || '-'}
                    </td>
                    <td className={`p-4 px-6 align-middle text-right font-black tracking-tight whitespace-nowrap ${
                      tx.type === 'income' ? 'text-emerald-600 dark:text-emerald-400' :
                      tx.type === 'expense' ? 'text-rose-600 dark:text-rose-400' :
                      'text-blue-700 dark:text-slate-400'
                    }`}>
                      {tx.type === 'income' ? '+' : tx.type === 'expense' ? '-' : ''}
                      {formatRupiah(Number(tx.amount))}
                    </td>
                    <td className="p-4 px-6 align-middle text-center">
                      <div className="flex items-center justify-center gap-1">
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-8 w-8 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20"
                          onClick={() => handleEdit(tx)}
                        >
                          <Pencil size={14} />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-8 w-8 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/20"
                          onClick={() => handleDelete(tx.id)}
                        >
                          <Trash2 size={14} />
                        </Button>
                      </div>
                    </td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-slate-500">Belum ada transaksi direkam.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {selectedTx && (
        <TransactionEditModal 
          transaction={selectedTx}
          isOpen={isEditModalOpen}
          onClose={() => setIsEditModalOpen(false)}
          onSuccess={loadData}
        />
      )}
    </div>
  );
}
