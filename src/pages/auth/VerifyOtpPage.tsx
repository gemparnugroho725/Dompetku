import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';

export default function VerifyOtpPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const email = location.state?.email;
  
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!email) {
      navigate('/register');
    }
  }, [email, navigate]);

  const handleChange = (element: HTMLInputElement, index: number) => {
    if (isNaN(Number(element.value))) return false;

    setOtp([...otp.map((d, idx) => (idx === index ? element.value : d))]);

    // Focus next input
    if (element.nextSibling && element.value !== '') {
      (element.nextSibling as HTMLInputElement).focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, index: number) => {
    if (e.key === 'Backspace' && !otp[index] && e.currentTarget.previousSibling) {
      (e.currentTarget.previousSibling as HTMLInputElement).focus();
    }
  };

  const currentOtp = otp.join('');

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (currentOtp.length < 6) {
      setError('Masukkan kode 6 digit');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const { error } = await supabase.auth.verifyOtp({
        email,
        token: currentOtp,
        type: 'signup', // adjust if using magiclink or another type
      });

      if (error) throw error;
      
      // Let AuthContext handle the redirect on successful auth state change
    } catch (err: any) {
      setError(err.message || "Kode OTP tidak valid atau kadaluarsa.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="w-full shadow-lg">
      <CardHeader className="space-y-1 text-center">
        <CardTitle className="text-2xl font-bold">Verifikasi Email</CardTitle>
        <CardDescription>
          Masukkan 6-digit kode OTP yang telah dikirimkan ke <br/>
          <span className="font-semibold text-foreground">{email}</span>
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-6 flex flex-col items-center">
          <div className="flex gap-2 justify-center">
            {otp.map((data, index) => {
              return (
                <input
                  className="w-12 h-14 text-center text-xl font-bold border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
                  type="text"
                  name="otp"
                  maxLength={1}
                  key={index}
                  value={data}
                  onChange={e => handleChange(e.target, index)}
                  onFocus={e => e.target.select()}
                  onKeyDown={e => handleKeyDown(e, index)}
                />
              );
            })}
          </div>

          {error && (
            <div className="w-full rounded-md bg-destructive/15 p-3 text-sm text-center text-destructive">
              {error}
            </div>
          )}

          <Button type="submit" className="w-full" disabled={isLoading || currentOtp.length < 6}>
            {isLoading ? "Memverifikasi..." : "Verifikasi"}
          </Button>
        </form>
      </CardContent>
      <CardFooter className="flex justify-center border-t p-4 text-center">
        <p className="text-sm text-muted-foreground">
          Tidak menerima email?{' '}
          <button 
            type="button"
            className="font-semibold text-primary hover:underline"
            onClick={() => {/* Resend logic could be implemented here */}}
          >
            Kirim Ulang
          </button>
        </p>
      </CardFooter>
    </Card>
  );
}
