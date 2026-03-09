import { useState, useEffect, useMemo } from 'react';
import { getTransactions, deleteTransaction } from '@/services/api';
import TransactionEditModal from '@/components/transactions/TransactionEditModal';
import type { Transaction } from '@/services/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { formatRupiah } from '@/lib/utils';
import { 
  ResponsiveContainer, 
  PieChart, 
  Pie, 
  Cell, 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  Tooltip, 
  CartesianGrid,
  Legend
} from 'recharts';
import { 
  ArrowDownCircle, 
  ArrowUpCircle, 
  Calendar, 
  Filter, 
  ArrowRightLeft,
  Download,
  Tags,
  Trash2,
  Pencil
} from 'lucide-react';

const COLORS = ['#2563eb', '#0ea5e9', '#38bdf8', '#7dd3fc', '#bae6fd', '#0c4a6e'];

export default function ReportsPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  // Edit/Delete State
  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  
  // Date Range State
  const today = new Date().toISOString().split('T')[0];
  const firstDayOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];
  
  const [startDate, setStartDate] = useState(firstDayOfMonth);
  const [endDate, setEndDate] = useState(today);
  const [preset, setPreset] = useState('month'); // today, week, month, 30days, custom

  useEffect(() => {
    loadData();
  }, [startDate, endDate]);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const data = await getTransactions({ startDate, endDate });
      setTransactions(data);
    } catch (error) {
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  const applyPreset = (p: string) => {
    setPreset(p);
    const now = new Date();
    let start = new Date();
    let end = new Date();

    if (p === 'today') {
      // already set to now
    } else if (p === 'week') {
      start.setDate(now.getDate() - now.getDay()); // Start of week (Sunday)
    } else if (p === 'month') {
      start = new Date(now.getFullYear(), now.getMonth(), 1);
    } else if (p === '30days') {
      start.setDate(now.getDate() - 30);
    } else {
      return; // custom
    }

    setStartDate(start.toISOString().split('T')[0]);
    setEndDate(end.toISOString().split('T')[0]);
  };

  const summary = useMemo(() => {
    let income = 0;
    let expense = 0;
    transactions.forEach(tx => {
      if (tx.type === 'income') income += Number(tx.amount);
      if (tx.type === 'expense') expense += Number(tx.amount);
    });
    return { income, expense, net: income - expense };
  }, [transactions]);

  const expenseByCategory = useMemo(() => {
    const map = new Map<string, number>();
    transactions.forEach(tx => {
      if (tx.type === 'expense' && tx.categories) {
        const current = map.get(tx.categories.name) || 0;
        map.set(tx.categories.name, current + Number(tx.amount));
      }
    });
    return Array.from(map.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [transactions]);

  const trendData = useMemo(() => {
    const map = new Map<string, number>();
    // Pre-fill days if the range is small enough
    // For now just dynamic
    transactions.forEach(tx => {
      if (tx.type === 'expense') {
        const date = tx.date;
        map.set(date, (map.get(date) || 0) + Number(tx.amount));
      }
    });
    return Array.from(map.entries())
      .map(([label, amount]) => ({ label, amount }))
      .sort((a,b) => a.label.localeCompare(b.label));
  }, [transactions]);

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
    link.setAttribute('download', `keuangan_pro_laporan_${startDate}_to_${endDate}.csv`);
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

  return (
    <div className="space-y-6 pb-20 relative">
      <div className="absolute top-0 inset-x-0 h-64 bg-gradient-to-b from-blue-100/40 to-transparent dark:from-blue-950/10 pointer-events-none" />
      
      <div className="relative flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 overflow-hidden bg-white dark:bg-card p-6 sm:p-8 rounded-2xl border border-blue-100 dark:border-border/40 shadow-sm">
        <div className="relative z-10">
          <h1 className="text-3xl font-extrabold tracking-tight text-blue-950 dark:text-blue-100">Laporan Keuangan</h1>
          <p className="text-blue-600/80 dark:text-muted-foreground mt-1 text-sm font-semibold">Pantau pergerakan uang dalam rentang waktu tertentu.</p>
        </div>
        <Button variant="outline" className="relative z-10 border-blue-200 text-blue-700 hover:bg-blue-50 font-bold gap-2" onClick={handleExportCSV}>
          <Download size={18} />
          Export CSV
        </Button>
      </div>

      {/* Date Filters Card */}
      <Card className="border-blue-100 dark:border-border/40 shadow-sm bg-white dark:bg-card">
        <CardContent className="p-6">
          <div className="flex flex-col lg:flex-row gap-6 items-end">
            <div className="flex-1 w-full space-y-4">
              <Label className="text-sm font-bold text-blue-900/60 dark:text-slate-400 uppercase tracking-widest px-1">Presets Cepat</Label>
              <div className="flex flex-wrap gap-2">
                {[
                  { id: 'today', label: 'Hari Ini' },
                  { id: 'week', label: 'Minggu Ini' },
                  { id: 'month', label: 'Bulan Ini' },
                  { id: '30days', label: '30 Hari Terakhir' },
                  { id: 'custom', label: 'Custom' },
                ].map(p => (
                  <Button
                    key={p.id}
                    variant={preset === p.id ? 'default' : 'outline'}
                    size="sm"
                    className={`rounded-full px-5 font-bold transition-all ${preset === p.id ? 'bg-blue-600 shadow-md shadow-blue-600/20' : 'border-blue-100 hover:border-blue-300'}`}
                    onClick={() => applyPreset(p.id)}
                  >
                    {p.label}
                  </Button>
                ))}
              </div>
            </div>
            
            <div className="flex flex-col sm:flex-row gap-4 w-full lg:w-auto">
              <div className="space-y-2 flex-1 sm:w-40">
                <Label htmlFor="start" className="text-xs font-bold text-blue-900 dark:text-slate-300 ml-1">Dari</Label>
                <Input 
                  id="start" 
                  type="date" 
                  value={startDate} 
                  onChange={e => { setStartDate(e.target.value); setPreset('custom'); }}
                  className="rounded-xl border-blue-200 dark:border-border/50 bg-blue-50/20 font-semibold"
                />
              </div>
              <div className="flex items-center justify-center pt-6 text-blue-300 hidden sm:flex">
                <ArrowRightLeft size={16} />
              </div>
              <div className="space-y-2 flex-1 sm:w-40">
                <Label htmlFor="end" className="text-xs font-bold text-blue-900 dark:text-slate-300 ml-1">Hingga</Label>
                <Input 
                  id="end" 
                  type="date" 
                  value={endDate} 
                  onChange={e => { setEndDate(e.target.value); setPreset('custom'); }}
                  className="rounded-xl border-blue-200 dark:border-border/50 bg-blue-50/20 font-semibold"
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Summary Cards */}
      <div className="grid gap-6 md:grid-cols-3">
        <Card className="bg-emerald-50 dark:bg-emerald-950/20 border-emerald-100 dark:border-emerald-900/50 shadow-sm relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-16 h-16 bg-emerald-500/10 rounded-full blur-xl transform translate-x-1/2 -translate-y-1/2" />
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="h-10 w-10 rounded-xl bg-emerald-100 flex items-center justify-center text-emerald-600 dark:bg-emerald-900/50 dark:text-emerald-400">
                <ArrowDownCircle size={20} />
              </div>
              <span className="text-[10px] font-black uppercase tracking-tighter text-emerald-600/60 dark:text-emerald-400/50">Total Masuk</span>
            </div>
            <div className="text-2xl font-black text-blue-950 dark:text-slate-50 tracking-tight">{formatRupiah(summary.income)}</div>
          </CardContent>
        </Card>

        <Card className="bg-rose-50 dark:bg-rose-950/20 border-rose-100 dark:border-rose-900/50 shadow-sm relative overflow-hidden">
          <div className="absolute top-0 right-0 w-16 h-16 bg-rose-500/10 rounded-full blur-xl transform translate-x-1/2 -translate-y-1/2" />
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="h-10 w-10 rounded-xl bg-rose-100 flex items-center justify-center text-rose-600 dark:bg-rose-900/50 dark:text-rose-400">
                <ArrowUpCircle size={20} />
              </div>
              <span className="text-[10px] font-black uppercase tracking-tighter text-rose-600/60 dark:text-rose-400/50">Total Keluar</span>
            </div>
            <div className="text-2xl font-black text-blue-950 dark:text-slate-50 tracking-tight">{formatRupiah(summary.expense)}</div>
          </CardContent>
        </Card>

        <Card className="bg-blue-600 shadow-md shadow-blue-600/20 relative overflow-hidden border-0">
          <div className="absolute top-0 right-0 w-24 h-24 bg-white/10 rounded-full blur-2xl transform translate-x-1/2 -translate-y-1/2" />
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="h-10 w-10 rounded-xl bg-white/20 flex items-center justify-center text-white">
                <Filter size={20} />
              </div>
              <span className="text-[10px] font-black uppercase tracking-tighter text-blue-100/70">Saldo Bersih</span>
            </div>
            <div className="text-2xl font-black text-white tracking-tight">{formatRupiah(summary.net)}</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Trend Graph */}
        <Card className="border-blue-100 dark:border-border/40 shadow-sm bg-white dark:bg-card">
          <CardHeader className="pb-4 border-b border-blue-50 dark:border-border/40 mb-6 flex flex-row items-center justify-between">
             <CardTitle className="text-lg font-bold text-blue-900 dark:text-blue-100">Tren Pengeluaran</CardTitle>
             <Calendar size={18} className="text-blue-200" />
          </CardHeader>
          <CardContent>
            <div className="h-[300px] w-full">
              {trendData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={trendData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#cbd5e1" strokeOpacity={0.5} />
                    <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: '#475569', fontSize: 11 }} />
                    <YAxis tickFormatter={(val) => `Rp${(val/1000).toFixed(0)}k`} axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 11 }} />
                    <Tooltip 
                      formatter={(val: any) => formatRupiah(Number(val))}
                      contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                    />
                    <Line type="monotone" dataKey="amount" stroke="#2563eb" strokeWidth={3} dot={{ r: 4, fill: '#2563eb', strokeWidth: 2, stroke: '#fff' }} />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-full items-center justify-center text-slate-400 italic text-sm">Tidak ada data tren untuk periode ini.</div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Categories Pie */}
        <Card className="border-blue-100 dark:border-border/40 shadow-sm bg-white dark:bg-card">
          <CardHeader className="pb-4 border-b border-blue-50 dark:border-border/40 mb-6 flex flex-row items-center justify-between">
             <CardTitle className="text-lg font-bold text-blue-900 dark:text-blue-100">Proporsi Kategori</CardTitle>
             <Tags size={18} className="text-blue-200" />
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
                      paddingAngle={4}
                      dataKey="value"
                    >
                      {expenseByCategory.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip 
                      formatter={(val: any) => formatRupiah(Number(val))}
                      contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                    />
                    <Legend verticalAlign="bottom" height={36}/>
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-full items-center justify-center text-slate-400 italic text-sm">Tidak ada data kategori untuk periode ini.</div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Transaction List */}
      <Card className="border-blue-100 dark:border-border/40 shadow-sm bg-white dark:bg-card overflow-hidden">
        <CardHeader className="bg-blue-50/30 dark:bg-slate-900/20 border-b border-blue-100 dark:border-border/40">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg font-bold text-blue-950 dark:text-blue-100">Detail Transaksi</CardTitle>
            <div className="text-xs font-bold text-blue-600/70 bg-white dark:bg-slate-800 px-3 py-1 rounded-full border border-blue-100 dark:border-border/60">
              {transactions.length} Item
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {/* Mobile View */}
          <div className="md:hidden divide-y divide-slate-50 dark:divide-border/40">
            {transactions.length > 0 ? transactions.map((tx) => (
              <div key={tx.id} className="p-4 hover:bg-blue-50/10 transition-colors">
                <div className="flex justify-between items-start mb-2">
                  <div className="flex flex-col">
                    <span className="text-[10px] font-black uppercase text-blue-600/60 dark:text-slate-500 mb-1">{tx.date}</span>
                    <div className="font-bold text-blue-950 dark:text-slate-100 text-sm">
                      {tx.type === 'transfer' ? 'Transfer' : (tx.categories?.name || 'Kategori Baru')}
                    </div>
                    <div className="text-[10px] font-black uppercase text-blue-600/40 dark:text-slate-500">
                      {tx.type === 'transfer' ? `${tx.accounts?.name} → ${tx.to_accounts?.name}` : tx.accounts?.name}
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
                  <p className="text-xs text-slate-500 dark:text-slate-400 italic mt-1 line-clamp-1">
                    {tx.description}
                  </p>
                )}
                
                <div className="flex items-center justify-end gap-2 mt-3">
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

          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-900/50 text-slate-500 font-bold uppercase text-[10px] tracking-widest border-b border-slate-100 dark:border-border/40">
                <tr>
                  <th className="h-12 px-6 text-left">Tanggal</th>
                  <th className="h-12 px-6 text-left">Kategori & Akun</th>
                  <th className="h-12 px-6 text-left">Catatan</th>
                  <th className="h-12 px-6 text-right">Jumlah</th>
                  <th className="h-12 px-6 text-center">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 dark:divide-border/40">
                {transactions.length > 0 ? transactions.map((tx) => (
                  <tr key={tx.id} className="hover:bg-blue-50/30 dark:hover:bg-blue-950/10 transition-colors">
                    <td className="p-4 px-6 whitespace-nowrap font-semibold text-slate-600 dark:text-slate-400">{tx.date}</td>
                    <td className="p-4 px-6">
                      <div className="font-bold text-blue-950 dark:text-slate-100">{tx.type === 'transfer' ? 'Transfer' : (tx.categories?.name || 'Kategori Baru')}</div>
                      <div className="text-[10px] font-black uppercase text-blue-600/60 dark:text-slate-500 mt-0.5">
                        {tx.type === 'transfer' ? `${tx.accounts?.name} → ${tx.to_accounts?.name}` : tx.accounts?.name}
                      </div>
                    </td>
                    <td className="p-4 px-6 text-slate-500 dark:text-slate-400 italic max-w-xs truncate">{tx.description || '-'}</td>
                    <td className={`p-4 px-6 text-right font-black tracking-tight whitespace-nowrap ${
                      tx.type === 'income' ? 'text-emerald-600' :
                      tx.type === 'expense' ? 'text-rose-600' :
                      'text-blue-600'
                    }`}>
                      {tx.type === 'income' ? '+' : tx.type === 'expense' ? '-' : ''}
                      {formatRupiah(tx.amount)}
                    </td>
                    <td className="p-4 px-6 text-center">
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
                    <td colSpan={5} className="p-10 text-center text-slate-400 font-medium">Belum ada transaksi di periode ini.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
      
      {isLoading && (
        <div className="fixed inset-0 bg-white/60 dark:bg-black/40 backdrop-blur-[2px] z-50 flex items-center justify-center">
          <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-2xl border border-blue-100 dark:border-blue-900/50 flex flex-col items-center gap-4">
             <div className="h-10 w-10 border-4 border-blue-600 border-t-transparent animate-spin rounded-full" />
             <p className="font-bold text-blue-900 dark:text-blue-100">Mengolah Laporan...</p>
          </div>
        </div>
      )}

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
