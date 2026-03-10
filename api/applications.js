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
      const { store_id, store_name, applicant_name, age, experience, contact, contact_type, preferred_date, preferred_time } = req.body;
      if (!store_name || !applicant_name || !contact) {
        return res.status(400).json({ error: '必須項目が不足しています' });
      }
      const { data, error } = await supabase
        .from('applications')
        .insert([{ store_id, store_name, applicant_name, age, experience, contact, contact_type, preferred_date, preferred_time }])
        .select().single();
      if (error) throw error;

      if (process.env.RESEND_API_KEY) {
        try {
          const resend = new Resend(process.env.RESEND_API_KEY);
          const { data: store } = await supabase.from('stores').select('owner_email').eq('id', store_id).single();
          if (store?.owner_email) {
            await resend.emails.send({
              from: 'Tiara <onboarding@resend.dev>',
              to: store.owner_email,
              subject: `【Tiara】新しい体入申込が届きました - ${store_name}`,
              html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;"><div style="background:#ff6b00;padding:20px;text-align:center;"><h1 style="color:#fff;margin:0;">新しい体入申込</h1></div><div style="padding:24px;"><table style="width:100%;border-collapse:collapse;"><tr><td style="padding:8px;border-bottom:1px solid #eee;color:#999;">店舗名</td><td style="padding:8px;border-bottom:1px solid #eee;font-weight:bold;">${store_name}</td></tr><tr><td style="padding:8px;border-bottom:1px solid #eee;color:#999;">名前</td><td style="padding:8px;border-bottom:1px solid #eee;">${applicant_name}（${age || '?'}歳）</td></tr><tr><td style="padding:8px;border-bottom:1px solid #eee;color:#999;">連絡先</td><td style="padding:8px;border-bottom:1px solid #eee;">${contact}</td></tr><tr><td style="padding:8px;border-bottom:1px solid #eee;color:#999;">希望日</td><td style="padding:8px;border-bottom:1px solid #eee;">${preferred_date || '未記入'}</td></tr></table><div style="margin-top:20px;text-align:center;"><a href="https://tiara-eight.vercel.app?owner" style="background:#ff6b00;color:#fff;padding:12px 28px;border-radius:6px;text-decoration:none;">マイページで確認する →</a></div></div></div>`
            });
          }
        } catch (e) { console.error('email error:', e); }
      }
      res.status(200).json({ success: true, application: data });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  } else if (req.method === 'GET') {
    try {
      const { store_id, status } = req.query;
      let query = supabase.from('applications').select('*').order('created_at', { ascending: false });
      if (store_id) query = query.eq('store_id', store_id);
      if (status) query = query.eq('status', status);
      const { data, error } = await query;
      if (error) throw error;
      res.status(200).json({ applications: data });
    } catch (err) { res.status(500).json({ error: err.message }); }
  } else if (req.method === 'PATCH') {
    try {
      const { id, status } = req.body;
      const { data, error } = await supabase.from('applications').update({ status, updated_at: new Date().toISOString() }).eq('id', id).select().single();
      if (error) throw error;
      res.status(200).json({ success: true, application: data });
    } catch (err) { res.status(500).json({ error: err.message }); }
  }
};
