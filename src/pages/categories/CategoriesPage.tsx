import { useEffect, useState } from 'react';
import { getCategories, createCategory, updateCategory, deleteCategory } from '@/services/api';
import type { Category } from '@/services/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Pencil, Trash2, X, Check, Save } from 'lucide-react';

export default function CategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Form states
  const [isAdding, setIsAdding] = useState<'income' | 'expense' | null>(null);
  const [newName, setNewName] = useState('');
  const [isEditing, setIsEditing] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setIsLoading(true);
      const data = await getCategories();
      setCategories(data);
    } catch (err: any) {
      setError(err.message || 'Gagal memuat kategori');
    } finally {
      setIsLoading(false);
    }
  };

  const handleAdd = async (type: 'income' | 'expense') => {
    if (!newName.trim()) return;
    setIsSubmitting(true);
    try {
      await createCategory(newName.trim(), type);
      setNewName('');
      setIsAdding(null);
      loadData();
    } catch (err: any) {
      setError(err.message || 'Gagal menambah kategori');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdate = async (id: string) => {
    if (!editName.trim()) return;
    setIsSubmitting(true);
    try {
      await updateCategory(id, editName.trim());
      setIsEditing(null);
      setEditName('');
      loadData();
    } catch (err: any) {
      setError(err.message || 'Gagal mengubah kategori');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Apakah Anda yakin ingin menghapus kategori ini? Transaksi dengan kategori ini mungkin akan terpengaruh.')) return;
    try {
      await deleteCategory(id);
      loadData();
    } catch (err: any) {
      setError(err.message || 'Gagal menghapus kategori');
    }
  };

  const incomeCategories = categories.filter(c => c.type === 'income');
  const expenseCategories = categories.filter(c => c.type === 'expense');

  if (isLoading) {
    return <div className="flex h-64 items-center justify-center">Memuat kategori...</div>;
  }

  const CategorySection = ({ title, type, items }: { title: string, type: 'income' | 'expense', items: Category[] }) => (
    <Card className="border-blue-100 dark:border-border/40 shadow-sm bg-white dark:bg-card rounded-2xl overflow-hidden">
      <CardHeader className="border-b border-blue-50 dark:border-border/40 bg-blue-50/30 dark:bg-slate-900/50 flex flex-row items-center justify-between py-4 px-6">
        <CardTitle className="text-xl font-extrabold text-blue-950 dark:text-blue-100">{title}</CardTitle>
        <Button 
          size="sm" 
          onClick={() => { setIsAdding(type); setNewName(''); }}
          className="bg-blue-600 hover:bg-blue-700 text-white font-bold gap-2"
        >
          <Plus size={16} strokeWidth={3} />
          Tambah
        </Button>
      </CardHeader>
      <CardContent className="p-0">
        <div className="divide-y divide-blue-50 dark:divide-border/40">
          {isAdding === type && (
            <div className="p-4 bg-blue-50/20 dark:bg-blue-900/10 flex items-center gap-2 animate-in fade-in slide-in-from-top-2 duration-200">
              <Input 
                value={newName} 
                onChange={e => setNewName(e.target.value)}
                placeholder="Nama kategori baru"
                className="h-10 border-blue-200 dark:border-border/50 focus:ring-blue-600 font-medium"
                autoFocus
              />
              <Button size="icon" className="bg-emerald-600 hover:bg-emerald-700 h-10 w-12" onClick={() => handleAdd(type)} disabled={isSubmitting}>
                <Check size={18} strokeWidth={3} />
              </Button>
              <Button size="icon" variant="ghost" className="text-rose-600 hover:bg-rose-50 h-10 w-10" onClick={() => setIsAdding(null)}>
                <X size={18} strokeWidth={3} />
              </Button>
            </div>
          )}
          {items.map(category => (
            <div key={category.id} className="flex items-center justify-between p-4 px-6 group hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors">
              {isEditing === category.id ? (
                <div className="flex items-center gap-2 w-full">
                  <Input 
                    value={editName} 
                    onChange={e => setEditName(e.target.value)}
                    className="h-9 border-blue-200 dark:border-border/50 focus:ring-blue-600 font-medium"
                    autoFocus
                  />
                  <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 gap-1 h-9" onClick={() => handleUpdate(category.id)} disabled={isSubmitting}>
                    <Save size={14} /> Simpan
                  </Button>
                  <Button size="icon" variant="ghost" className="text-rose-600 h-9 w-9" onClick={() => setIsEditing(null)}>
                    <X size={16} />
                  </Button>
                </div>
              ) : (
                <>
                  <span className="font-bold text-blue-950 dark:text-blue-100">{category.name}</span>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-8 w-8 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30"
                      onClick={() => { setIsEditing(category.id); setEditName(category.name); }}
                    >
                      <Pencil size={14} />
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-8 w-8 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/30"
                      onClick={() => handleDelete(category.id)}
                    >
                      <Trash2 size={14} />
                    </Button>
                  </div>
                </>
              )}
            </div>
          ))}
          {items.length === 0 && !isAdding && (
            <div className="p-8 text-center text-slate-500 font-medium text-sm">Belum ada kategori.</div>
          )}
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6 pb-8 relative min-h-screen bg-slate-50 dark:bg-background">
      {/* Decorative background accent */}
      <div className="absolute top-0 inset-x-0 h-64 bg-gradient-to-b from-blue-100/50 to-transparent dark:from-blue-950/20 pointer-events-none" />

      {/* Header section */}
      <div className="relative rounded-2xl bg-white dark:bg-card p-6 sm:p-8 border border-blue-100 dark:border-border/40 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 overflow-hidden">
        <div className="absolute -left-10 top-0 w-32 h-32 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10">
          <h1 className="text-3xl font-extrabold tracking-tight text-blue-950 dark:text-blue-100">Kategori</h1>
          <p className="text-blue-600/80 dark:text-muted-foreground mt-1 text-sm font-semibold">Atur kategori pemasukan dan pengeluaran Anda.</p>
        </div>
      </div>

      {error && <div className="text-rose-600 bg-rose-50 border border-rose-200 p-4 rounded-xl font-semibold text-sm animate-in shake duration-300">{error}</div>}

      <div className="grid gap-8 lg:grid-cols-2">
        <CategorySection title="Pemasukan" type="income" items={incomeCategories} />
        <CategorySection title="Pengeluaran" type="expense" items={expenseCategories} />
      </div>
    </div>
  );
}
