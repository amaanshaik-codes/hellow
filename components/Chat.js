"use client";
import { useState, useRef, useMemo, useEffect } from 'react';
import * as Avatar from '@radix-ui/react-avatar';
import * as ScrollArea from '@radix-ui/react-scroll-area';
import * as Tooltip from '@radix-ui/react-tooltip';
import { Pencil2Icon, TrashIcon, ExitIcon } from '@radix-ui/react-icons';
import ThemeToggle from './ThemeToggle';
import { motion, AnimatePresence } from 'framer-motion';

export default function Chat({ user, onLogout }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [context, setContext] = useState(null); // {x,y,msgId} when open
  const [editing, setEditing] = useState({ id: null, text: '' });
  const [replyTo, setReplyTo] = useState(null); // message id being replied to
  const [presence, setPresence] = useState({}); // username -> {online, lastSeen}
  const [receipts, setReceipts] = useState({}); // messageId -> status
  const chatBottom = useRef(null);
  const wsRef = useRef(null);
  const ROOM = process.env.NEXT_PUBLIC_WS_ROOM || 'main';
  const reconnectRef = useRef({ attempts: 0, timer: null });

  // connect websocket on mount
  useEffect(() => {
    const connect = () => {
      const WS_URL = process.env.NEXT_PUBLIC_WS_URL || (typeof window !== 'undefined' ? `${window.location.origin.replace(/^http/, 'ws')}` : 'ws://localhost:4000');
      const token = localStorage.getItem('hellow_token');
      try {
        const ws = new WebSocket(WS_URL.replace(/^http/, 'ws'));
        wsRef.current = ws;
        ws.addEventListener('open', () => {
          reconnectRef.current.attempts = 0;
          // send join (include token for identification if needed)
          ws.send(JSON.stringify({ type: 'join', room: ROOM, username: user.username, token }));
        });
        ws.addEventListener('message', (ev) => {
          try {
            const msg = JSON.parse(ev.data);
            if (msg.type === 'message') {
              setMessages(m => [...m, msg.payload || msg]);
              // send receipt back (delivered)
              try { ws.send(JSON.stringify({ type: 'receipt', messageId: (msg.payload||msg).id, status: 'delivered' })); } catch (e) {}
            }
            if (msg.type === 'edit') setMessages(m => m.map(mm => mm.id === msg.payload.id ? { ...mm, text: msg.payload.text, edited: true } : mm));
            if (msg.type === 'delete') setMessages(m => m.filter(mm => mm.id !== msg.payload.id));
            if (msg.type === 'presence') {
              setPresence(p => ({ ...p, [msg.username]: { online: msg.online, lastSeen: msg.lastSeen || new Date() } }));
            }
            if (msg.type === 'receipt') {
              setReceipts(r => ({ ...r, [msg.messageId]: msg.status }));
            }
          } catch (e) { /* ignore */ }
        });
        ws.addEventListener('close', () => {
          wsRef.current = null;
          // schedule reconnect with backoff
          reconnectRef.current.attempts += 1;
          const delay = Math.min(30000, 500 * Math.pow(1.6, reconnectRef.current.attempts));
          reconnectRef.current.timer = setTimeout(connect, delay);
        });
      } catch (e) {
        console.warn('WS connect failed', e);
        reconnectRef.current.attempts += 1;
        setTimeout(connect, Math.min(30000, 500 * reconnectRef.current.attempts));
      }
    };
    connect();
    // fetch recent history
    (async () => {
      const API_BASE = process.env.NEXT_PUBLIC_API_URL || '';
      const token = localStorage.getItem('hellow_token');
      try {
        const res = await fetch(`${API_BASE}/api/history/${ROOM}`, { headers: { Authorization: token ? `Bearer ${token}` : '' } });
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data)) setMessages(data);
        }
      } catch (e) {}
    })();

    return () => { if (wsRef.current) wsRef.current.close(); };
  }, []);

  function sendMessage(e) {
    e.preventDefault();
    if (!input.trim()) return;
  const payload = { id: Math.random().toString(36).slice(2), username: user.username, text: input, timestamp: Date.now(), replyTo: replyTo || null };
  const message = { type: 'message', payload };
  // optimistically append
  setMessages(m => [...m, payload]);
  try { wsRef.current?.send(JSON.stringify(message)); } catch (e) { console.warn('ws send failed', e); }
  setInput('');
  setReplyTo(null);
  setTimeout(() => chatBottom.current?.scrollIntoView({ behavior: 'smooth' }), 100);
  }

  // helper: group messages by day label
  const grouped = useMemo(() => {
    const groups = [];
    messages.forEach((msg) => {
      const d = new Date(msg.timestamp);
      const label = d.toLocaleDateString(undefined, { weekday: 'short', day: '2-digit', month: 'short' });
      const last = groups[groups.length - 1];
      if (!last || last.label !== label) groups.push({ label, items: [msg] }); else last.items.push(msg);
    });
    return groups;
  }, [messages]);

  // keep old convenience in case it's used elsewhere
  function handleEdit(id) {
    // start inline editing for this message
    const msg = messages.find(m => m.id === id);
    if (!msg) return;
    setEditing({ id, text: msg.text });
    closeContext();
  }

  function saveEdit() {
    const { id, text } = editing;
    if (!id) return;
  setMessages(m => m.map(msg => msg.id === id ? { ...msg, text, edited: true } : msg));
  try { wsRef.current?.send(JSON.stringify({ type: 'edit', payload: { id, text } })); } catch (e) {}
  setEditing({ id: null, text: '' });
  }

  function cancelEdit() {
    setEditing({ id: null, text: '' });
  }

  function handleDelete(id) {
  setMessages(m => m.filter(msg => msg.id !== id));
  try { wsRef.current?.send(JSON.stringify({ type: 'delete', payload: { id } })); } catch (e) {}
  }

  // context menu helpers
  function openContext(e, id) {
    e.preventDefault();
    const x = e.clientX;
    const y = e.clientY;
  setContext({ x, y, id });
  }

  function closeContext() {
    setContext(null);
  }

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') {
        if (editing.id) cancelEdit();
        closeContext();
      }
      if (e.key === 'Enter' && editing.id) {
        // Enter saves when editing
        saveEdit();
      }
    }
    function onClick(e) {
      // close when clicking elsewhere
      if (context) {
        closeContext();
      }
    }
    window.addEventListener('keydown', onKey);
    window.addEventListener('click', onClick);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('click', onClick);
    };
  }, [context]);

  return (
    <div className="chat-wrapper-centered bg-system-background" style={{ minHeight: '100vh' }}>
      <div className="chat-card">
        <div className="chat-header-card">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full overflow-hidden bg-system-accent flex items-center justify-center shadow-apple">
              <div className="w-full h-full flex items-center justify-center text-xl font-bold text-white">
                {user.username[0].toUpperCase()}
              </div>
            </div>
            <div>
              <div className="font-bold text-lg text-system-label">{user.username}</div>
              <div className="text-system-secondaryLabel text-sm">Online</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <ThemeToggle />
            <Tooltip.Root>
              <Tooltip.Trigger asChild>
                <button onClick={onLogout} className="bg-transparent border-none cursor-pointer" aria-label="Logout"><ExitIcon className="text-system-accent w-6 h-6" /></button>
              </Tooltip.Trigger>
              <Tooltip.Content side="top" className="px-3 py-2 rounded-apple bg-system-background text-system-label shadow-apple">Logout</Tooltip.Content>
            </Tooltip.Root>
          </div>
        </div>
  <div className="messages-column">
    <ScrollArea.Root className="h-full">
            <ScrollArea.Viewport style={{ minHeight: '100%' }}>
              {grouped.map((g) => (
                <div key={g.label}>
                  <div className="date-sep">{g.label}</div>
                  {g.items.map((msg) => (
                    <AnimatePresence mode="popLayout" key={msg.id}>
                      <motion.div initial={{ opacity: 0, x: msg.username === user.username ? 20 : -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 0 }} transition={{ duration: 0.28 }}>
                        <div onContextMenu={(e) => openContext(e, msg.id)} className={`msg-row ${msg.username === user.username ? 'me' : ''}`} style={{ width: '100%' }}>
                          <div style={{ display: 'flex', justifyContent: msg.username === user.username ? 'flex-end' : 'flex-start', width: '100%' }}>
                            <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: msg.username === user.username ? 'flex-end' : 'flex-start', gap: 6 }}>
                              <div className="msg-row-meta">
                                <div className="msg-meta">{msg.username}</div>
                                <div className="msg-ts">{new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                              </div>
                              <div className={`bubble ${msg.username === user.username ? 'me' : 'peer'}`} style={{ animation: 'fadeInApple 0.42s cubic-bezier(0.3,0,0.2,1)' }}>
                                  {/* Hover icons removed; actions are available via right-click (context menu) */}
                                <div className="bubble-tail">
                                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
                                    <path d="M2 12c4-8 18-8 20 0" stroke="none" fill="currentColor" opacity="0" />
                                  </svg>
                                  {editing.id === msg.id ? (
                                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                      <input
                                        autoFocus
                                        className="bubble-edit-input text-base px-3 py-2 rounded-apple"
                                        value={editing.text}
                                        onChange={e => setEditing(ed => ({ ...ed, text: e.target.value }))}
                                        onKeyDown={(e) => {
                                          if (e.key === 'Enter') saveEdit();
                                          if (e.key === 'Escape') cancelEdit();
                                        }}
                                        onBlur={() => saveEdit()}
                                      />
                                      <div style={{ display: 'flex', gap: 6 }}>
                                        <button className="msg-action-btn" onMouseDown={(e) => { e.preventDefault(); saveEdit(); }}>OK</button>
                                        <button className="msg-action-btn" onMouseDown={(e) => { e.preventDefault(); cancelEdit(); }}>Cancel</button>
                                      </div>
                                    </div>
                                  ) : (
                                    <div>
                                      {msg.replyTo && (() => {
                                        const quoted = messages.find(m => m.id === msg.replyTo);
                                        return quoted ? <div className="reply-quote">↪ {quoted.username}: {quoted.text}</div> : null;
                                      })()}
                                      <div className="text-base">{msg.text} {msg.edited && <span className="text-system-secondaryLabel text-xs">(edited)</span>}</div>
                                    </div>
                                  )}
                                </div>
                              </div>
                              <div className="msg-row-meta">
                                <div className="msg-delivery">{receipts[msg.id] ? receipts[msg.id] : (msg.delivered ? 'Read' : 'Sent')}</div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    </AnimatePresence>
                  ))}
                </div>
              ))}
              <div ref={chatBottom} />
            </ScrollArea.Viewport>
            <ScrollArea.Scrollbar orientation="vertical">
              <ScrollArea.Thumb />
            </ScrollArea.Scrollbar>
          </ScrollArea.Root>
        </div>
        {/* context menu rendered at body-level coordinates */}
        {context && (
          <div className="context-menu" style={{ left: context.x + 4, top: context.y + 4 }} onClick={e => e.stopPropagation()}>
            <button onClick={() => { handleEdit(context.id); /* handleEdit closes context */ }}>Edit</button>
            <button onClick={() => { handleDelete(context.id); closeContext(); }} className="text-red-500">Delete</button>
            <button onClick={() => { setReplyTo(context.id); closeContext(); setTimeout(() => { const el = document.getElementById('chat-input'); el && el.focus(); }, 50); }}>Reply</button>
          </div>
        )}
        {replyTo && (() => {
          const quoted = messages.find(m => m.id === replyTo);
          return quoted ? (
            <div className="reply-preview px-8 py-3 border-t border-white-06 bg-white-03 flex items-center justify-between">
              <div style={{ fontSize: 13 }}><strong>{quoted.username}</strong>: {quoted.text.length > 120 ? quoted.text.slice(0, 120) + '…' : quoted.text}</div>
              <button onClick={() => setReplyTo(null)} className="text-system-secondaryLabel">×</button>
            </div>
          ) : null;
        })()}

        <form className="flex items-center gap-4 px-8 py-6 bg-white-10 backdrop-blur-apple border-t border-white-10" onSubmit={sendMessage}>
          <input id="chat-input" className="px-4 py-3 rounded-apple bg-white-10 text-system-label placeholder-system-secondaryLabel border border-white-10 focus:border-system-accent focus\:ring-2 focus\:ring-system-accent/30 focus:outline-none transition flex-1" value={input} onChange={e => setInput(e.target.value)} placeholder="Type a message..." />
          <button type="submit" className="px-6 py-2 rounded-apple font-semibold text-system-label bg-system-accent shadow-apple transition hover\:bg-system-accent focus:outline-none focus\:ring-2 focus\:ring-system-accent/50">Send</button>
        </form>
      </div>
    </div>
  );
}
