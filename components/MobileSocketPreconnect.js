"use client";

import { useEffect } from 'react';

// Lightweight preconnect helper: dynamically import socket.io-client and open a connection
export default function MobileSocketPreconnect({ socketUrl, jwtToken }) {
  useEffect(() => {
    let socket = null;
    let didCancel = false;

    async function start() {
      try {
        const { io } = await import('socket.io-client');
        const url = socketUrl || (typeof window !== 'undefined' && window.__NEXT_DATA__?.env?.NEXT_PUBLIC_SOCKET_URL) || process.env.NEXT_PUBLIC_SOCKET_URL || null;
        const opts = { auth: { token: jwtToken }, path: '/api/socketio', autoConnect: true };
        socket = url ? io(url, opts) : io('/api/socketio', opts);

        // quick listeners for health and immediate disconnect to avoid lingering resources
        socket.on('connect', () => {
          // no-op; preconnected
        });

        socket.on('connect_error', () => {
          // ignore connect errors for preconnect
        });

        // Close after a short warmup if still connected to avoid resource usage
        setTimeout(() => {
          try { if (socket && socket.connected) socket.disconnect(); } catch (e) {}
        }, 4500);
      } catch (e) {
        // if socket.io isn't available, silently ignore
        console.warn('Preconnect failed', e);
      }
    }

    start();

    return () => {
      didCancel = true;
      try { if (socket) socket.disconnect(); } catch (e) {}
    };
  }, [socketUrl, jwtToken]);

  return null;
}
