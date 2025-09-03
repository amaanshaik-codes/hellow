
'use client';
import { useState, useEffect } from 'react';
import Login from '../components/Login';
import Chat from '../components/Chat';

export default function Home() {
  const [user, setUser] = useState(null);

  // auto-login if token and username present
  useEffect(() => {
    try {
      const token = localStorage.getItem('hellow_token');
      const username = localStorage.getItem('hellow_user');
      if (token && username) setUser({ username, token });
    } catch (e) {}
  }, []);

  return user ? (
    <Chat user={user} onLogout={() => { localStorage.removeItem('hellow_token'); localStorage.removeItem('hellow_user'); setUser(null); }} />
  ) : (
    <Login onLogin={setUser} />
  );
}
