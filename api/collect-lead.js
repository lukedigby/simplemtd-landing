// Direct API endpoint to collect leads with spam protection
import { createClient } from '@supabase/supabase-js';
import sgMail from '@sendgrid/mail';

// Simple in-memory rate limiting (resets on deploy)
const recentSubmissions = new Map();

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
    const { email, _gotcha } = req.body;
    
    // Rate limiting - 3 submissions per IP per hour
    const clientIp = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    const now = Date.now();
    const submissions = recentSubmissions.get(clientIp) || [];
    const recentCount = submissions.filter(time => now - time < 3600000).length;
    
    if (recentCount >= 3) {
      console.log('Rate limit exceeded for IP:', clientIp);
      return res.status(429).json({ error: 'Too many submissions. Please try again later.' });
    }
    
    // Honeypot spam check (if this field is filled, it's a bot)
    if (_gotcha) {
      console.log('Spam detected (honeypot):', email);
      // Return success to fool bots, but don't save
      return res.status(200).json({ success: true, spam: true });
    }
    
    // Basic spam patterns check (skip for manual testing)
    const isTestMode = req.headers['x-test-mode'] === 'true';
    const spamPatterns = [
      /test@test/i,
      /\d{5,}@/,  // 5+ digits before @
      /noreply@/i,
      /no-reply@/i,
      /@(mailinator|guerrillamail|10minutemail|tempmail)/i
    ];
    
    if (!isTestMode && spamPatterns.some(pattern => pattern.test(email))) {
      console.log('Spam pattern detected:', email);
      return res.status(200).json({ success: true, spam: true });
    }
    
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
    
    // Update rate limit tracking
    submissions.push(now);
    recentSubmissions.set(clientIp, submissions);
    
    // Clean up old entries periodically (every 100th request)
    if (Math.random() < 0.01) {
      for (const [ip, times] of recentSubmissions.entries()) {
        const validTimes = times.filter(time => now - time < 3600000);
        if (validTimes.length === 0) {
          recentSubmissions.delete(ip);
        } else {
          recentSubmissions.set(ip, validTimes);
        }
      }
    }
    
    // Send email notification via SendGrid
    if (process.env.SENDGRID_API_KEY && process.env.NOTIFICATION_EMAIL) {
      sgMail.setApiKey(process.env.SENDGRID_API_KEY);
      
      const msg = {
        to: process.env.NOTIFICATION_EMAIL,
        from: process.env.SENDGRID_FROM_EMAIL || 'noreply@simplemtd.co.uk', // Must be verified in SendGrid
        subject: '🎉 New SimpleMTD Lead!',
        text: `New lead signed up!\n\nEmail: ${email}\nTime: ${new Date().toLocaleString('en-GB')}\nSource: landing_page`,
        html: `
          <h2>New lead signed up!</h2>
          <p><strong>Email:</strong> ${email}</p>
          <p><strong>Time:</strong> ${new Date().toLocaleString('en-GB')}</p>
          <p><strong>Source:</strong> landing_page</p>
          <hr>
          <p><a href="https://supabase.com/dashboard">View in Supabase</a></p>
        `,
      };
      
      try {
        await sgMail.send(msg);
        console.log('Notification email sent to:', process.env.NOTIFICATION_EMAIL);
      } catch (emailError) {
        console.error('SendGrid error:', emailError.message);
        // Don't fail the request if email fails
      }
    }
    
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