import React from 'react';
import { Navigate, Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Wallet, PlusCircle, LogOut, Menu, X, Moon, Sun, Tags, BarChart3 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { Button } from '@/components/ui/button';

export default function MainLayout() {
  const { user, isLoading, signOut } = useAuth();
  const { theme, setTheme } = useTheme();
  const location = useLocation();
  const navigate = useNavigate();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = React.useState(false);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  const navItems = [
    { name: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
    { name: 'Laporan', path: '/reports', icon: BarChart3 },
    { name: 'Accounts', path: '/accounts', icon: Wallet },
    { name: 'Kategori', path: '/categories', icon: Tags },
    { name: 'Add Transaction', path: '/transactions/new', icon: PlusCircle },
  ];

  const toggleTheme = () => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  };

  return (
    <div className="flex min-h-screen flex-col bg-[#f8fafc] dark:bg-background md:flex-row relative">
      {/* Subtle decorative blue accent (very soft background shape) */}
      <div className="fixed top-0 left-0 w-full h-64 bg-gradient-to-b from-blue-50/50 to-transparent pointer-events-none -z-10 dark:from-blue-950/20" />

      {/* Mobile Header */}
      <div className="flex h-16 items-center justify-between border-b border-border/40 bg-white dark:bg-card px-4 md:hidden z-30 relative shadow-sm">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-white shadow-sm">
            <span className="font-bold">K</span>
          </div>
          <span className="font-bold text-blue-900 dark:text-blue-100">Keuangan Pro</span>
        </div>
        <div className="flex items-center gap-1 sm:gap-2">
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={() => navigate('/transactions/new')}
            className="text-blue-600 dark:text-blue-400"
            aria-label="Tambah Transaksi"
          >
            <PlusCircle size={24} />
          </Button>
          <Button variant="ghost" size="icon" onClick={toggleTheme} className="text-slate-500">
            {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
          </Button>
          <button
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="p-2 text-slate-500"
          >
            {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>
      </div>

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 transform border-r border-border/40 bg-white dark:bg-card transition-transform duration-300 ease-in-out md:relative md:translate-x-0 shadow-lg md:shadow-none ${
          isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex h-full flex-col">
          <div className="hidden h-20 items-center justify-between border-b border-border/40 px-6 md:flex">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-white shadow-md shadow-blue-600/20">
                <span className="font-bold text-lg">K</span>
              </div>
              <span className="font-extrabold text-xl text-blue-900 dark:text-blue-100 tracking-tight">Keuangan Pro</span>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto py-6">
            <nav className="space-y-1.5 px-4">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = location.pathname === item.path;
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    onClick={() => setIsMobileMenuOpen(false)}
                    className={`flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-semibold transition-all duration-200 ${
                      isActive
                        ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 shadow-sm border border-blue-100 dark:border-blue-800/50'
                        : 'text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/50 hover:text-slate-900 dark:hover:text-slate-100'
                    }`}
                  >
                    <Icon size={20} className={isActive ? "text-blue-600 dark:text-blue-400" : "text-slate-400 dark:text-slate-500"} />
                    {item.name}
                  </Link>
                );
              })}
            </nav>
          </div>

          <div className="border-t border-border/40 p-6 bg-slate-50/50 dark:bg-slate-900/50">
            <div className="flex items-center justify-between mb-4">
              <div className="truncate px-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
                {user?.email}
              </div>
              <Button variant="ghost" size="icon" onClick={toggleTheme} className="h-8 w-8 text-slate-400 hover:text-slate-600">
                {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
              </Button>
            </div>
            <Button
              variant="outline"
              className="w-full justify-start gap-2 rounded-lg text-slate-600 hover:text-rose-600 hover:bg-rose-50 hover:border-rose-200 dark:text-slate-300 dark:hover:bg-rose-950/30 transition-colors"
              onClick={signOut}
            >
              <LogOut size={18} />
              Sign Out
            </Button>
          </div>
        </div>
      </aside>

      {/* Overlay for mobile */}
      {isMobileMenuOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/20 backdrop-blur-sm md:hidden"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto bg-transparent p-4 pb-24 md:p-8 relative z-10 text-slate-900 dark:text-slate-50">
        <div className="mx-auto max-w-6xl relative min-h-[calc(100vh-8rem)]">
          <Outlet />
          
        </div>
      </main>
    </div>
  );
}
