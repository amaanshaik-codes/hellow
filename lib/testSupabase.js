// Quick Supabase connection test
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://dpnuchfjvzivvqdvovsq.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRwbnVjaGZqdnppdnZxZHZvdnNxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzM0MTExMjQsImV4cCI6MjA0ODk4NzEyNH0.FqNowjHOr0DLVGmQRwUrqMB4sGJV_RD5LH0n_ZmBTW8'

export async function testSupabaseConnection() {
  try {
    console.log('🧪 Testing Supabase connection...')
    
    const supabase = createClient(supabaseUrl, supabaseKey)
    
    // Test basic connection
    const { data, error } = await supabase
      .from('messages')
      .select('count')
      .limit(1)
    
    if (error) {
      console.error('❌ Supabase connection failed:', error)
      return { success: false, error }
    }
    
    console.log('✅ Supabase connection successful')
    
    // Test realtime subscription
    const channel = supabase
      .channel('test-channel')
      .on('postgres_changes', 
        { event: '*', schema: 'public', table: 'messages' },
        (payload) => console.log('📨 Realtime test:', payload)
      )
      .subscribe((status) => {
        console.log('🔗 Realtime status:', status)
      })
    
    return { success: true, data, channel }
    
  } catch (err) {
    console.error('❌ Connection test failed:', err)
    return { success: false, error: err.message }
  }
}

// Auto-run test
if (typeof window !== 'undefined') {
  testSupabaseConnection()
}
