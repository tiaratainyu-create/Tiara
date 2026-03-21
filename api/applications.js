const { createClient } = require('@supabase/supabase-js');
const { Resend } = require('resend');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const data = req.body;

    // _email_only=true のとき DB 保存をスキップ（クライアント側で直接保存済み）
    if (!data._email_only) {
      if (!data.store_name || !data.applicant_name || !data.email || !data.phone) {
        return res.status(400).json({ error: '必須項目（店舗名・氏名・メール・電話）が不足しています' });
      }
      const { error: dbError } = await supabase.from('applications').insert([{
        store_name:     data.store_name,
        applicant_name: data.applicant_name,
        age:            data.age,
        experience:     data.experience,
        email:          data.email,
        phone:          data.phone,
        contact:        data.contact || null,
        preferred_date: data.preferred_date || null,
        preferred_time: data.preferred_time || null,
        user_id:        data.user_id || null,
        status:         'pending',
      }]);
      if (dbError) {
        console.error('DB insert error:', dbError);
        return res.status(500).json({ error: '申込の保存に失敗しました: ' + dbError.message });
      }
    }

    // オーナーへメール通知
    const toEmail = data.owner_email || process.env.ADMIN_EMAIL;
    if (toEmail) {
      const subject = `【体入申込】${data.store_name} — ${data.applicant_name}さん`;
      const body = [
        `店舗：${data.store_name}`,
        `お名前：${data.applicant_name}（${data.age}）`,
        `経験：${data.experience || '未記入'}`,
        `メール：${data.email}`,
        `電話：${data.phone}`,
        `LINE：${data.contact || '—'}`,
        `希望日：${data.preferred_date || '—'} ${data.preferred_time || ''}`,
      ].join('\n');

      // 方法1: Supabase Edge Function
      let emailSent = false;
      if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY) {
        try {
          const r = await fetch(`${process.env.SUPABASE_URL}/functions/v1/send-email`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_KEY}` },
            body: JSON.stringify({ type: 'apply', data: { ...data, admin_email: process.env.ADMIN_EMAIL || '' } }),
          });
          if (r.ok) emailSent = true;
          else console.warn('Edge Function email failed:', r.status, await r.text());
        } catch (e) { console.warn('Edge Function error:', e.message); }
      }

      // 方法2: Resend（Edge Function が失敗した場合のフォールバック）
      if (!emailSent && resend) {
        try {
          await resend.emails.send({
            from: process.env.EMAIL_FROM || 'Tiara <noreply@tiara-jobs.com>',
            to:   [toEmail],
            subject,
            text: body,
          });
          emailSent = true;
        } catch (e) { console.warn('Resend error:', e.message); }
      }

      if (!emailSent) console.error('全メール送信方法が失敗しました。to:', toEmail);
    }

    return res.status(200).json({ ok: true });

  } catch (e) {
    console.error('Handler error:', e);
    return res.status(500).json({ error: e.message });
  }
};
