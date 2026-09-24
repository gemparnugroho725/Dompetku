import React, { useEffect, useState } from 'react';
import { Bot, Plus, Trash2, Sparkles, Key, ArrowUp, ArrowDown, Eye, Server, ChevronDown, ChevronRight } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';

export type UserAiProvider = {
  id: string;
  user_id: string;
  name: string;
  provider_type: 'gemini' | 'openai_compatible' | 'anthropic';
  api_key: string;
  base_url?: string | null;
  created_at?: string;
};

export type UserAiModel = {
  id: string;
  user_id: string;
  provider_id: string;
  name: string;
  model_name: string;
  supports_vision: boolean;
  priority: number;
  is_active: boolean;
  created_at?: string;
  provider?: UserAiProvider;
};

const PROVIDER_PRESETS = [
  { label: 'Google Gemini', type: 'gemini' as const, baseUrl: '', defaultModel: 'gemini-flash-latest', vision: true },
  { label: 'NaraRouter', type: 'openai_compatible' as const, baseUrl: 'https://router.bynara.id/v1', defaultModel: 'agnes-2.5-flash', vision: true },
  { label: 'Groq Cloud', type: 'openai_compatible' as const, baseUrl: 'https://api.groq.com/openai/v1', defaultModel: 'llama-3.3-70b-versatile', vision: false },
  { label: 'OpenAI', type: 'openai_compatible' as const, baseUrl: 'https://api.openai.com/v1', defaultModel: 'gpt-4o-mini', vision: true },
];

