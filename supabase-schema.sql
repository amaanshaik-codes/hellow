-- Supabase Database Schema for Hellow Chat
-- Run these commands in your Supabase SQL Editor

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Messages table for real-time messaging
CREATE TABLE messages (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  text TEXT NOT NULL,
  username TEXT NOT NULL,
  room_id TEXT NOT NULL DEFAULT 'ammu-vero-private-room',
  message_type TEXT DEFAULT 'text' CHECK (message_type IN ('text', 'file', 'image', 'video', 'audio')),
  reply_to UUID REFERENCES messages(id),
  edited BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- File shares table for file attachments
CREATE TABLE file_shares (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  username TEXT NOT NULL,
  room_id TEXT NOT NULL DEFAULT 'ammu-vero-private-room',
  file_name TEXT NOT NULL,
  file_size BIGINT NOT NULL,
  file_type TEXT NOT NULL,
  file_url TEXT NOT NULL,
  download_url TEXT,
  thumbnail_url TEXT,
  message_text TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Message reads table for read receipts
CREATE TABLE message_reads (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  username TEXT NOT NULL,
  room_id TEXT NOT NULL,
  message_id UUID REFERENCES messages(id),
  read_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(username, room_id, message_id)
);

-- User presence table (optional, mainly handled by realtime)
CREATE TABLE user_presence (
  username TEXT PRIMARY KEY,
  room_id TEXT NOT NULL,
  status TEXT DEFAULT 'online' CHECK (status IN ('online', 'offline', 'away')),
  last_seen TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE file_shares ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_reads ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_presence ENABLE ROW LEVEL SECURITY;

-- Create JWT validation function
CREATE OR REPLACE FUNCTION get_jwt_username()
RETURNS TEXT AS $$
BEGIN
  RETURN auth.jwt() ->> 'username';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth;

-- RLS Policies for messages
CREATE POLICY "Users can view messages in their room" ON messages
  FOR SELECT USING (
    room_id = 'ammu-vero-private-room' AND
    get_jwt_username() IN ('ammu', 'vero')
  );

CREATE POLICY "Users can insert messages" ON messages
  FOR INSERT WITH CHECK (
    room_id = 'ammu-vero-private-room' AND
    username = get_jwt_username() AND
    get_jwt_username() IN ('ammu', 'vero')
  );

CREATE POLICY "Users can update their own messages" ON messages
  FOR UPDATE USING (
    username = get_jwt_username() AND
    get_jwt_username() IN ('ammu', 'vero')
  );

-- RLS Policies for file shares
CREATE POLICY "Users can view file shares in their room" ON file_shares
  FOR SELECT USING (
    room_id = 'ammu-vero-private-room' AND
    get_jwt_username() IN ('ammu', 'vero')
  );

CREATE POLICY "Users can insert file shares" ON file_shares
  FOR INSERT WITH CHECK (
    room_id = 'ammu-vero-private-room' AND
    username = get_jwt_username() AND
    get_jwt_username() IN ('ammu', 'vero')
  );

-- RLS Policies for message reads
CREATE POLICY "Users can view their own read status" ON message_reads
  FOR SELECT USING (
    username = get_jwt_username() AND
    get_jwt_username() IN ('ammu', 'vero')
  );

CREATE POLICY "Users can insert their own read status" ON message_reads
  FOR INSERT WITH CHECK (
    username = get_jwt_username() AND
    get_jwt_username() IN ('ammu', 'vero')
  );

-- RLS Policies for user presence
CREATE POLICY "Users can view presence in their room" ON user_presence
  FOR SELECT USING (
    room_id = 'ammu-vero-private-room' AND
    get_jwt_username() IN ('ammu', 'vero')
  );

CREATE POLICY "Users can insert their own presence" ON user_presence
  FOR INSERT WITH CHECK (
    username = get_jwt_username() AND
    get_jwt_username() IN ('ammu', 'vero')
  );

CREATE POLICY "Users can update their own presence" ON user_presence
  FOR UPDATE USING (
    username = get_jwt_username() AND
    get_jwt_username() IN ('ammu', 'vero')
  );

-- Indexes for better performance
CREATE INDEX idx_messages_room_created ON messages(room_id, created_at DESC);
CREATE INDEX idx_messages_username ON messages(username);
CREATE INDEX idx_file_shares_room_created ON file_shares(room_id, created_at DESC);
CREATE INDEX idx_message_reads_user_room ON message_reads(username, room_id);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Function to upsert user presence
CREATE OR REPLACE FUNCTION upsert_user_presence(
  p_username TEXT,
  p_room_id TEXT,
  p_status TEXT DEFAULT 'online'
)
RETURNS VOID AS $$
BEGIN
  INSERT INTO user_presence (username, room_id, status, last_seen, updated_at)
  VALUES (p_username, p_room_id, p_status, NOW(), NOW())
  ON CONFLICT (username) 
  DO UPDATE SET
    room_id = EXCLUDED.room_id,
    status = EXCLUDED.status,
    last_seen = EXCLUDED.last_seen,
    updated_at = NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Triggers for updated_at
CREATE TRIGGER update_messages_updated_at
  BEFORE UPDATE ON messages
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_presence_updated_at
  BEFORE UPDATE ON user_presence
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Enable real-time for all tables
ALTER publication supabase_realtime ADD TABLE messages;
ALTER publication supabase_realtime ADD TABLE file_shares;
ALTER publication supabase_realtime ADD TABLE message_reads;
ALTER publication supabase_realtime ADD TABLE user_presence;

-- Insert initial data (optional)
INSERT INTO user_presence (username, room_id, status) VALUES 
  ('ammu', 'ammu-vero-private-room', 'offline'),
  ('vero', 'ammu-vero-private-room', 'offline')
ON CONFLICT (username) DO NOTHING;
