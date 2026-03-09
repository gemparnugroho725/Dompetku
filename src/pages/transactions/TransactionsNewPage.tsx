import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getAccounts, getCategories, createTransaction } from '@/services/api';
import type { Account, Category } from '@/services/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatRupiah } from '@/lib/utils';
import { CheckCircle2, ArrowLeft } from 'lucide-react';

export default function TransactionsNewPage() {
  const navigate = useNavigate();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  
  const [isLoading, setIsLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // Form State
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [type, setType] = useState<'expense' | 'income' | 'transfer'>('expense');
  const [accountId, setAccountId] = useState('');
  const [toAccountId, setToAccountId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const accs = await getAccounts();
      setAccounts(accs);
      if (accs.length > 0) setAccountId(accs[0].id);

      const cats = await getCategories();
      setCategories(cats);
    } catch (err: any) {
      setErrorMsg('Gagal memuat data dompet atau kategori.');
    }
  };

  const filteredCategories = categories.filter(c => c.type === type);

  // Auto-select category when type changes
  useEffect(() => {
    if (type !== 'transfer' && filteredCategories.length > 0 && !filteredCategories.find(c => c.id === categoryId)) {
      setCategoryId(filteredCategories[0].id);
    }
  }, [type, filteredCategories, categoryId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accountId || !amount || Number(amount) <= 0) {
      setErrorMsg('Harap lengkapi Dompet dan Jumlah dengan benar.');
      return;
    }

    if (type === 'transfer' && !toAccountId) {
      setErrorMsg('Pilih akun tujuan untuk transfer.');
      return;
    }

    if (type === 'transfer' && accountId === toAccountId) {
      setErrorMsg('Akun asal dan tujuan tidak boleh sama.');
      return;
    }

    if (type !== 'transfer' && !categoryId) {
      setErrorMsg('Kategori wajib diisi.');
      return;
    }

    setIsLoading(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      await createTransaction({
        date,
        type,
        account_id: accountId,
        to_account_id: type === 'transfer' ? toAccountId : null,
        category_id: type === 'transfer' ? null : categoryId,
        amount: Number(amount),
        description: description || null,
        tags: null,
        receipt_url: null,
      });

      setSuccessMsg('Transaksi berhasil disimpan!');
      setAmount('');
      setDescription('');
      
      // Clear success message after 3 seconds
      setTimeout(() => setSuccessMsg(''), 3000);
    } catch (err: any) {
      setErrorMsg(err.message || 'Gagal menyimpan transaksi.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6 pb-8 pt-4 relative">
      <div className="flex items-center gap-4 mb-6 relative z-10">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="hover:bg-blue-100 dark:hover:bg-blue-900/20 text-blue-700 dark:text-blue-400 transition-colors">
          <ArrowLeft size={20} strokeWidth={2.5} />
        </Button>
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-blue-950 dark:text-blue-100">Catat Transaksi Baru</h1>
        </div>
      </div>

      {successMsg && (
        <div className="flex items-center gap-3 rounded-xl bg-emerald-50 border border-emerald-200 p-4 text-emerald-700 dark:bg-emerald-900/20 dark:border-emerald-800 dark:text-emerald-400 shadow-sm">
          <CheckCircle2 size={24} />
          <p className="font-semibold">{successMsg}</p>
        </div>
      )}

      {errorMsg && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-600 font-semibold dark:bg-rose-900/20 dark:border-rose-800 dark:text-rose-400 shadow-sm">
          {errorMsg}
        </div>
      )}

      <Card className="border-blue-100 dark:border-border/40 shadow-md shadow-blue-900/5 bg-white dark:bg-card rounded-2xl overflow-hidden relative">
        <div className="absolute top-0 right-0 w-48 h-48 bg-blue-500/10 rounded-full blur-3xl transform translate-x-1/2 -translate-y-1/2 pointer-events-none" />
        <CardHeader className="border-b border-blue-50 dark:border-border/40 pb-5 mb-5 bg-blue-50/30 dark:bg-slate-900/50 relative z-10">
          <CardTitle className="text-xl font-extrabold text-blue-950 dark:text-blue-100">Formulir Transaksi</CardTitle>
        </CardHeader>
        <CardContent className="relative z-10">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="date" className="font-bold text-blue-950 dark:text-slate-300">Tanggal</Label>
                <Input 
                  id="date" 
                  type="date" 
                  required
                  value={date}
                  onChange={e => setDate(e.target.value)}
                  className="rounded-lg border-blue-200 dark:border-border/50 focus:ring-blue-600 focus:border-blue-600 bg-blue-50/30 dark:bg-slate-900/50 shadow-sm transition-all hover:border-blue-400 font-medium text-blue-900 dark:text-blue-100"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="type" className="font-bold text-blue-950 dark:text-slate-300">Jenis Transaksi</Label>
                <select 
                  id="type"
                  className="flex h-10 w-full rounded-lg border border-blue-200 dark:border-border/50 bg-blue-50/30 dark:bg-slate-900/50 px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-0 transition-all cursor-pointer shadow-sm hover:border-blue-400 font-bold text-blue-900 dark:text-blue-100"
                  value={type}
                  onChange={e => setType(e.target.value as 'expense' | 'income' | 'transfer')}
                >
                  <option value="expense" className="text-rose-600 font-bold">Pengeluaran</option>
                  <option value="income" className="text-emerald-600 font-bold">Pemasukan</option>
                  <option value="transfer" className="text-blue-600 font-bold">Transfer Antar Akun</option>
                </select>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="account" className="font-bold text-blue-950 dark:text-slate-300">
                  {type === 'transfer' ? 'Dari Akun / Dompet' : 'Dompet / Metode Bayar'}
                </Label>
                <select 
                  id="account"
                  required
                  className="flex h-10 w-full rounded-lg border border-blue-200 dark:border-border/50 bg-blue-50/30 dark:bg-slate-900/50 px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-0 transition-all cursor-pointer shadow-sm hover:border-blue-400 font-semibold text-blue-900 dark:text-blue-100"
                  value={accountId}
                  onChange={e => setAccountId(e.target.value)}
                >
                  <option value="" disabled>Pilih Dompet</option>
                  {accounts.map(a => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
              </div>

              {type === 'transfer' ? (
                <div className="space-y-2 animate-in fade-in slide-in-from-right-4 duration-300">
                  <Label htmlFor="toAccount" className="font-bold text-blue-950 dark:text-slate-300">Ke Akun / Dompet</Label>
                  <select 
                    id="toAccount"
                    required
                    className="flex h-10 w-full rounded-lg border border-blue-200 dark:border-border/50 bg-blue-50/30 dark:bg-slate-900/50 px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-0 transition-all cursor-pointer shadow-sm border-emerald-200 hover:border-emerald-400 font-bold text-emerald-700 dark:text-emerald-400"
                    value={toAccountId}
                    onChange={e => setToAccountId(e.target.value)}
                  >
                    <option value="" disabled>Pilih Akun Tujuan</option>
                    {accounts.filter(a => a.id !== accountId).map(a => (
                      <option key={a.id} value={a.id}>{a.name}</option>
                    ))}
                  </select>
                </div>
              ) : (
                <div className="space-y-2">
                  <Label htmlFor="category" className="font-bold text-blue-950 dark:text-slate-300">Kategori</Label>
                  <select 
                    id="category"
                    required
                    className="flex h-10 w-full rounded-lg border border-blue-200 dark:border-border/50 bg-blue-50/30 dark:bg-slate-900/50 px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-0 transition-all cursor-pointer shadow-sm hover:border-blue-400 font-semibold text-blue-900 dark:text-blue-100"
                    value={categoryId}
                    onChange={e => setCategoryId(e.target.value)}
                  >
                    <option value="" disabled>Pilih Kategori</option>
                    {filteredCategories.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="amount" className="font-bold text-blue-950 dark:text-slate-300">Jumlah (Rp)</Label>
              <div className="relative">
                <span className="absolute left-4 top-3 font-extrabold text-blue-700 dark:text-blue-400">Rp</span>
                <Input 
                  id="amount" 
                  type="number" 
                  min="0"
                  step="1"
                  className="pl-12 rounded-lg border-blue-300 dark:border-border/50 focus:ring-blue-600 focus:border-blue-600 bg-blue-50/50 dark:bg-slate-900/50 text-xl font-black text-blue-950 dark:text-blue-100 h-14 shadow-sm transition-all hover:border-blue-400"
                  placeholder="0"
                  required
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                />
              </div>
              {amount && (
                <p className="text-sm font-bold text-blue-700 dark:text-blue-400 mt-2 ml-1">
                  {formatRupiah(Number(amount))}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="description" className="font-bold text-blue-950 dark:text-slate-300">Catatan (Opsional)</Label>
              <Input 
                id="description" 
                type="text" 
                placeholder="Cth: Beli makan siang"
                value={description}
                onChange={e => setDescription(e.target.value)}
                className="rounded-lg border-blue-200 dark:border-border/50 focus:ring-blue-600 focus:border-blue-600 bg-blue-50/30 dark:bg-slate-900/50 h-12 shadow-sm transition-all hover:border-blue-400 font-medium text-blue-900 dark:text-blue-100"
              />
            </div>

            <Button type="submit" className="w-full h-14 text-lg font-bold rounded-lg bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-600/20 transition-all hover:translate-y-[-2px]" disabled={isLoading}>
              {isLoading ? "Menyimpan..." : "Simpan Transaksi"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
