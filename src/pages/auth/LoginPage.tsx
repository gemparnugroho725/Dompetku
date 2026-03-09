import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';

const loginSchema = z.object({
  email: z.string().email({ message: "Email tidak valid" }),
  password: z.string().min(6, { message: "Password minimal 6 karakter" }),
});

type LoginFormValues = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (data: LoginFormValues) => {
    setIsLoading(true);
    setError(null);
    
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: data.email,
        password: data.password,
      });

      if (error) throw error;
      
      navigate('/dashboard');
    } catch (err: any) {
      setError(err.message || "Gagal melakukan login. Periksa kembali kredensial Anda.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-[80vh] flex items-center justify-center relative w-full">
      {/* Background Blobs */}
      <div className="absolute top-0 right-0 w-[400px] h-[400px] bg-primary/20 rounded-full blur-3xl opacity-50 pointer-events-none translate-x-1/3 -translate-y-1/3" />
      <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-purple-500/20 rounded-full blur-3xl opacity-50 pointer-events-none -translate-x-1/3 translate-y-1/3" />
      
      <Card className="w-full max-w-md shadow-2xl border-primary/10 relative backdrop-blur-sm bg-card/95">
        <CardHeader className="space-y-2 text-center pb-6">
        <CardTitle className="text-2xl font-bold">Selamat Datang Kembali</CardTitle>
        <CardDescription>
          Masukkan email dan password Anda untuk login
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input 
              id="email" 
              type="email" 
              placeholder="m@example.com" 
              {...register('email')}
            />
            {errors.email && (
              <p className="text-sm text-destructive">{errors.email.message}</p>
            )}
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="password">Password</Label>
              <Link to="#" className="text-xs font-medium text-primary hover:underline">
                Lupa Password?
              </Link>
            </div>
            <Input 
              id="password" 
              type="password" 
              {...register('password')}
            />
            {errors.password && (
              <p className="text-sm text-destructive">{errors.password.message}</p>
            )}
          </div>
          
          {error && (
            <div className="rounded-md bg-destructive/15 p-3 text-sm text-destructive">
              {error}
            </div>
          )}

          <Button type="submit" className="w-full h-11 bg-gradient-to-r from-primary to-purple-600 hover:from-primary/90 hover:to-purple-600/90 text-white shadow-md transition-all hover:scale-[1.02]" disabled={isLoading}>
            {isLoading ? "Memproses..." : "Log In"}
          </Button>
        </form>
      </CardContent>
      <CardFooter className="flex justify-center border-t p-6 bg-muted/30">
        <p className="text-sm text-muted-foreground">
          Belum punya akun?{' '}
          <Link to="/register" className="font-bold text-primary hover:text-purple-600 transition-colors">
            Daftar sekarang
          </Link>
        </p>
      </CardFooter>
    </Card>
    </div>
  );
}
