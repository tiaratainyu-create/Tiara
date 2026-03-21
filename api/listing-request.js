const { createClient } = require('@supabase/supabase-js');
const { Resend } = require('resend');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

// 掲載申請メール送信
async function sendListingEmail(toEmail, body) {
  const subject = `【掲載申請】${body.store_name}（${body.genre || '—'}）`;

  const text = [
    `■ 新規掲載申請が届きました`,
    ``,
    `店舗名　：${body.store_name}`,
    `ジャンル：${body.genre || '—'}`,
    `住所　　：${body.address || '—'}`,
    `時給　　：¥${body.hourly_min || '—'} 〜 ¥${body.hourly_max || '—'}`,
    `担当者　：${body.owner_name}`,
    `電話　　：${body.phone}`,
    `メール　：${body.owner_email}`,
    `プラン　：${body.plan || '—'}`,
    `金額　　：${body.plan_price || '—'}`,
    ``,
    `管理画面から審査・承認をお願いします。`,
  ].join('\n');

  const html = `
    <div style="font-family:sans-serif;max-width:560px;margin:0 auto;background:#fff;border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;">
      <div style="background:#1a1a2e;padding:20px 24px;">
        <p style="color:#fff;font-size:18px;font-weight:bold;margin:0;">新規掲載申請が届きました 📋</p>
      </div>
      <div style="padding:24px;">
        <table style="width:100%;border-collapse:collapse;font-size:14px;">
          <tr><td style="padding:8px 0;color:#6b7280;width:90px;">店舗名</td><td style="padding:8px 0;font-weight:bold;font-size:16px;">${body.store_name}</td></tr>
          <tr style="background:#f9fafb;"><td style="padding:8px 6px;color:#6b7280;">ジャンル</td><td style="padding:8px 6px;">${body.genre || '—'}</td></tr>
          <tr><td style="padding:8px 0;color:#6b7280;">住所</td><td style="padding:8px 0;">${body.address || '—'}</td></tr>
          <tr style="background:#f9fafb;"><td style="padding:8px 6px;color:#6b7280;">時給</td><td style="padding:8px 6px;font-weight:bold;color:#ff6b00;">¥${body.hourly_min || '—'} 〜 ¥${body.hourly_max || '—'}</td></tr>
          <tr><td style="padding:8px 0;color:#6b7280;">担当者</td><td style="padding:8px 0;">${body.owner_name}</td></tr>
          <tr style="background:#f9fafb;"><td style="padding:8px 6px;color:#6b7280;">電話</td><td style="padding:8px 6px;font-weight:bold;">${body.phone}</td></tr>
          <tr><td style="padding:8px 0;color:#6b7280;">メール</td><td style="padding:8px 0;">${body.owner_email}</td></tr>
          <tr style="background:#f9fafb;"><td style="padding:8px 6px;color:#6b7280;">プラン</td><td style="padding:8px 6px;">${body.plan || '—'} / ${body.plan_price || '—'}</td></tr>
        </table>
      </div>
      <div style="padding:12px 24px;background:#f9fafb;font-size:12px;color:#9ca3af;">Tiara 管理通知</div>
    </div>
  `;

  // ── 方法1: Resend ──────────────────────────────────────────
  if (resend) {
    try {
      const result = await resend.emails.send({
        from:    process.env.EMAIL_FROM || 'Tiara <onboarding@resend.dev>',
        to:      [toEmail],
        subject,
        text,
        html,
      });
      console.log('[email] Resend 送信成功:', result.id, '→', toEmail);
      return true;
    } catch (e) {
      console.error('[email] Resend 失敗:', e.message);
    }
  } else {
    console.warn('[email] RESEND_API_KEY が未設定です');
  }

  // ── 方法2: Supabase Edge Function ─────────────────────────
  if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY) {
    try {
      const r = await fetch(`${process.env.SUPABASE_URL}/functions/v1/send-email`, {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
        },
        body: JSON.stringify({
          type: 'listing',
          data: {
            store_name:    body.store_name,
            genre:         body.genre,
            address:       body.address,
            hourly_min:    body.hourly_min,
            hourly_max:    body.hourly_max,
            manager_name:  body.owner_name,
            phone:         body.phone,
            contact_email: body.owner_email,
            plan:          body.plan,
            plan_price:    body.plan_price,
          },
        }),
      });
      if (r.ok) {
        console.log('[email] Edge Function 送信成功 →', toEmail);
        return true;
      }
      console.error('[email] Edge Function 失敗:', r.status, await r.text());
    } catch (e) {
      console.error('[email] Edge Function エラー:', e.message);
    }
  }

  console.error('[email] 全方法が失敗しました。送信先:', toEmail);
  return false;
}

// ─────────────────────────────────────────────────────────────

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

      // メール通知（管理者宛て）
      const toEmail = process.env.ADMIN_EMAIL || body.owner_email;
      await sendListingEmail(toEmail, body);

      res.status(200).json({ success: true, request: data });
    } catch (err) {
      console.error('[handler] エラー:', err);
      res.status(500).json({ error: err.message });
    }
  }
};
