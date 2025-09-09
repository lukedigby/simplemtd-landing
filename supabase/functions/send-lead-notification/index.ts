// Supabase Edge Function to send email notifications for new leads
// Deploy with: supabase functions deploy send-lead-notification

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!
const NOTIFICATION_EMAIL = Deno.env.get('NOTIFICATION_EMAIL') || 'hello@simplemtd.co.uk'

serve(async (req) => {
  try {
    // Get the webhook payload from Supabase
    const { record } = await req.json()
    
    if (!record?.email) {
      return new Response('No email found', { status: 400 })
    }

    // Send notification email using Resend (free tier: 100/day)
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: 'SimpleMTD <onboarding@resend.dev>', // Use your domain after verification
        to: NOTIFICATION_EMAIL,
        subject: '🎉 New SimpleMTD Lead!',
        html: `
          <h2>New lead signed up!</h2>
          <p><strong>Email:</strong> ${record.email}</p>
          <p><strong>Time:</strong> ${new Date(record.created_at).toLocaleString('en-GB')}</p>
          <p><strong>Source:</strong> ${record.source || 'landing_page'}</p>
          <hr>
          <p><a href="https://supabase.com/dashboard/project/YOUR_PROJECT_ID/editor/leads">View in Supabase</a></p>
        `,
      }),
    })

    if (!res.ok) {
      throw new Error(`Resend error: ${await res.text()}`)
    }

    return new Response('Email sent', { status: 200 })
    
  } catch (error) {
    console.error('Error:', error)
    return new Response('Error sending email', { status: 500 })
  }
})