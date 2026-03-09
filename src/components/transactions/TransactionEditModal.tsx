import { useState, useEffect } from 'react';
import { getAccounts, getCategories, updateTransaction } from '@/services/api';
import type { Account, Category, Transaction } from '@/services/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { X } from 'lucide-react';

interface TransactionEditModalProps {
  transaction: Transaction;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function TransactionEditModal({ transaction, isOpen, onClose, onSuccess }: TransactionEditModalProps) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Form State
  const [date, setDate] = useState('');
  const [type, setType] = useState<'expense' | 'income' | 'transfer'>('expense');
  const [accountId, setAccountId] = useState('');
  const [toAccountId, setToAccountId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');

  useEffect(() => {
    if (isOpen) {
      loadData();
      // Initialize form with transaction data
      setDate(transaction.date);
      setType(transaction.type);
      setAccountId(transaction.account_id);
      setToAccountId(transaction.to_account_id || '');
      setCategoryId(transaction.category_id || '');
      setAmount(transaction.amount.toString());
      setDescription(transaction.description || '');
    }
  }, [isOpen, transaction]);

  const loadData = async () => {
    try {
      const [accs, cats] = await Promise.all([getAccounts(), getCategories()]);
      setAccounts(accs);
      setCategories(cats);
    } catch (err: any) {
      setErrorMsg('Gagal memuat data dompet atau kategori.');
    }
  };

  const filteredCategories = categories.filter(c => c.type === type);

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

    if (type !== 'transfer' && !categoryId) {
      setErrorMsg('Kategori wajib diisi.');
      return;
    }

    setIsLoading(true);
    setErrorMsg('');

    try {
      await updateTransaction(transaction.id, {
        date,
        type,
        account_id: accountId,
        to_account_id: type === 'transfer' ? toAccountId : null,
        category_id: type === 'transfer' ? null : categoryId,
        amount: Number(amount),
        description: description || null,
      });

      onSuccess();
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Gagal menyimpan perubahan.');
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-300" 
        onClick={onClose}
      />
      
      {/* Modal Content */}
      <Card className="relative z-10 w-full max-w-lg border-blue-100 dark:border-border/40 shadow-2xl bg-white dark:bg-card rounded-2xl overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/10 rounded-full blur-3xl transform translate-x-1/2 -translate-y-1/2 pointer-events-none" />
        
        <CardHeader className="border-b border-blue-50 dark:border-border/40 pb-4 bg-blue-50/30 dark:bg-slate-900/50 flex flex-row items-center justify-between">
          <CardTitle className="text-lg font-extrabold text-blue-950 dark:text-blue-100">Edit Transaksi</CardTitle>
          <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8 rounded-full hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors">
            <X size={18} />
          </Button>
        </CardHeader>
        
        <CardContent className="p-6 relative z-10">
          <form onSubmit={handleSubmit} className="space-y-4">
            {errorMsg && (
              <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-600 font-semibold dark:bg-rose-900/20 dark:border-rose-800 dark:text-rose-400 shadow-sm mb-4">
                {errorMsg}
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="edit-date" className="text-xs font-bold text-blue-950 dark:text-slate-300">Tanggal</Label>
                <Input 
                  id="edit-date" 
                  type="date" 
                  required
                  value={date}
                  onChange={e => setDate(e.target.value)}
                  className="h-9 rounded-lg border-blue-100 dark:border-border/50 bg-blue-50/20 dark:bg-slate-900/30 font-medium text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-type" className="text-xs font-bold text-blue-950 dark:text-slate-300">Jenis</Label>
                <select 
                  id="edit-type"
                  className="flex h-9 w-full rounded-lg border border-blue-100 dark:border-border/50 bg-blue-50/20 dark:bg-slate-900/30 px-3 py-1 text-sm font-bold text-blue-900 dark:text-blue-100 outline-none focus:ring-1 focus:ring-blue-500"
                  value={type}
                  onChange={e => setType(e.target.value as 'expense' | 'income' | 'transfer')}
                >
                  <option value="expense">Pengeluaran</option>
                  <option value="income">Pemasukan</option>
                  <option value="transfer">Transfer</option>
                </select>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="edit-account" className="text-xs font-bold text-blue-950 dark:text-slate-300">
                  {type === 'transfer' ? 'Dari Akun' : 'Dompet'}
                </Label>
                <select 
                   id="edit-account"
                   required
                   className="flex h-9 w-full rounded-lg border border-blue-100 dark:border-border/50 bg-blue-50/20 dark:bg-slate-900/30 px-3 py-1 text-sm font-semibold text-blue-900 dark:text-blue-100 outline-none focus:ring-1 focus:ring-blue-500"
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
                <div className="space-y-1.5">
                  <Label htmlFor="edit-toAccount" className="text-xs font-bold text-blue-950 dark:text-slate-300">Ke Akun</Label>
                  <select 
                    id="edit-toAccount"
                    required
                    className="flex h-9 w-full rounded-lg border border-blue-100 dark:border-border/50 bg-blue-50/20 dark:bg-slate-900/30 px-3 py-1 text-sm font-bold text-emerald-700 dark:text-emerald-400 outline-none focus:ring-1 focus:ring-emerald-500"
                    value={toAccountId}
                    onChange={e => setToAccountId(e.target.value)}
                  >
                    <option value="" disabled>Pilih Tujuan</option>
                    {accounts.filter(a => a.id !== accountId).map(a => (
                      <option key={a.id} value={a.id}>{a.name}</option>
                    ))}
                  </select>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <Label htmlFor="edit-category" className="text-xs font-bold text-blue-950 dark:text-slate-300">Kategori</Label>
                  <select 
                    id="edit-category"
                    required
                    className="flex h-9 w-full rounded-lg border border-blue-100 dark:border-border/50 bg-blue-50/20 dark:bg-slate-900/30 px-3 py-1 text-sm font-semibold text-blue-900 dark:text-blue-100 outline-none focus:ring-1 focus:ring-blue-500"
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

            <div className="space-y-1.5">
              <Label htmlFor="edit-amount" className="text-xs font-bold text-blue-950 dark:text-slate-300">Jumlah (Rp)</Label>
              <div className="relative">
                <span className="absolute left-3 top-2 font-bold text-blue-700 dark:text-blue-400 text-sm">Rp</span>
                <Input 
                  id="edit-amount" 
                  type="number" 
                  min="0"
                  step="1"
                  className="pl-10 h-10 rounded-lg border-blue-200 dark:border-border/50 bg-white dark:bg-slate-900/50 text-base font-black text-blue-950 dark:text-blue-100"
                  placeholder="0"
                  required
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="edit-description" className="text-xs font-bold text-blue-950 dark:text-slate-300">Catatan</Label>
              <Input 
                id="edit-description" 
                type="text" 
                placeholder="Deskripsi transaksi"
                value={description}
                onChange={e => setDescription(e.target.value)}
                className="h-9 rounded-lg border-blue-100 dark:border-border/50 bg-blue-50/20 dark:bg-slate-900/30 font-medium text-sm"
              />
            </div>

            <div className="flex gap-3 pt-4 border-t border-slate-100 dark:border-border/40 mt-6">
              <Button type="button" variant="ghost" onClick={onClose} className="flex-1 font-bold text-slate-500">
                Batal
              </Button>
              <Button type="submit" className="flex-1 h-10 font-bold bg-blue-600 hover:bg-blue-700 text-white" disabled={isLoading}>
                {isLoading ? "Menyimpan..." : "Simpan Perubahan"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
