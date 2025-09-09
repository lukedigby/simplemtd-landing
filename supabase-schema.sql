-- SimpleMTD Leads Database Schema
-- Run this in Supabase SQL Editor (SQL icon in left sidebar)

-- Create leads table
CREATE TABLE IF NOT EXISTS leads (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  source VARCHAR(50) DEFAULT 'landing_page',
  checklist_sent BOOLEAN DEFAULT false,
  marketing_consent BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
  notes TEXT,
  tags TEXT[]
);

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_leads_email ON leads(email);
CREATE INDEX IF NOT EXISTS idx_leads_created_at ON leads(created_at DESC);

-- Enable Row Level Security
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;

-- Create policies for service role access (webhook can write)
CREATE POLICY "Service role can insert" ON leads
  FOR INSERT 
  TO service_role
  WITH CHECK (true);
  
CREATE POLICY "Service role can select" ON leads
  FOR SELECT 
  TO service_role
  USING (true);

CREATE POLICY "Service role can update" ON leads
  FOR UPDATE
  TO service_role
  USING (true);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = TIMEZONE('utc', NOW());
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Create the trigger
DROP TRIGGER IF EXISTS update_leads_updated_at ON leads;
CREATE TRIGGER update_leads_updated_at 
  BEFORE UPDATE ON leads
  FOR EACH ROW 
  EXECUTE FUNCTION update_updated_at_column();

-- Create a view for basic stats
CREATE OR REPLACE VIEW lead_stats AS
SELECT 
  COUNT(*) as total_leads,
  COUNT(CASE WHEN checklist_sent = true THEN 1 END) as checklists_sent,
  COUNT(CASE WHEN created_at > NOW() - INTERVAL '7 days' THEN 1 END) as leads_this_week,
  COUNT(CASE WHEN created_at > NOW() - INTERVAL '1 day' THEN 1 END) as leads_today
FROM leads;

-- Grant access to the view
GRANT SELECT ON lead_stats TO service_role;

-- Insert a test lead (optional - delete this after testing)
-- INSERT INTO leads (email, source, notes) 
-- VALUES ('test@example.com', 'landing_page', 'Test lead - delete me');