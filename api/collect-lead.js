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
    
    // Send emails via SendGrid
    if (process.env.SENDGRID_API_KEY) {
      sgMail.setApiKey(process.env.SENDGRID_API_KEY);
      
      // 1. Send welcome email with checklist to the user
      const welcomeMsg = {
        to: email,
        from: process.env.SENDGRID_FROM_EMAIL || 'noreply@simplemtd.co.uk',
        subject: '📋 Your MTD Readiness Checklist is here!',
        text: `Thank you for signing up!\n\nYour MTD Readiness Checklist:\n\n✅ Register for MTD by April 2026\n✅ Choose HMRC-approved software\n✅ Keep digital records\n✅ Submit VAT returns quarterly\n✅ Maintain digital links between systems\n\nNext steps:\n1. Check if you're required to use MTD (turnover over £85,000)\n2. Review your current bookkeeping system\n3. Start keeping digital records now\n\nQuestions? Reply to this email.\n\nBest regards,\nThe SimpleMTD Team`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #1e40af;">Thank you for signing up!</h2>
            <p>Here's your MTD Readiness Checklist to help you prepare for Making Tax Digital:</p>
            
            <div style="background-color: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <h3 style="color: #1e40af; margin-top: 0;">📋 Your MTD Readiness Checklist</h3>
              
              <h4>1. Check if you're affected</h4>
              <ul>
                <li>✅ VAT-registered with turnover above £85,000</li>
                <li>✅ Deadline: April 2026 for all VAT-registered businesses</li>
                <li>✅ Income Tax Self Assessment coming in April 2026</li>
              </ul>
              
              <h4>2. Prepare your records</h4>
              <ul>
                <li>✅ Start keeping digital records now</li>
                <li>✅ Save all invoices and receipts digitally</li>
                <li>✅ Use spreadsheets or accounting software</li>
                <li>✅ Maintain digital links between systems</li>
              </ul>
              
              <h4>3. Choose your software</h4>
              <ul>
                <li>✅ Must be HMRC-approved MTD software</li>
                <li>✅ Consider your business needs and budget</li>
                <li>✅ SimpleMTD starts at just £19/month</li>
              </ul>
              
              <h4>4. Test before the deadline</h4>
              <ul>
                <li>✅ Start using MTD software early</li>
                <li>✅ Submit a test return</li>
                <li>✅ Iron out any issues before April 2026</li>
              </ul>
            </div>
            
            <div style="background-color: #fef3c7; padding: 15px; border-radius: 8px; margin: 20px 0;">
              <strong>⚠️ Important:</strong> HMRC can charge penalties of £400+ for non-compliance. 
              Don't wait until the last minute!
            </div>
            
            <h3>What's next?</h3>
            <ol>
              <li>Review this checklist with your accountant</li>
              <li>Start digitising your records today</li>
              <li>Watch for our upcoming SimpleMTD launch</li>
            </ol>
            
            <p style="margin-top: 30px;">
              <strong>Need help?</strong> Just reply to this email and we'll guide you through the process.
            </p>
            
            <hr style="margin: 30px 0; border: none; border-top: 1px solid #e5e7eb;">
            
            <p style="color: #6b7280; font-size: 14px;">
              You're receiving this because you requested the MTD Readiness Checklist.<br>
              SimpleMTD Ltd | HMRC Recognised Software<br>
              <a href="https://simplemtd-landing.vercel.app/privacy" style="color: #3b82f6;">Privacy Policy</a>
            </p>
          </div>
        `,
      };
      
      try {
        await sgMail.send(welcomeMsg);
        console.log('Welcome email sent to:', email);
        
        // Update Supabase to mark checklist as sent
        await supabase
          .from('leads')
          .update({ checklist_sent: true })
          .eq('email', email);
          
      } catch (emailError) {
        console.error('Welcome email error:', emailError.message);
      }
      
      // 2. Send notification to admin
      if (process.env.NOTIFICATION_EMAIL) {
        const notificationMsg = {
          to: process.env.NOTIFICATION_EMAIL,
          from: process.env.SENDGRID_FROM_EMAIL || 'noreply@simplemtd.co.uk',
          subject: '🎉 New SimpleMTD Lead!',
          text: `New lead signed up!\n\nEmail: ${email}\nTime: ${new Date().toLocaleString('en-GB')}\nSource: landing_page\nChecklist sent: Yes`,
          html: `
            <h2>New lead signed up!</h2>
            <p><strong>Email:</strong> ${email}</p>
            <p><strong>Time:</strong> ${new Date().toLocaleString('en-GB')}</p>
            <p><strong>Source:</strong> landing_page</p>
            <p><strong>Checklist sent:</strong> ✅ Yes</p>
            <hr>
            <p><a href="https://supabase.com/dashboard">View in Supabase</a></p>
          `,
        };
        
        try {
          await sgMail.send(notificationMsg);
          console.log('Notification email sent to:', process.env.NOTIFICATION_EMAIL);
        } catch (emailError) {
          console.error('Notification error:', emailError.message);
        }
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