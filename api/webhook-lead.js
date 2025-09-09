// Vercel Serverless Function to receive Formspree webhooks
// Deploy this to /api/webhook-lead

export default async function handler(req, res) {
  // Only accept POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Get the form data from Formspree webhook
    const { email, _time } = req.body;
    
    // Validate email exists
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    // Store in your database (Supabase example)
    // Uncomment and configure when you set up Supabase
    /*
    const { createClient } = require('@supabase/supabase-js');
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_ANON_KEY
    );
    
    const { data, error } = await supabase
      .from('leads')
      .insert([
        { 
          email: email,
          source: 'landing_page',
          created_at: _time || new Date().toISOString(),
          checklist_sent: false
        }
      ]);
      
    if (error) {
      console.error('Supabase error:', error);
      return res.status(500).json({ error: 'Database error' });
    }
    */

    // For now, just log the lead (you can see these in Vercel Functions logs)
    console.log('New lead received:', {
      email,
      timestamp: _time || new Date().toISOString()
    });

    // Send success response
    res.status(200).json({ 
      success: true, 
      message: 'Lead stored successfully',
      email: email 
    });

  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}