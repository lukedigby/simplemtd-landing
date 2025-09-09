// Direct API endpoint to collect leads (no Formspree needed)
import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  // Handle preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }

    // Store in Supabase
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY
    );
    
    // Check if email already exists
    const { data: existingLead } = await supabase
      .from('leads')
      .select('id')
      .eq('email', email)
      .single();
    
    if (existingLead) {
      return res.status(200).json({ 
        success: true, 
        message: 'Already subscribed!',
        existing: true 
      });
    }
    
    // Insert new lead
    const { data, error } = await supabase
      .from('leads')
      .insert([
        { 
          email: email,
          source: 'landing_page',
          checklist_sent: false,
          marketing_consent: true,
          created_at: new Date().toISOString()
        }
      ])
      .select();
      
    if (error) {
      console.error('Supabase error:', error);
      return res.status(500).json({ error: 'Failed to save email' });
    }
    
    // TODO: Send email with checklist (use SendGrid/Resend/etc)
    
    res.status(200).json({ 
      success: true, 
      message: 'Successfully subscribed!',
      data: data[0]
    });

  } catch (error) {
    console.error('API error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}