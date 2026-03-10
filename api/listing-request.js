const { createClient } = require('@supabase/supabase-js');
const { Resend } = require('resend');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method === 'POST') {
    try {
      const body = req.body;
      if (!body.store_name || !body.owner_name || !body.owner_email || !body.phone) {
        return res.status(400).json({ error: '必須項目が不足しています' });
      }
      const { data, error } = await supabase.from('listing_requests').insert([body]).select().single();
      if (error) throw error;

      if (process.env.RESEND_API_KEY && process.env.ADMIN_EMAIL) {
        try {
          const resend = new Resend(process.env.RESEND_API_KEY);
          await resend.emails.send({
            from: 'Tiara <onboarding@resend.dev>',
            to: process.env.ADMIN_EMAIL,
            subject: `【Tiara】新しい掲載申請 - ${body.store_name}`,
            html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;"><div style="background:#1a1a2e;padding:20px;text-align:center;"><h1 style="color:#ff6b00;margin:0;">新しい掲載申請</h1></div><div style="padding:24px;"><table style="width:100%;border-collapse:collapse;"><tr><td style="padding:8px;border-bottom:1px solid #eee;color:#999;">店舗名</td><td style="padding:8px;border-bottom:1px solid #eee;font-weight:bold;">${body.store_name}</td></tr><tr><td style="padding:8px;border-bottom:1px solid #eee;color:#999;">プラン</td><td style="padding:8px;border-bottom:1px solid #eee;color:#ff6b00;font-weight:bold;">${body.plan}</td></tr><tr><td style="padding:8px;border-bottom:1px solid #eee;color:#999;">担当者</td><td style="padding:8px;border-bottom:1px solid #eee;">${body.owner_name}</td></tr><tr><td style="padding:8px;border-bottom:1px solid #eee;color:#999;">メール</td><td style="padding:8px;border-bottom:1px solid #eee;">${body.owner_email}</td></tr><tr><td style="padding:8px;border-bottom:1px solid #eee;color:#999;">電話</td><td style="padding:8px;border-bottom:1px solid #eee;">${body.phone}</td></tr></table><div style="margin-top:20px;text-align:center;"><a href="https://tiara-eight.vercel.app?admin" style="background:#1a1a2e;color:#fff;padding:12px 28px;border-radius:6px;text-decoration:none;">管理画面で確認する →</a></div></div></div>`
          });
        } catch (e) { console.error('email error:', e); }
      }
      res.status(200).json({ success: true, request: data });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  } else if (req.method === 'GET') {
    try {
      const { status } = req.query;
      let query = supabase.from('listing_requests').select('*').order('created_at', { ascending: false });
      if (status) query = query.eq('status', status);
      const { data, error } = await query;
      if (error) throw error;
      res.status(200).json({ requests: data });
    } catch (err) { res.status(500).json({ error: err.message }); }
  } else if (req.method === 'PATCH') {
    try {
      const { id, status } = req.body;
      const { data, error } = await supabase.from('listing_requests').update({ status, reviewed_at: new Date().toISOString() }).eq('id', id).select().single();
      if (error) throw error;
      if (status === 'approved' && data) {
        await supabase.from('stores').insert([{ name: data.store_name, genre: data.genre, address: data.address, min_wage: data.min_wage, max_wage: data.max_wage, opening_time: data.opening_time, closing_time: data.closing_time, pr_text: data.pr_text, plan: data.plan, owner_email: data.owner_email, owner_name: data.owner_name, phone: data.phone, features: data.features, status: 'active' }]);
      }
      res.status(200).json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
  }
};
