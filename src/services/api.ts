import { supabase } from '@/lib/supabase';

// TYPES
export type Profile = {
  id: string;
  email: string;
  name: string;
  role: string;
  status: string;
  monthly_budget: number | null;
  createdAt: string;
  updatedAt: string;
};

export type Account = {
  id: string;
  user_id: string;
  name: string;
  initial_balance: number;
  created_at: string;
};

export type Category = {
  id: string;
  user_id: string;
  name: string;
  type: 'income' | 'expense';
  created_at: string;
};

export type Transaction = {
  id: string;
  user_id: string;
  date: string;
  type: 'income' | 'expense' | 'transfer';
  account_id: string;
  to_account_id: string | null;
  category_id: string | null;
  amount: number;
  description: string | null;
  tags: string | null;
  receipt_url: string | null;
  created_at: string;
  // Included relations
  accounts?: Account;
  to_accounts?: Account;
  categories?: Category;
};

export type TelegramLinkStatus = {
  isLinked: boolean;
  telegramUsername: string | null;
  telegramChatId: string | null;
  linkedAt: string | null;
  botUsername: string | null;
  linkToken: string | null;
  linkExpiresAt: string | null;
};

// ACCOUNTS SERVICE
export const getAccounts = async () => {
  const { data, error } = await supabase
    .from('accounts')
    .select('*')
    .order('name', { ascending: true });
  if (error) throw error;
  return data as Account[];
};

export const createAccount = async (name: string, initial_balance: number = 0) => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('accounts')
    .insert([{ user_id: user.id, name, initial_balance }])
    .select()
    .single();
  if (error) throw error;
  return data as Account;
};

export const updateAccount = async (id: string, name: string, initial_balance: number) => {
  const { data, error } = await supabase
    .from('accounts')
    .update({ name, initial_balance })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data as Account;
};

export const deleteAccount = async (id: string) => {
  const { error } = await supabase
    .from('accounts')
    .delete()
    .eq('id', id);
  if (error) throw error;
  return true;
};

// CATEGORIES SERVICE
export const getCategories = async (type?: 'income' | 'expense') => {
  let query = supabase.from('categories').select('*').order('name', { ascending: true });
  if (type) {
    query = query.eq('type', type);
  }
  const { data, error } = await query;
  if (error) throw error;
  return data as Category[];
};

export const createCategory = async (name: string, type: 'income' | 'expense') => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('categories')
    .insert([{ user_id: user.id, name, type }])
    .select()
    .single();
  if (error) throw error;
  return data as Category;
};

export const updateCategory = async (id: string, name: string) => {
  const { data, error } = await supabase
    .from('categories')
    .update({ name })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data as Category;
};

export const deleteCategory = async (id: string) => {
  const { error } = await supabase
    .from('categories')
    .delete()
    .eq('id', id);
  if (error) throw error;
  return true;
};

// TRANSACTIONS SERVICE
export const getTransactions = async (
  options: { month?: number, year?: number, startDate?: string, endDate?: string } = {}
) => {
  const { month, year, startDate, endDate } = options;
  let query = supabase
    .from('transactions')
    .select(`
      *,
      accounts:account_id (id, name),
      to_accounts:to_account_id (id, name),
      categories (id, name, type)
    `)
    .order('date', { ascending: false })
    .order('created_at', { ascending: false });

  if (month !== undefined && year !== undefined) {
    // Construct date string bounds for the month
    const start = new Date(year, month - 1, 1).toISOString().split('T')[0];
    const end = new Date(year, month, 0).toISOString().split('T')[0]; // Last day of month
    query = query.gte('date', start).lte('date', end);
  } else if (startDate && endDate) {
    query = query.gte('date', startDate).lte('date', endDate);
  } else if (year !== undefined && month === undefined) {
    // Full year
    const start = `${year}-01-01`;
    const end = `${year}-12-31`;
    query = query.gte('date', start).lte('date', end);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data as (Transaction & { accounts: {name: string}, to_accounts: {name: string} | null, categories: {name: string, type: string} })[];
};

export const createTransaction = async (txData: Omit<Transaction, 'id' | 'user_id' | 'created_at'>) => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('transactions')
    .insert([{ ...txData, user_id: user.id }])
    .select()
    .single();
    
  if (error) throw error;
  return data as Transaction;
};

export const updateTransaction = async (id: string, txData: Partial<Omit<Transaction, 'id' | 'user_id' | 'created_at'>>) => {
  const { data, error } = await supabase
    .from('transactions')
    .update(txData)
    .eq('id', id)
    .select()
    .single();
    
  if (error) throw error;
  return data as Transaction;
};

export const deleteTransaction = async (id: string) => {
  const { error } = await supabase
    .from('transactions')
    .delete()
    .eq('id', id);
    
  if (error) throw error;
  return true;
};

// PROFILE SERVICE
export const getProfile = async () => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();
    
  if (error) throw error;
  return data as Profile;
};

export const updateMonthlyBudget = async (budget: number) => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('profiles')
    .update({ monthly_budget: budget, updatedAt: new Date().toISOString() })
    .eq('id', user.id)
    .select();
    
  if (error) throw error;
  
  // If no row was updated (Profile doesn't exist yet for this user)
  if (!data || data.length === 0) {
    const { data: upsertData, error: upsertError } = await supabase
      .from('profiles')
      .upsert({ 
        id: user.id, 
        email: user.email || '',
        role: 'user',
        status: 'active',
        monthly_budget: budget,
        updatedAt: new Date().toISOString()
      })
      .select()
      .single();
      
    if (upsertError) throw upsertError;
    return upsertData as Profile;
  }

  return data[0] as Profile;
};

// TELEGRAM LINKING SERVICE
const invokeTelegramLink = async (action: 'status' | 'generate') => {
  const { data, error } = await supabase.functions.invoke('telegram-link', {
    body: { action },
  });

  if (error) throw error;
  return data as TelegramLinkStatus;
};

export const getTelegramLinkStatus = async () => {
  return invokeTelegramLink('status');
};

export const generateTelegramLinkToken = async () => {
  return invokeTelegramLink('generate');
};
