'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Logo } from '@/components/brand/Logo';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { BTN, INPUT } from './adminStyles';

export function AdminLogin() {
  const router = useRouter();
  const [passwordSet, setPasswordSet] = useState<boolean | null>(null);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/admin/auth')
      .then((r) => r.json())
      .then((data) => setPasswordSet(data.passwordSet));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const res = await fetch('/api/admin/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    if (res.ok) {
      router.push('/admin/curriculum');
    } else {
      const data = await res.json();
      setError(data.error ?? 'Login failed');
    }
  }

  if (passwordSet === null) return <p className="grid min-h-dvh place-items-center text-text-muted">Loading...</p>;

  return (
    <div className="grid min-h-dvh place-items-center px-4 py-8">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center">
          <Logo className="w-full max-w-72" />
          <h1 className="text-xl font-bold">{passwordSet ? 'Admin login' : 'Set admin password'}</h1>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <Input
              type="password"
              aria-label="Password"
              className={INPUT}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
            />
            <Button type="submit" className={BTN}>
              {passwordSet ? 'Log in' : 'Set password'}
            </Button>
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
