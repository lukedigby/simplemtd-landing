# Supabase Database Setup for SimpleMTD Leads

## Step 1: Create Supabase Account
1. Go to [supabase.com](https://supabase.com)
2. Sign up for free account
3. Create new project: "SimpleMTD"
4. Choose region closest to UK (London)
5. Save your database password securely

## Step 2: Create Leads Table

Run this SQL in Supabase SQL Editor:

```sql
-- Create leads table
CREATE TABLE leads (
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

-- Create index for faster queries
CREATE INDEX idx_leads_email ON leads(email);
CREATE INDEX idx_leads_created_at ON leads(created_at DESC);

-- Enable Row Level Security
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;

-- Create a policy for serverless function access
CREATE POLICY "Enable insert for service role" ON leads
  FOR INSERT WITH CHECK (true);
  
CREATE POLICY "Enable select for service role" ON leads
  FOR SELECT USING (true);

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = TIMEZONE('utc', NOW());
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_leads_updated_at BEFORE UPDATE ON leads
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

## Step 3: Get Your API Keys

1. Go to Settings → API in Supabase dashboard
2. Copy these values:
   - **Project URL**: `https://YOUR_PROJECT.supabase.co`
   - **Anon/Public Key**: `eyJhbGc...` (safe for client-side)
   - **Service Role Key**: `eyJhbGc...` (keep secret, for server-side)

## Step 4: Add Environment Variables to Vercel

1. Go to your Vercel project dashboard
2. Settings → Environment Variables
3. Add these variables:

```
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_ANON_KEY=your_anon_key_here
SUPABASE_SERVICE_KEY=your_service_role_key_here
```

## Step 5: Install Supabase Client

```bash
cd landing-page
npm init -y
npm install @supabase/supabase-js
```

## Step 6: Update Webhook Function

Uncomment the Supabase code in `/api/webhook-lead.js` and update with your credentials.

## Step 7: Configure Formspree Webhook

1. Log into Formspree
2. Go to your form settings
3. Integrations → Webhooks
4. Add webhook URL: `https://simplemtd.co.uk/api/webhook-lead`
5. Test the webhook

## Step 8: Test the Flow

1. Submit a test email on your landing page
2. Check Formspree dashboard (should show submission)
3. Check Vercel Functions logs (should show webhook received)
4. Check Supabase table (should show new lead)

## Backup Export Script

Create `/api/export-leads.js`:

```javascript
export default async function handler(req, res) {
  // Protect with secret key
  if (req.query.secret !== process.env.EXPORT_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { createClient } = require('@supabase/supabase-js');
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
  );
  
  const { data, error } = await supabase
    .from('leads')
    .select('*')
    .order('created_at', { ascending: false });
    
  if (error) {
    return res.status(500).json({ error });
  }
  
  // Return as CSV
  const csv = [
    'email,source,created_at',
    ...data.map(row => `${row.email},${row.source},${row.created_at}`)
  ].join('\n');
  
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="leads.csv"');
  res.status(200).send(csv);
}
```

Access at: `https://simplemtd.co.uk/api/export-leads?secret=YOUR_SECRET`

## Benefits of This Setup

✅ **You own all data** - it's in your Supabase database
✅ **Real-time sync** - webhooks fire instantly
✅ **Free tier** - 500MB database, 2GB bandwidth
✅ **SQL access** - query your data any way you want
✅ **Export anytime** - CSV, JSON, or direct SQL
✅ **GDPR ready** - full control over data deletion
✅ **Scalable** - can handle millions of leads

## Future Enhancements

- Add lead scoring based on behavior
- Segment leads by source/campaign
- Track email open rates
- Automate checklist delivery
- Sync with CRM (HubSpot, Pipedrive)
- A/B test different lead magnets