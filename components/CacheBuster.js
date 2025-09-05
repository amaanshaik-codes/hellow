// Force refresh of cached components and ensure real-time updates
if (typeof window !== 'undefined') {
  // Clear any cached Supabase connections on page load
  console.log('🔄 [Cache] Clearing stale connections...');
  
  // Force reload if we detect stale cached components
  const cacheVersion = '1.0.0-supabase-realtime';
  const lastVersion = localStorage.getItem('hellow_cache_version');
  
  if (lastVersion !== cacheVersion) {
    console.log('🆕 [Cache] New version detected, clearing cache...');
    localStorage.setItem('hellow_cache_version', cacheVersion);
    
    // Clear any existing Supabase channels
    if (window.supabase) {
      window.supabase.removeAllChannels();
    }
  }
  
  // Prevent browser from caching real-time components
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Service worker registration failed, continue without it
      console.log('📡 [Cache] Service worker not available');
    });
  }
}

export default function CacheBuster() {
  return null;
}
