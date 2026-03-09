import React from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { LineChart, ShieldCheck, Wallet } from 'lucide-react';

export default function LandingPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Navbar */}
      <header className="flex h-16 items-center justify-between border-b px-6 lg:px-12">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded bg-primary text-white">
            <span className="font-bold">K</span>
          </div>
          <span className="text-xl font-bold">Keuangan Pro</span>
        </div>
        <nav className="flex items-center gap-4">
          <Link to="/login" className="text-sm font-medium hover:text-primary">
            Log in
          </Link>
          <Link to="/register">
            <Button>Mulai Sekarang</Button>
          </Link>
        </nav>
      </header>

      {/* Hero Section */}
      <main className="flex-1 relative overflow-hidden">
        {/* Colorful Abstract Background */}
        <div className="absolute top-0 right-0 -translate-y-12 translate-x-1/3 w-[800px] h-[800px] bg-primary/20 rounded-full blur-3xl opacity-50 pointer-events-none" />
        <div className="absolute bottom-0 left-0 translate-y-1/3 -translate-x-1/3 w-[600px] h-[600px] bg-purple-500/20 rounded-full blur-3xl opacity-50 pointer-events-none" />
        
        <section className="relative flex flex-col items-center justify-center px-6 py-24 text-center lg:px-12 lg:py-32">
          <div className="inline-flex items-center rounded-full border bg-background/50 backdrop-blur-sm px-3 py-1 text-sm text-primary font-medium mb-8 shadow-sm">
            <span className="flex h-2 w-2 rounded-full bg-primary mr-2 animate-pulse"></span>
            Aplikasi Keuangan Generasi Baru
          </div>
          <h1 className="max-w-4xl text-5xl font-extrabold tracking-tight sm:text-6xl lg:text-7xl">
            Kelola Keuanganmu Lebih <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-purple-500">Cerdas</span> dengan Keuangan Pro
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-xl text-muted-foreground leading-relaxed">
            Catat pemasukan dan pengeluaran, pantau saldo seluruh dompet Anda dalam satu dashboard intuitif, dan capai tujuan finansial Anda.
          </p>
          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4 w-full sm:w-auto">
            <Link to="/register" className="w-full sm:w-auto">
              <Button size="lg" className="w-full h-14 px-8 text-lg rounded-full shadow-lg shadow-primary/30 hover:scale-105 transition-transform bg-gradient-to-r from-primary to-purple-600 hover:from-primary/90 hover:to-purple-600/90">
                Mulai Sekarang - Gratis
              </Button>
            </Link>
            <Link to="/login" className="w-full sm:w-auto">
              <Button size="lg" variant="outline" className="w-full h-14 px-8 text-lg rounded-full bg-background/50 backdrop-blur hover:bg-secondary/80 transition-colors">
                Masuk ke Dashboard
              </Button>
            </Link>
          </div>
        </section>

        {/* Features Section */}
        <section className="bg-muted py-24">
          <div className="mx-auto max-w-5xl px-6 lg:px-12">
            <div className="text-center mb-16">
              <h2 className="text-3xl font-bold tracking-tight">Fitur Unggulan Kami</h2>
              <p className="mt-4 text-muted-foreground">Semua yang Anda butuhkan untuk mengatur uang dengan lebih baik.</p>
            </div>
            
            <div className="grid gap-8 md:grid-cols-3">
              <div className="flex flex-col items-center text-center rounded-2xl bg-card p-8 shadow-sm">
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Wallet size={24} />
                </div>
                <h3 className="mb-2 text-xl font-semibold">Tracking Mudah</h3>
                <p className="text-muted-foreground">Catat transaksi dari berbagai rekening dan dompet digital dalam hitungan detik.</p>
              </div>

              <div className="flex flex-col items-center text-center rounded-2xl bg-card p-8 shadow-sm">
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <LineChart size={24} />
                </div>
                <h3 className="mb-2 text-xl font-semibold">Laporan Visual</h3>
                <p className="text-muted-foreground">Analisa kebiasaan belanja Anda melalui grafik yang mudah dipahami setiap bulannya.</p>
              </div>

              <div className="flex flex-col items-center text-center rounded-2xl bg-card p-8 shadow-sm">
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <ShieldCheck size={24} />
                </div>
                <h3 className="mb-2 text-xl font-semibold">Aman dengan OTP</h3>
                <p className="text-muted-foreground">Sistem keamanan tingkat tinggi menggunakan verifikasi Email OTP untuk akses data Anda.</p>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t py-8 text-center text-sm text-muted-foreground">
        <p>&copy; {new Date().getFullYear()} Keuangan Pro. All rights reserved.</p>
      </footer>
    </div>
  );
}