export default function AiSettingsPage() {
  const { user } = useAuth();

  // Providers
  const [providers, setProviders] = useState<UserAiProvider[]>([]);
  const [isProviderModalOpen, setIsProviderModalOpen] = useState(false);
  const [expandedProvider, setExpandedProvider] = useState<string | null>(null);

  // Models (all, keyed by provider_id)
  const [models, setModels] = useState<UserAiModel[]>([]);
  const [isModelModalOpen, setIsModelModalOpen] = useState(false);
  const [modelProviderId, setModelProviderId] = useState<string>('');

  const [isLoading, setIsLoading] = useState(true);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ id: string; success: boolean; message: string } | null>(null);

  // Provider form
  const [pName, setPName] = useState('');
  const [pType, setPType] = useState<'gemini' | 'openai_compatible'>('gemini');
  const [pApiKey, setPApiKey] = useState('');
  const [pBaseUrl, setPBaseUrl] = useState('');

  // Model form
  const [mName, setMName] = useState('');
  const [mModelName, setMModelName] = useState('');
  const [mVision, setMVision] = useState(true);

  const fetchAll = async () => {
    if (!user) return;
    setIsLoading(true);
    const [provRes, modRes] = await Promise.all([
      supabase.from('user_ai_providers').select('*').eq('user_id', user.id).order('created_at', { ascending: true }),
      supabase.from('user_ai_models').select('*, provider:user_ai_providers(*)').eq('user_id', user.id).order('priority', { ascending: true }),
    ]);
    if (!provRes.error && provRes.data) setProviders(provRes.data as UserAiProvider[]);
    if (!modRes.error && modRes.data) setModels(modRes.data as UserAiModel[]);
    setIsLoading(false);
  };

  useEffect(() => { fetchAll(); }, [user]);

  const applyProviderPreset = (preset: typeof PROVIDER_PRESETS[0]) => {
    setPName(preset.label);
    setPType(preset.type);
    setPBaseUrl(preset.baseUrl);
  };

  const handleAddProvider = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !pName || !pApiKey) return;
    const { error } = await supabase.from('user_ai_providers').insert({
      user_id: user.id,
      name: pName,
      provider_type: pType,
      api_key: pApiKey.trim(),
      base_url: pBaseUrl.trim() || null,
    });
    if (error) { alert(`Gagal: ${error.message}`); return; }
    setIsProviderModalOpen(false);
    setPName(''); setPApiKey(''); setPBaseUrl(''); setPType('gemini');
    fetchAll();
  };

  const deleteProvider = async (id: string) => {
    if (!confirm('Hapus provider ini? Semua model di provider ini juga akan terhapus.')) return;
    await supabase.from('user_ai_providers').delete().eq('id', id);
    fetchAll();
  };

  const openAddModel = (providerId: string) => {
    const preset = PROVIDER_PRESETS.find(p => providers.find(pv => pv.id === providerId)?.provider_type === p.type);
    setModelProviderId(providerId);
    setMName('');
    setMModelName(preset?.defaultModel ?? '');
    setMVision(preset?.vision ?? true);
    setIsModelModalOpen(true);
  };

  const handleAddModel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !mName || !mModelName || !modelProviderId) return;
    const existingModels = models.filter(m => m.provider_id === modelProviderId);
    const nextPriority = existingModels.length > 0 ? Math.max(...existingModels.map(m => m.priority)) + 1 : 1;
    const { error } = await supabase.from('user_ai_models').insert({
      user_id: user.id,
      provider_id: modelProviderId,
      name: mName,
      model_name: mModelName.trim(),
      supports_vision: mVision,
      priority: nextPriority,
      is_active: true,
    });
    if (error) { alert(`Gagal: ${error.message}`); return; }
    setIsModelModalOpen(false);
    fetchAll();
  };

  const toggleModelActive = async (model: UserAiModel) => {
    const { error } = await supabase.from('user_ai_models').update({ is_active: !model.is_active }).eq('id', model.id);
    if (!error) setModels(prev => prev.map(m => m.id === model.id ? { ...m, is_active: !m.is_active } : m));
  };

  const deleteModel = async (id: string) => {
    if (!confirm('Hapus model ini?')) return;
    await supabase.from('user_ai_models').delete().eq('id', id);
    setModels(prev => prev.filter(m => m.id !== id));
  };

  const movePriority = async (model: UserAiModel, direction: 'up' | 'down') => {
    const provModels = models.filter(m => m.provider_id === model.provider_id).sort((a, b) => a.priority - b.priority);
    const idx = provModels.findIndex(m => m.id === model.id);
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= provModels.length) return;

    const a = provModels[idx];
    const b = provModels[targetIdx];
    const tmpPriority = a.priority;

    await Promise.all([
      supabase.from('user_ai_models').update({ priority: b.priority }).eq('id', a.id),
      supabase.from('user_ai_models').update({ priority: tmpPriority }).eq('id', b.id),
    ]);
    fetchAll();
  };

  const testConnection = async (model: UserAiModel) => {
    const provider = model.provider;
    if (!provider) { alert('Data provider tidak ditemukan'); return; }
    setTestingId(model.id);
    setTestResult(null);
    try {
      if (provider.provider_type === 'gemini') {
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model.model_name}:generateContent?key=${provider.api_key}`,
          { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ parts: [{ text: 'Ping' }] }] }) }
        );
        setTestResult({ id: model.id, success: res.ok, message: res.ok ? 'Koneksi Berhasil ✓' : `Error ${res.status}` });
      } else {
        const url = (provider.base_url || 'https://api.openai.com/v1').replace(/\/$/, '');
        const res = await fetch(`${url}/chat/completions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${provider.api_key}` },
          body: JSON.stringify({ model: model.model_name, messages: [{ role: 'user', content: 'Ping' }] }),
        });
        setTestResult({ id: model.id, success: res.ok, message: res.ok ? 'Koneksi Berhasil ✓' : `Error ${res.status}: ${await res.text()}` });
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
            Satu API Key (Provider) bisa punya banyak model. Sistem mencoba model sesuai urutan prioritas.
          </p>
        </div>
        <Button onClick={() => setIsProviderModalOpen(true)} className="gap-2 bg-blue-600 hover:bg-blue-700 text-white shadow-md">
          <Plus size={18} /> Tambah Provider
        </Button>
      </div>

      {/* Info Card */}
      <div className="rounded-xl border border-blue-100 bg-blue-50/50 p-4 dark:border-blue-900/50 dark:bg-blue-950/20 text-sm text-blue-900 dark:text-blue-200 flex items-start gap-3">
        <Sparkles className="text-blue-600 shrink-0 mt-0.5" size={20} />
        <div>
          <span className="font-semibold">Konsep: 1 Provider → banyak Model.</span>{' '}
          Daftarkan API Key sekali per provider (Gemini, Groq, NaraRouter, dsb), lalu tambahkan model apa saja yang didukung provider tersebut. Sistem akan mencoba model secara rolling sesuai urutan prioritas.
        </div>
      </div>

      {/* Provider List */}
      {isLoading ? (
        <div className="flex justify-center p-12">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
        </div>
      ) : providers.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-800 p-12 text-center bg-white dark:bg-card">
          <Server className="mx-auto text-slate-400 mb-3" size={40} />
          <h3 className="font-semibold text-slate-800 dark:text-slate-200">Belum Ada Provider AI</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-md mx-auto">
            Saat ini bot menggunakan System Default (NaraRouter). Tambahkan provider API Key milikmu sendiri!
          </p>
          <Button onClick={() => setIsProviderModalOpen(true)} className="mt-4 gap-2 bg-blue-600 text-white">
            <Plus size={16} /> Tambah Provider Pertama
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          {providers.map(provider => {
            const provModels = models.filter(m => m.provider_id === provider.id).sort((a, b) => a.priority - b.priority);
            const isExpanded = expandedProvider === provider.id;

            return (
              <div key={provider.id} className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-card shadow-sm overflow-hidden">
                {/* Provider header */}
                <div className="flex items-center justify-between p-4">
                  <button
                    className="flex items-center gap-3 flex-1 text-left"
                    onClick={() => setExpandedProvider(isExpanded ? null : provider.id)}
                  >
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 shrink-0">
                      <Key size={18} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-900 dark:text-slate-100">{provider.name}</span>
                        <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                          {provider.provider_type}
                        </span>
                        <span className="text-xs text-slate-400 dark:text-slate-500">
                          {provModels.length} model
                        </span>
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 font-mono">
                        API Key: ••••••••{provider.api_key.slice(-4)}
                        {provider.base_url && <span className="ml-3">{provider.base_url}</span>}
                      </div>
                    </div>
                    {isExpanded ? <ChevronDown size={16} className="ml-auto text-slate-400" /> : <ChevronRight size={16} className="ml-auto text-slate-400" />}
                  </button>

                  <div className="flex items-center gap-2 ml-4">
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1 text-xs"
                      onClick={() => { setExpandedProvider(provider.id); openAddModel(provider.id); }}
                    >
                      <Plus size={14} /> Model
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => deleteProvider(provider.id)}
                      className="h-8 w-8 text-slate-400 hover:text-rose-600"
                      title="Hapus Provider"
                    >
                      <Trash2 size={16} />
                    </Button>
                  </div>
                </div>

                {/* Model list (collapsible) */}
                {isExpanded && (
                  <div className="border-t border-slate-100 dark:border-slate-800">
                    {provModels.length === 0 ? (
                      <div className="p-4 text-center text-sm text-slate-400">
                        Belum ada model. <button onClick={() => openAddModel(provider.id)} className="text-blue-600 hover:underline font-medium">Tambah model →</button>
                      </div>
                    ) : (
                      <div className="divide-y divide-slate-100 dark:divide-slate-800">
                        {provModels.map((model, idx) => (
                          <div
                            key={model.id}
                            className={`flex flex-col sm:flex-row sm:items-center justify-between px-4 py-3 transition-all ${
                              model.is_active ? '' : 'opacity-50'
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              <div className="flex h-7 w-7 items-center justify-center rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 text-xs font-bold shrink-0">
                                #{idx + 1}
                              </div>
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="font-semibold text-sm text-slate-900 dark:text-slate-100">{model.name}</span>
                                  {model.supports_vision && (
                                    <span className="text-xs px-1.5 py-0.5 rounded-full font-medium bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 flex items-center gap-1">
                                      <Eye size={10} /> Vision
                                    </span>
                                  )}
                                </div>
                                <code className="text-xs text-blue-600 dark:text-blue-400 font-mono">{model.model_name}</code>
                                {testResult?.id === model.id && (
                                  <div className={`text-xs mt-0.5 font-medium ${testResult.success ? 'text-emerald-600' : 'text-rose-600'}`}>
                                    {testResult.message}
                                  </div>
                                )}
                              </div>
                            </div>

                            <div className="flex items-center gap-1 mt-2 sm:mt-0">
                              <Button variant="ghost" size="icon" disabled={idx === 0} onClick={() => movePriority(model, 'up')} className="h-7 w-7 text-slate-400 hover:text-slate-600" title="Naikkan Prioritas">
                                <ArrowUp size={14} />
                              </Button>
                              <Button variant="ghost" size="icon" disabled={idx === provModels.length - 1} onClick={() => movePriority(model, 'down')} className="h-7 w-7 text-slate-400 hover:text-slate-600" title="Turunkan Prioritas">
                                <ArrowDown size={14} />
                              </Button>
                              <Button variant="outline" size="sm" onClick={() => testConnection(model)} disabled={testingId === model.id} className="text-xs ml-1">
                                {testingId === model.id ? 'Testing...' : 'Test'}
                              </Button>
                              <Button
                                variant={model.is_active ? 'default' : 'secondary'}
                                size="sm"
                                onClick={() => toggleModelActive(model)}
                                className={`text-xs ${model.is_active ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : ''}`}
                              >
                                {model.is_active ? 'Aktif' : 'Nonaktif'}
                              </Button>
                              <Button variant="ghost" size="icon" onClick={() => deleteModel(model.id)} className="h-7 w-7 text-slate-400 hover:text-rose-600">
                                <Trash2 size={14} />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Modal: Tambah Provider */}
      {isProviderModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-card p-6 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-4">
            <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <Server size={20} className="text-blue-600" /> Tambah Provider API
            </h2>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-500">Preset Cepat:</label>
              <div className="grid grid-cols-2 gap-2">
                {PROVIDER_PRESETS.map(preset => (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => applyProviderPreset(preset)}
                    className="px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-blue-50 dark:hover:bg-blue-950 font-medium text-slate-700 dark:text-slate-300"
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>

            <form onSubmit={handleAddProvider} className="space-y-3 pt-1">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Nama Provider</label>
                <input type="text" required placeholder="Misal: Google Gemini Pribadi" value={pName} onChange={e => setPName(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Provider Type</label>
                <select value={pType} onChange={e => setPType(e.target.value as any)}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent dark:bg-card">
                  <option value="gemini">Google Gemini (Direct API)</option>
                  <option value="openai_compatible">OpenAI Compatible (Groq, NaraRouter, Custom)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">API Key</label>
                <input type="password" required placeholder="AIzaSy... / gsk_... / sk-..." value={pApiKey} onChange={e => setPApiKey(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent font-mono" />
              </div>
              {pType === 'openai_compatible' && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Base URL</label>
                  <input type="text" placeholder="https://api.groq.com/openai/v1" value={pBaseUrl} onChange={e => setPBaseUrl(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent font-mono" />
                </div>
              )}
              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                <Button type="button" variant="outline" onClick={() => setIsProviderModalOpen(false)}>Batal</Button>
                <Button type="submit" className="bg-blue-600 text-white">Simpan Provider</Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Tambah Model */}
      {isModelModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-card p-6 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-4">
            <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <Bot size={20} className="text-blue-600" /> Tambah Model
            </h2>
            <p className="text-xs text-slate-500">
              Provider: <span className="font-semibold text-slate-700 dark:text-slate-300">{providers.find(p => p.id === modelProviderId)?.name}</span>
            </p>
            <form onSubmit={handleAddModel} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Nama Label Model</label>
                <input type="text" required placeholder="Misal: Gemini Flash" value={mName} onChange={e => setMName(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Model Name (ID)</label>
                <input type="text" required placeholder="gemini-flash-latest / agnes-2.5-flash / gpt-4o-mini" value={mModelName} onChange={e => setMModelName(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent font-mono" />
              </div>
              <div className="flex items-center gap-2 pt-1">
                <input type="checkbox" id="mVision" checked={mVision} onChange={e => setMVision(e.target.checked)}
                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 h-4 w-4" />
                <label htmlFor="mVision" className="text-xs font-medium text-slate-700 dark:text-slate-300">
                  Model ini mendukung OCR Vision / Scan Gambar Struk 📸
                </label>
              </div>
              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                <Button type="button" variant="outline" onClick={() => setIsModelModalOpen(false)}>Batal</Button>
                <Button type="submit" className="bg-blue-600 text-white">Simpan Model</Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
