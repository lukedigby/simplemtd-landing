// Vercel Serverless Function to receive Formspree webhooks
import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  // Only accept POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Get the form data from Formspree webhook
    const { email, _time, _subject } = req.body;
    
    // Validate email exists
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    // Initialize Supabase client (only if environment variables exist)
    if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY) {
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
        // Update existing lead
        const { error } = await supabase
          .from('leads')
          .update({ 
            updated_at: new Date().toISOString(),
            notes: 'Resubmitted form'
          })
          .eq('email', email);
          
        if (error) {
          console.error('Update error:', error);
        }
        
        return res.status(200).json({ 
          success: true, 
          message: 'Lead updated',
          email: email 
        });
      } else {
        // Insert new lead
        const { data, error } = await supabase
          .from('leads')
          .insert([
            { 
              email: email,
              source: 'landing_page',
              checklist_sent: false,
              marketing_consent: true,
              created_at: _time || new Date().toISOString()
            }
          ]);
          
        if (error) {
          console.error('Supabase error:', error);
          // Don't fail the webhook, just log
        }
      }
    }

    // Always log for debugging (visible in Vercel Functions logs)
    console.log('Lead processed:', {
      email,
      timestamp: _time || new Date().toISOString(),
      hasSupabase: !!(process.env.SUPABASE_URL)
    });

    // Always return success to Formspree
    res.status(200).json({ 
      success: true, 
      message: 'Lead received',
      email: email 
    });

  } catch (error) {
    console.error('Webhook error:', error);
    // Return success anyway to prevent Formspree retries
    res.status(200).json({ success: true, error: error.message });
  }
}