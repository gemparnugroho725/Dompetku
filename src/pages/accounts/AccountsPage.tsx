import { useEffect, useState } from 'react';
import { getAccounts, getTransactions } from '@/services/api';
import type { Account } from '@/services/api';
import { formatRupiah } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Wallet, Plus, X, Check, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { createAccount, updateAccount, deleteAccount } from '@/services/api';

type AccountBalance = Account & { currentBalance: number };

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<AccountBalance[]>([]);
  const [totalBalance, setTotalBalance] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Add Account form state
  const [isAdding, setIsAdding] = useState(false);
  const [newAccountName, setNewAccountName] = useState('');
  const [newAccountBalance, setNewAccountBalance] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Edit Account state
  const [editingAcc, setEditingAcc] = useState<Account | null>(null);
  const [editName, setEditName] = useState('');
  const [editBalance, setEditBalance] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setIsLoading(true);
      // Fetch all accounts
      const accs = await getAccounts();
      
      // Fetch all transactions to calculate balances
      // In a real huge app, this aggregation should be done via Supabase RPC/Views
      const txs = await getTransactions();

      let grandTotal = 0;

      const calculatedAccounts = accs.map(acc => {
        let balance = Number(acc.initial_balance);
        
        txs.forEach(tx => {
          if (tx.type === 'income' && tx.account_id === acc.id) {
            balance += Number(tx.amount);
          } else if (tx.type === 'expense' && tx.account_id === acc.id) {
            balance -= Number(tx.amount);
          } else if (tx.type === 'transfer') {
            if (tx.account_id === acc.id) {
              balance -= Number(tx.amount);
            }
            if (tx.to_account_id === acc.id) {
              balance += Number(tx.amount);
            }
          }
        });

        grandTotal += balance;
        return { ...acc, currentBalance: balance };
      });

      setAccounts(calculatedAccounts);
      setTotalBalance(grandTotal);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return <div className="flex h-64 items-center justify-center">Memuat data dompet...</div>;
  }

  const handleCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAccountName) return;
    
    setIsSubmitting(true);
    try {
      // clean numbers
      const balance = Number(newAccountBalance.replace(/[^0-9]/g, '')) || 0;
      await createAccount(newAccountName, balance);
      setIsAdding(false);
      setNewAccountName('');
      setNewAccountBalance('');
      loadData(); // refresh data
    } catch (err: any) {
      setError(err.message || 'Gagal menambahkan akun baru');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingAcc || !editName) return;

    setIsSubmitting(true);
    try {
      const balance = Number(editBalance.toString().replace(/[^0-9]/g, '')) || 0;
      await updateAccount(editingAcc.id, editName, balance);
      setEditingAcc(null);
      loadData();
    } catch (err: any) {
      setError(err.message || 'Gagal memperbarui akun');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteAccount = async (id: string) => {
    if (!confirm('Apakah Anda yakin ingin menghapus akun ini? Semua riwayat transaksi akun ini akan tetap ada di database namun akun referensinya hilang.')) return;

    try {
      await deleteAccount(id);
      loadData();
    } catch (err: any) {
      setError(err.message || 'Gagal menghapus akun');
    }
  };

  const startEdit = (acc: Account) => {
    setEditingAcc(acc);
    setEditName(acc.name);
    setEditBalance(acc.initial_balance.toString());
    setIsAdding(false); // Close add form if open
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="space-y-6 pb-8 relative min-h-screen bg-slate-50 dark:bg-background">
      {/* Decorative background accent */}
      <div className="absolute top-0 inset-x-0 h-64 bg-gradient-to-b from-blue-100/50 to-transparent dark:from-blue-950/20 pointer-events-none" />

      {/* Header section */}
      <div className="relative rounded-2xl bg-white dark:bg-card p-6 sm:p-8 border border-blue-100 dark:border-border/40 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 overflow-hidden">
        <div className="absolute -left-10 top-0 w-32 h-32 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10">
          <h1 className="text-3xl font-extrabold tracking-tight text-blue-950 dark:text-blue-100">Akun & Saldo</h1>
          <p className="text-blue-600/80 dark:text-muted-foreground mt-1 text-sm font-semibold">Kelola semua dompet dan rekening Anda.</p>
        </div>
        <Button 
          onClick={() => setIsAdding(true)}
          className="relative z-10 gap-2 h-11 px-5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-600/20 transition-all font-bold hover:-translate-y-0.5"
        >
          <Plus size={18} strokeWidth={3} />
          Tambah Akun
        </Button>
      </div>

      {/* Add Account Modal Form */}
      {isAdding && (
        <Card className="border-blue-200 dark:border-border/50 shadow-md bg-white dark:bg-card relative overflow-hidden animate-in fade-in slide-in-from-top-4 duration-300">
          <CardHeader className="flex flex-row items-center justify-between border-b border-blue-50 dark:border-border/50 bg-blue-50/50 dark:bg-slate-900/50 pb-4">
            <CardTitle className="text-xl font-bold text-blue-950 dark:text-blue-100">Tambah Akun Baru</CardTitle>
            <Button variant="ghost" size="icon" className="hover:bg-rose-100 text-rose-600 dark:hover:bg-rose-900/30" onClick={() => setIsAdding(false)}>
              <X size={20} />
            </Button>
          </CardHeader>
          <CardContent className="pt-6">
            <form onSubmit={handleCreateAccount} className="space-y-6">
              <div className="grid gap-6 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="accName" className="font-bold text-blue-950 dark:text-slate-300">Nama Akun / Dompet</Label>
                  <Input 
                    id="accName" 
                    placeholder="Contoh: BCA, OVO, Dompet Fisik"
                    value={newAccountName}
                    onChange={e => setNewAccountName(e.target.value)}
                    required
                    className="h-12 border-blue-200 dark:border-border/50 focus:ring-blue-600 font-medium bg-blue-50/20 dark:bg-slate-900/50"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="accBal" className="font-bold text-blue-950 dark:text-slate-300">Saldo Awal (Rp)</Label>
                  <div className="relative">
                    <span className="absolute left-4 top-3 font-bold text-blue-600 dark:text-blue-400">Rp</span>
                    <Input 
                      id="accBal" 
                      type="text"
                      inputMode="numeric"
                      placeholder="0"
                      value={newAccountBalance}
                      onChange={e => setNewAccountBalance(e.target.value)}
                      className="pl-12 h-12 border-blue-200 dark:border-border/50 focus:ring-blue-600 font-black text-blue-950 dark:text-blue-100 text-lg bg-blue-50/20 dark:bg-slate-900/50"
                    />
                  </div>
                  {newAccountBalance && (
                    <p className="text-sm font-bold text-blue-700 dark:text-blue-400 mt-2 ml-1">
                      {formatRupiah(Number(newAccountBalance.replace(/[^0-9]/g, '')) || 0)}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex justify-end pt-2">
                <Button type="submit" disabled={isSubmitting} className="h-12 px-8 min-w-[150px] font-bold text-base bg-emerald-600 hover:bg-emerald-700 text-white shadow-md gap-2">
                  <Check strokeWidth={3} size={18} />
                  {isSubmitting ? "Menyimpan..." : "Simpan Akun"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Edit Account Form */}
      {editingAcc && (
        <Card className="border-amber-200 dark:border-amber-900/50 shadow-md bg-white dark:bg-card relative overflow-hidden animate-in fade-in slide-in-from-top-4 duration-300">
          <CardHeader className="flex flex-row items-center justify-between border-b border-amber-50 dark:border-amber-900/20 bg-amber-50/50 dark:bg-amber-950/10 pb-4">
            <CardTitle className="text-xl font-bold text-amber-950 dark:text-amber-100">Edit Akun: {editingAcc.name}</CardTitle>
            <Button variant="ghost" size="icon" className="hover:bg-amber-100 text-amber-600 dark:hover:bg-amber-900/30" onClick={() => setEditingAcc(null)}>
              <X size={20} />
            </Button>
          </CardHeader>
          <CardContent className="pt-6">
            <form onSubmit={handleUpdateAccount} className="space-y-6">
              <div className="grid gap-6 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="editName" className="font-bold text-blue-950 dark:text-slate-300">Nama Akun / Dompet</Label>
                  <Input 
                    id="editName" 
                    value={editName}
                    onChange={e => setEditName(e.target.value)}
                    required
                    className="h-12 border-blue-200 dark:border-border/50 focus:ring-blue-600 font-medium bg-blue-50/20 dark:bg-slate-900/50"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="editBal" className="font-bold text-blue-950 dark:text-slate-300">Saldo Awal Baru (Rp)</Label>
                  <div className="relative">
                    <span className="absolute left-4 top-3 font-bold text-blue-600 dark:text-blue-400">Rp</span>
                    <Input 
                      id="editBal" 
                      type="text"
                      inputMode="numeric"
                      value={editBalance}
                      onChange={e => setEditBalance(e.target.value)}
                      className="pl-12 h-12 border-blue-200 dark:border-border/50 focus:ring-blue-600 font-black text-blue-950 dark:text-blue-100 text-lg bg-blue-50/20 dark:bg-slate-900/50"
                    />
                  </div>
                  <p className="text-[10px] font-bold text-amber-600 dark:text-amber-400 mt-1 ml-1 opacity-80 uppercase tracking-tighter">* Perubahan saldo awal akan mempengaruhi saldo berjalan saat ini.</p>
                </div>
              </div>
              <div className="flex justify-end pt-2">
                <Button type="submit" disabled={isSubmitting} className="h-12 px-8 min-w-[150px] font-bold text-base bg-blue-600 hover:bg-blue-700 text-white shadow-md gap-2">
                  <Check strokeWidth={3} size={18} />
                  {isSubmitting ? "Menyimpan..." : "Simpan Perubahan"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Premium Total Saldo Card in Bold Royal Blue */}
      <Card className="relative overflow-hidden border-0 shadow-lg bg-blue-600 text-white rounded-2xl">
        <div className="absolute right-0 top-0 w-64 h-64 bg-white/10 rounded-full blur-3xl transform translate-x-1/3 -translate-y-1/3" />
        <div className="absolute left-0 bottom-0 w-48 h-48 bg-blue-400/20 rounded-full blur-2xl transform -translate-x-1/3 translate-y-1/3" />
        
        <CardHeader className="pb-2 relative z-10 flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-bold text-blue-100 uppercase tracking-widest">
            Total Saldo Keseluruhan
          </CardTitle>
          <Wallet className="h-6 w-6 text-blue-200 opacity-80" />
        </CardHeader>
        <CardContent className="relative z-10 pt-2 pb-6">
          <div className="text-5xl font-black tracking-tighter">
            {formatRupiah(totalBalance)}
          </div>
        </CardContent>
      </Card>

      {error && <div className="text-rose-600 bg-rose-50 border border-rose-200 p-4 rounded-xl font-semibold text-sm">{error}</div>}

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {accounts.map((account) => (
          <Card key={account.id} className="relative overflow-hidden shadow-sm hover:shadow-md transition-shadow duration-300 border border-blue-100 dark:border-border/60 bg-white dark:bg-card rounded-2xl group">
            {/* Soft decorative accent on hover */}
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-400 to-blue-600 transform origin-left scale-x-0 group-hover:scale-x-100 transition-transform duration-500 ease-out" />
            
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-lg font-bold text-blue-950 dark:text-blue-100 group-hover:text-blue-700 transition-colors">
                {account.name}
              </CardTitle>
              <div className="flex gap-1 items-center">
                 <Button 
                   variant="ghost" 
                   size="icon" 
                   className="h-8 w-8 text-blue-400 hover:text-blue-600 hover:bg-blue-50 opacity-0 group-hover:opacity-100 transition-all"
                   onClick={() => startEdit(account)}
                 >
                   <Pencil size={14} />
                 </Button>
                 <Button 
                   variant="ghost" 
                   size="icon" 
                   className="h-8 w-8 text-rose-300 hover:text-rose-600 hover:bg-rose-50 opacity-0 group-hover:opacity-100 transition-all"
                   onClick={() => handleDeleteAccount(account.id)}
                 >
                   <Trash2 size={14} />
                 </Button>
                 <div className="p-2.5 rounded-xl bg-blue-50/80 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 group-hover:bg-blue-600 group-hover:text-white group-hover:shadow-md transition-all duration-300 ml-1">
                   <Wallet className="h-5 w-5" />
                 </div>
              </div>
            </CardHeader>
            <CardContent className="pt-2">
              <div className={`text-3xl font-black tracking-tight ${account.currentBalance < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                {formatRupiah(account.currentBalance)}
              </div>
              <p className="text-xs font-semibold text-blue-600/60 dark:text-slate-500 mt-2 flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-blue-300 dark:bg-slate-600"></span>
                Saldo Awal: {formatRupiah(Number(account.initial_balance))}
              </p>
            </CardContent>
          </Card>
        ))}
        {accounts.length === 0 && (
          <div className="col-span-full py-16 text-center bg-white dark:bg-card rounded-2xl border border-blue-100 dark:border-border/40 shadow-sm mt-4">
             <div className="inline-flex h-20 w-20 items-center justify-center rounded-full bg-blue-50/80 dark:bg-blue-900/20 mb-4 shadow-inner">
                <Wallet className="h-8 w-8 text-blue-600 dark:text-blue-400" />
             </div>
             <h3 className="text-xl font-bold text-blue-950 dark:text-blue-100 mb-1.5">Belum ada akun</h3>
             <p className="text-blue-600/70 dark:text-slate-500 text-sm font-semibold max-w-sm mx-auto">Klik "Tambah Akun" di atas untuk mulai memantau dan mengelola setiap dompet serta rekening Anda.</p>
          </div>
        )}
      </div>
    </div>
  );
}
