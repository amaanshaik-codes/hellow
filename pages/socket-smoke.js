import { useEffect, useState } from 'react';

export default function SocketSmoke() {
  const [rtt, setRtt] = useState(null);
  const [connected, setConnected] = useState(false);
  const [log, setLog] = useState([]);

  useEffect(() => {
    let socket;
    let interval;
    async function start() {
      const { io } = await import('socket.io-client');
      // Use a temporary token if available on window (for local dev); otherwise prompt
      const token = window.__DEV_TOKEN__ || '';
      socket = io('/api/socketio', { auth: { token }, path: '/api/socketio' });

      socket.on('connect', () => {
        setConnected(true);
        setLog(l => [...l, `connected: ${socket.id}`]);
      });

      socket.on('disconnect', (reason) => {
        setConnected(false);
        setLog(l => [...l, `disconnected: ${reason}`]);
      });

      // Ping every 2s
      interval = setInterval(async () => {
        if (!socket || !socket.connected) return;
        const start = Date.now();
        socket.emit('ping-test', {}, (resp) => {
          if (resp && resp.serverTs) {
            const now = Date.now();
            const r = now - start;
            setRtt(r);
            setLog(l => [...l.slice(-50), `ping: ${r}ms`]);
          } else {
            setLog(l => [...l, `ping error: ${JSON.stringify(resp)}`]);
          }
        });
      }, 2000);
    }
    start();

    return () => {
      try { socket && socket.close(); } catch (e) {}
      clearInterval(interval);
    };
  }, []);

  return (
    <div style={{ padding: 20 }}>
      <h2>Socket.io smoke test</h2>
      <div>Status: {connected ? 'connected' : 'disconnected'}</div>
      <div>RTT: {rtt ? `${rtt} ms` : '—'}</div>
      <div style={{ marginTop: 12 }}>
        <strong>Log</strong>
        <div style={{ maxHeight: 300, overflow: 'auto', background: '#0b0b0b', color: '#fff', padding: 8 }}>
          {log.map((l, i) => <div key={i}>{l}</div>)}
        </div>
      </div>
    </div>
  );
}
