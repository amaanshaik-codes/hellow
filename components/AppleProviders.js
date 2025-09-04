"use client";
import * as Tooltip from '@radix-ui/react-tooltip';
import { useEffect } from 'react';

export default function AppleProviders({ children }) {
  // ensure initial theme class is present on mount (default light)
  useEffect(() => {
    const stored = typeof window !== 'undefined' ? localStorage.getItem('theme') : null;
    const theme = stored === 'dark' ? 'theme-dark' : 'theme-light';
    document.body.classList.remove('theme-dark', 'theme-light');
    document.body.classList.add(theme);
  }, []);
  return <Tooltip.Provider delayDuration={250}>{children}</Tooltip.Provider>;
}
