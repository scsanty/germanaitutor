'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

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

  if (passwordSet === null) return <p>Loading...</p>;

  return (
    <form onSubmit={handleSubmit}>
      <h1>{passwordSet ? 'Admin login' : 'Set admin password'}</h1>
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Password"
      />
      <button type="submit">{passwordSet ? 'Log in' : 'Set password'}</button>
      {error && <p role="alert">{error}</p>}
    </form>
  );
}
