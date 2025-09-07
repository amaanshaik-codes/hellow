import { useEffect } from 'react';

export default function NotificationToast({ message, onClose }) {
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(onClose, 3500);
    return () => clearTimeout(timer);
  }, [message, onClose]);
  if (!message) return null;
  return (
    <div style={{
      position: 'fixed',
      bottom: 24,
      right: 24,
      zIndex: 9999,
      background: 'rgba(30,30,40,0.97)',
      color: '#fff',
      borderRadius: 8,
      padding: '14px 22px',
      boxShadow: '0 4px 24px rgba(0,0,0,0.18)',
      fontSize: 15,
      maxWidth: 320,
      pointerEvents: 'auto',
      transition: 'opacity 0.2s',
    }}>
      <b style={{ fontWeight: 600 }}>{message.title}</b>
      <div style={{ marginTop: 4 }}>{message.body}</div>
    </div>
  );
}
