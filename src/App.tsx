import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from '@/contexts/AuthContext';
import { ThemeProvider } from '@/contexts/ThemeContext';

// Layouts
import AuthLayout from '@/components/layout/AuthLayout';
import MainLayout from '@/components/layout/MainLayout';

// Pages - Auth
import LandingPage from '@/pages/LandingPage';
import LoginPage from '@/pages/auth/LoginPage';
import RegisterPage from '@/pages/auth/RegisterPage';
import VerifyOtpPage from '@/pages/auth/VerifyOtpPage';

// Pages - Protected
import DashboardPage from '@/pages/dashboard/DashboardPage';
import TransactionsNewPage from '@/pages/transactions/TransactionsNewPage';
import AccountsPage from '@/pages/accounts/AccountsPage';
import CategoriesPage from '@/pages/categories/CategoriesPage';
import ReportsPage from '@/pages/reports/ReportsPage';

function App() {
  return (
    <ThemeProvider defaultTheme="light" storageKey="vite-ui-theme-v2">
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            {/* Public Root / Landing Page */}
            <Route path="/" element={<LandingPage />} />
            
            {/* Auth Routes */}
            <Route element={<AuthLayout />}>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/register" element={<RegisterPage />} />
              <Route path="/verify-otp" element={<VerifyOtpPage />} />
            </Route>

            {/* Protected Routes */}
            <Route element={<MainLayout />}>
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/transactions/new" element={<TransactionsNewPage />} />
              <Route path="/accounts" element={<AccountsPage />} />
              <Route path="/categories" element={<CategoriesPage />} />
              <Route path="/reports" element={<ReportsPage />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
