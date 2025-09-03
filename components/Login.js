"use client";
import { useState } from 'react';
import * as Avatar from '@radix-ui/react-avatar';
import * as Tooltip from '@radix-ui/react-tooltip';
import { InfoCircledIcon } from '@radix-ui/react-icons';

export default function Login({ onLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  function handleSubmit(e) {
    e.preventDefault();
    if (!username || !password) {
      setError('Please enter username and password');
      return;
    }
    setError('');
    const API_BASE = process.env.NEXT_PUBLIC_API_URL || '';
    fetch(`${API_BASE}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    }).then(async (res) => {
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.message || 'Login failed');
        return;
      }
      const data = await res.json();
      if (data && data.token) {
        // persist token and username client-side for auto-login
        try { localStorage.setItem('hellow_token', data.token); localStorage.setItem('hellow_user', username); } catch (e) {}
        onLogin({ username, token: data.token });
      } else {
        setError('Invalid response from server');
      }
    }).catch((err) => {
      setError(err?.message || 'Network error');
    });
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-system-background">
      <form onSubmit={handleSubmit} className="bg-white-10 backdrop-blur-apple p-8 rounded-apple shadow-apple flex flex-col gap-8 w-full max-w-md" style={{ fontFamily: 'SF Pro Display, San Francisco, Segoe UI, Roboto, Helvetica Neue, Arial, sans-serif' }}>
        <div className="flex flex-col items-center gap-4">
          <div className="w-16 h-16 rounded-full overflow-hidden bg-system-accent flex items-center justify-center shadow-apple">
            <div className="w-full h-full flex items-center justify-center text-3xl font-bold text-white">H</div>
          </div>
          <div className="text-center">
            <div className="font-bold text-2xl tracking-tight text-system-label">Hellow</div>
            <div className="text-system-secondaryLabel text-base mt-1">Private peer-to-peer chat</div>
          </div>
        </div>
        <div className="flex flex-col gap-4">
          <input className="px-4 py-3 rounded-apple bg-white-10 text-system-label placeholder-system-secondaryLabel border border-white-10 focus:border-system-accent focus\:ring-2 focus\:ring-system-accent/30 focus:outline-none transition" placeholder="Username" value={username} onChange={e => setUsername(e.target.value)} required autoFocus />
          <input className="px-4 py-3 rounded-apple bg-white-10 text-system-label placeholder-system-secondaryLabel border border-white-10 focus:border-system-accent focus\:ring-2 focus\:ring-system-accent/30 focus:outline-none transition" placeholder="Password" type="password" value={password} onChange={e => setPassword(e.target.value)} required />
        </div>
        <div className="flex gap-4">
          <button type="submit" className="px-6 py-2 rounded-apple font-semibold text-system-label bg-system-accent shadow-apple transition hover\:bg-system-accent focus:outline-none focus\:ring-2 focus\:ring-system-accent/50 flex-1">Login</button>
          <button type="button" className="px-6 py-2 rounded-apple font-semibold text-system-label bg-transparent border border-white-10 shadow-apple transition hover:bg-white-10 focus:outline-none focus\:ring-2 focus\:ring-system-accent/50 flex-1" onClick={() => { setUsername('ammu'); setPassword('qwerty12345'); }}>Fill demo</button>
        </div>
        {error && <div className="text-red-500 text-center text-sm mt-2">{error}</div>}
        <div className="flex justify-center mt-2">
          <Tooltip.Root>
            <Tooltip.Trigger asChild>
              <button type="button" className="bg-transparent border-none cursor-pointer" aria-label="info"><InfoCircledIcon className="text-system-secondaryLabel w-5 h-5" /></button>
            </Tooltip.Trigger>
            <Tooltip.Content side="top" align="center" className="px-3 py-2 rounded-apple bg-system-background text-system-label shadow-apple">Demo login — any creds work</Tooltip.Content>
          </Tooltip.Root>
        </div>
      </form>
    </div>
  );
}
