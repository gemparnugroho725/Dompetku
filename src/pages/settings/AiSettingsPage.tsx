import React, { useEffect, useState } from 'react';
import { Bot, Plus, Trash2, Sparkles, Key, ArrowUp, ArrowDown, Eye } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';

export type UserAiModel = {
  id: string;
  user_id: string;
  name: string;
  provider_type: 'gemini' | 'openai_compatible' | 'anthropic';
  api_key: string;
  base_url?: string | null;
  model_name: string;
  supports_vision: boolean;
  priority: number;
  is_active: boolean;
  created_at?: string;
};

export default function AiSettingsPage() {
  const { user } = useAuth();
  const [models, setModels] = useState<UserAiModel[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ id: string; success: boolean; message: string } | null>(null);

  // Form state
  const [name, setName] = useState('');
  const [providerType, setProviderType] = useState<'gemini' | 'openai_compatible'>('gemini');
  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [modelName, setModelName] = useState('gemini-flash-latest');
  const [supportsVision, setSupportsVision] = useState(true);
  const [priority] = useState(1);

  const fetchModels = async () => {
    if (!user) return;
    setIsLoading(true);
    const { data, error } = await supabase
      .from('user_ai_models')
      .select('*')
      .eq('user_id', user.id)
      .order('priority', { ascending: true });

    if (!error && data) {
      setModels(data as UserAiModel[]);
    }
    setIsLoading(false);
  };

  useEffect(() => {
    fetchModels();
  }, [user]);

  const handlePresetChange = (type: 'gemini' | 'openai_compatible', preset: string) => {
    setProviderType(type);
    if (preset === 'gemini') {
      setName('Google Gemini');
      setModelName('gemini-flash-latest');
      setBaseUrl('');
      setSupportsVision(true);
    } else if (preset === 'groq') {
      setName('Groq Cloud');
      setModelName('llama-3.3-70b-versatile');
      setBaseUrl('https://api.groq.com/openai/v1');
      setSupportsVision(false);
    } else if (preset === 'nararouter') {
      setName('NaraRouter AI');
      setModelName('agnes-2.5-flash');
      setBaseUrl('https://router.bynara.id/v1');
      setSupportsVision(true);
    } else if (preset === 'openai') {
      setName('OpenAI Official');
      setModelName('gpt-4o-mini');
      setBaseUrl('https://api.openai.com/v1');
      setSupportsVision(true);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !name || !apiKey || !modelName) return;

    const newPriority = models.length > 0 ? Math.max(...models.map(m => m.priority)) + 1 : 1;

    const payload = {
      user_id: user.id,
      name,
      provider_type: providerType,
      api_key: apiKey.trim(),
      base_url: baseUrl.trim() || null,
      model_name: modelName.trim(),
      supports_vision: supportsVision,
      priority: priority || newPriority,
      is_active: true,
    };

    const { error } = await supabase.from('user_ai_models').insert(payload);

    if (error) {
      alert(`Gagal menyimpan: ${error.message}`);
    } else {
      setIsModalOpen(false);
      resetForm();
      fetchModels();
    }
  };

  const resetForm = () => {
    setName('');
    setApiKey('');
    setBaseUrl('');
    setModelName('gemini-flash-latest');
    setProviderType('gemini');
    setSupportsVision(true);
  };

  const toggleActive = async (model: UserAiModel) => {
    const { error } = await supabase
      .from('user_ai_models')
      .update({ is_active: !model.is_active })
      .eq('id', model.id);

    if (!error) {
      setModels(prev =>
        prev.map(m => (m.id === model.id ? { ...m, is_active: !m.is_active } : m))
      );
    }
  };

  const deleteModel = async (id: string) => {
    if (!confirm('Hapus model AI ini dari daftar rolling?')) return;
    const { error } = await supabase.from('user_ai_models').delete().eq('id', id);
    if (!error) {
      setModels(prev => prev.filter(m => m.id !== id));
    }
  };

  const movePriority = async (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= models.length) return;

    const newModels = [...models];
    const tempPriority = newModels[index].priority;
    newModels[index].priority = newModels[targetIndex].priority;
    newModels[targetIndex].priority = tempPriority;

    // Swap in UI
    const [moved] = newModels.splice(index, 1);
    newModels.splice(targetIndex, 0, moved);
    setModels(newModels);

    // Save to DB
    await Promise.all([
      supabase.from('user_ai_models').update({ priority: newModels[index].priority }).eq('id', newModels[index].id),
      supabase.from('user_ai_models').update({ priority: newModels[targetIndex].priority }).eq('id', newModels[targetIndex].id),
    ]);
  };

  const testConnection = async (model: UserAiModel) => {
    setTestingId(model.id);
    setTestResult(null);

    try {
      if (model.provider_type === 'gemini') {
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model.model_name}:generateContent?key=${model.api_key}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: 'Ping' }] }] }),
          }
        );
        if (res.ok) {
          setTestResult({ id: model.id, success: true, message: 'Koneksi Berhasil (200 OK)' });
        } else {
          const text = await res.text();
          setTestResult({ id: model.id, success: false, message: `Error ${res.status}: ${text}` });
        }
      } else {
        const url = (model.base_url || 'https://api.openai.com/v1').replace(/\/$/, '');
        const res = await fetch(`${url}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${model.api_key}`,
          },
          body: JSON.stringify({
            model: model.model_name,
            messages: [{ role: 'user', content: 'Ping' }],
          }),
        });
        if (res.ok) {
          setTestResult({ id: model.id, success: true, message: 'Koneksi Berhasil (200 OK)' });
        } else {
          const text = await res.text();
          setTestResult({ id: model.id, success: false, message: `Error ${res.status}: ${text}` });
        }
      }
    } catch (err: any) {
      setTestResult({ id: model.id, success: false, message: `Gagal: ${err.message}` });
    } finally {
      setTestingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Bot className="text-blue-600" size={28} /> Pengaturan Model AI (Rolling Execution)
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Atur API Key & Model AI milikmu sendiri. Sistem akan mencoba model dari prioritas teratas secara berurutan (*rolling sequential fallback*).
          </p>
        </div>
        <Button onClick={() => setIsModalOpen(true)} className="gap-2 bg-blue-600 hover:bg-blue-700 text-white shadow-md">
          <Plus size={18} /> Tambah Model AI
        </Button>
      </div>

      {/* Info Card */}
      <div className="rounded-xl border border-blue-100 bg-blue-50/50 p-4 dark:border-blue-900/50 dark:bg-blue-950/20 text-sm text-blue-900 dark:text-blue-200 flex items-start gap-3">
        <Sparkles className="text-blue-600 shrink-0 mt-0.5" size={20} />
        <div>
          <span className="font-semibold">Konsep Aplikasi Gratis:</span> Anda bebas memasukkan API Key dari Google Gemini (Gratis), Groq (Gratis), NaraRouter, atau OpenAI. Jika model prioritas #1 gagal (limit/error), bot akan otomatis mencobanya di model #2, #3 dst. Jika tidak ada custom model, bot akan menggunakan *System Default (NaraRouter)*.
        </div>
      </div>

      {/* Model List */}
      {isLoading ? (
        <div className="flex justify-center p-12">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent"></div>
        </div>
      ) : models.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-800 p-12 text-center bg-white dark:bg-card">
          <Bot className="mx-auto text-slate-400 mb-3" size={40} />
          <h3 className="font-semibold text-slate-800 dark:text-slate-200">Belum Ada Custom Model AI</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-md mx-auto">
            Saat ini transaksi menggunakan System Default AI (NaraRouter agnes-2.5-flash). Tambahkan API Key Gemini atau Groq milikmu sendiri untuk kuota tak terbatas!
          </p>
          <Button onClick={() => setIsModalOpen(true)} className="mt-4 gap-2 bg-blue-600 text-white">
            <Plus size={16} /> Tambah Model Pertamamu
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {models.map((model, idx) => (
            <div
              key={model.id}
              className={`flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-xl border transition-all ${
                model.is_active
                  ? 'bg-white dark:bg-card border-slate-200 dark:border-slate-800 shadow-sm'
                  : 'bg-slate-50 dark:bg-slate-900/40 border-slate-200 dark:border-slate-800 opacity-60'
              }`}
            >
              <div className="flex items-start sm:items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 font-bold shrink-0">
                  #{idx + 1}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-900 dark:text-slate-100">{model.name}</span>
                    <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                      {model.provider_type}
                    </span>
                    {model.supports_vision && (
                      <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 flex items-center gap-1">
                        <Eye size={12} /> OCR Vision
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 flex flex-wrap items-center gap-3">
                    <span>Model: <code className="text-blue-600 dark:text-blue-400 font-mono">{model.model_name}</code></span>
                    <span>API Key: <code className="font-mono">••••••••{model.api_key.slice(-4)}</code></span>
                  </div>
                  {testResult && testResult.id === model.id && (
                    <div className={`text-xs mt-1.5 font-medium ${testResult.success ? 'text-emerald-600' : 'text-rose-600'}`}>
                      {testResult.message}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2 mt-3 sm:mt-0 justify-end border-t sm:border-t-0 pt-2 sm:pt-0">
                <div className="flex items-center gap-1 mr-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    disabled={idx === 0}
                    onClick={() => movePriority(idx, 'up')}
                    className="h-8 w-8 text-slate-400 hover:text-slate-600"
                    title="Naikkan Prioritas"
                  >
                    <ArrowUp size={16} />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    disabled={idx === models.length - 1}
                    onClick={() => movePriority(idx, 'down')}
                    className="h-8 w-8 text-slate-400 hover:text-slate-600"
                    title="Turunkan Prioritas"
                  >
                    <ArrowDown size={16} />
                  </Button>
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => testConnection(model)}
                  disabled={testingId === model.id}
                  className="text-xs gap-1"
                >
                  {testingId === model.id ? 'Testing...' : 'Test API'}
                </Button>

                <Button
                  variant={model.is_active ? 'default' : 'secondary'}
                  size="sm"
                  onClick={() => toggleActive(model)}
                  className={`text-xs ${model.is_active ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : ''}`}
                >
                  {model.is_active ? 'Aktif' : 'Nonaktif'}
                </Button>

                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => deleteModel(model.id)}
                  className="h-8 w-8 text-slate-400 hover:text-rose-600"
                  title="Hapus Model"
                >
                  <Trash2 size={16} />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal Form */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white dark:bg-card p-6 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-4">
            <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <Key size={20} className="text-blue-600" /> Tambah Custom AI Model
            </h2>

            {/* Presets */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-500">Pilih Preset Cepat:</label>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <button
                  type="button"
                  onClick={() => handlePresetChange('gemini', 'gemini')}
                  className="px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-blue-50 dark:hover:bg-blue-950 font-medium text-slate-700 dark:text-slate-300"
                >
                  Google Gemini
                </button>
                <button
                  type="button"
                  onClick={() => handlePresetChange('openai_compatible', 'groq')}
                  className="px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-blue-50 dark:hover:bg-blue-950 font-medium text-slate-700 dark:text-slate-300"
                >
                  Groq Cloud
                </button>
                <button
                  type="button"
                  onClick={() => handlePresetChange('openai_compatible', 'nararouter')}
                  className="px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-blue-50 dark:hover:bg-blue-950 font-medium text-slate-700 dark:text-slate-300"
                >
                  NaraRouter
                </button>
                <button
                  type="button"
                  onClick={() => handlePresetChange('openai_compatible', 'openai')}
                  className="px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-blue-50 dark:hover:bg-blue-950 font-medium text-slate-700 dark:text-slate-300"
                >
                  OpenAI
                </button>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-3 pt-2">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Nama Label Model</label>
                <input
                  type="text"
                  required
                  placeholder="Misal: Gemini Flash Pribadi"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Provider Type</label>
                <select
                  value={providerType}
                  onChange={e => setProviderType(e.target.value as any)}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent dark:bg-card"
                >
                  <option value="gemini">Google Gemini (Direct API)</option>
                  <option value="openai_compatible">OpenAI Compatible (Groq, NaraRouter, Custom)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">API Key Anda</label>
                <input
                  type="password"
                  required
                  placeholder="AIzaSy... / gsk_... / sk-..."
                  value={apiKey}
                  onChange={e => setApiKey(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent font-mono"
                />
              </div>

              {providerType === 'openai_compatible' && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Base URL (Opsional)</label>
                  <input
                    type="text"
                    placeholder="https://api.groq.com/openai/v1"
                    value={baseUrl}
                    onChange={e => setBaseUrl(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent font-mono"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Model Name</label>
                <input
                  type="text"
                  required
                  placeholder="gemini-flash-latest / llama-3.3-70b-versatile / gpt-4o-mini"
                  value={modelName}
                  onChange={e => setModelName(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent font-mono"
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="supportsVision"
                  checked={supportsVision}
                  onChange={e => setSupportsVision(e.target.checked)}
                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 h-4 w-4"
                />
                <label htmlFor="supportsVision" className="text-xs font-medium text-slate-700 dark:text-slate-300">
                  Model ini mendukung OCR Vision / Scan Gambar Struk 📸
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-slate-100 dark:border-slate-800">
                <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)}>
                  Batal
                </Button>
                <Button type="submit" className="bg-blue-600 text-white">
                  Simpan Model
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
