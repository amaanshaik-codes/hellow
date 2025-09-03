"use client";
import { useEffect, useState } from 'react';

export default function ThemeToggle() {
  const [theme, setTheme] = useState(() => typeof window !== 'undefined' ? localStorage.getItem('theme') || 'light' : 'light');

  useEffect(() => {
  document.body.classList.remove('theme-dark', 'theme-light');
  document.body.classList.add(theme === 'dark' ? 'theme-dark' : 'theme-light');
  // add a transition helper to enable smooth animation
  document.body.classList.add('theme-transition');
  localStorage.setItem('theme', theme);
  const t = setTimeout(() => document.body.classList.remove('theme-transition'), 500);
  return () => clearTimeout(t);
  }, [theme]);

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} className="msg-action-btn" aria-label="Toggle theme">{theme === 'dark' ? '🌙' : '☀️'}</button>
    </div>
  );
}
