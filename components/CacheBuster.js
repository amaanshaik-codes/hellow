// Force refresh of cached components and ensure real-time updates
if (typeof window !== 'undefined') {
  // Clear any cached Supabase connections on page load
  console.log('🔄 [Cache] Clearing stale connections...');
  
  // Force reload if we detect stale cached components
  const cacheVersion = '1.0.1-hybrid-messaging';
  const lastVersion = localStorage.getItem('hellow_cache_version');
  
  if (lastVersion !== cacheVersion) {
    console.log('🆕 [Cache] New version detected, clearing cache...');
    localStorage.setItem('hellow_cache_version', cacheVersion);
    
    // Clear any existing Supabase channels
    if (window.supabase) {
      window.supabase.removeAllChannels();
    }
  }
  
  // Disable service worker to prevent CORS issues
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then(function(registrations) {
      for(let registration of registrations) {
        console.log('🧹 [Cache] Unregistering service worker to fix CORS');
        registration.unregister();
      }
    });
  }
}

export default function CacheBuster() {
  return null;
}
