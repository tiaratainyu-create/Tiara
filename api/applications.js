const { createClient } = require('@supabase/supabase-js');
const { Resend } = require('resend');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

// メール送信（Resend → Edge Function の順で試みる）
async function sendEmail(toEmail, data) {
  if (!Array.isArray(toEmail)) toEmail = [toEmail];
  const subject = `【体入申込】${data.store_name} ／ ${data.applicant_name}さん`;

  const text = [
    `■ 体入申込が届きました`,
    ``,
    `店舗名　：${data.store_name}`,
    `お名前　：${data.applicant_name}（${data.age || '—'}）`,
    `経験　　：${data.experience || '未経験'}`,
    `メール　：${data.email}`,
    `電話　　：${data.phone}`,
    `LINE ID　：${data.contact || '—'}`,
    `希望日　：${data.preferred_date || '—'}`,
    `希望時間：${data.preferred_time || '—'}`,
    ``,
    `オーナー管理画面から対応状況をご確認ください。`,
  ].join('\n');

  const html = `
    <div style="font-family:sans-serif;max-width:560px;margin:0 auto;background:#fff;border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;">
      <div style="background:#ff6b00;padding:20px 24px;">
        <p style="color:#fff;font-size:18px;font-weight:bold;margin:0;">体入申込が届きました 🎉</p>
      </div>
      <div style="padding:24px;">
        <table style="width:100%;border-collapse:collapse;font-size:14px;">
          <tr><td style="padding:8px 0;color:#6b7280;width:90px;">店舗名</td><td style="padding:8px 0;font-weight:bold;">${data.store_name}</td></tr>
          <tr style="background:#f9fafb;"><td style="padding:8px 6px;color:#6b7280;">お名前</td><td style="padding:8px 6px;font-weight:bold;">${data.applicant_name}（${data.age || '—'}）</td></tr>
          <tr><td style="padding:8px 0;color:#6b7280;">経験</td><td style="padding:8px 0;">${data.experience || '未経験'}</td></tr>
          <tr style="background:#f9fafb;"><td style="padding:8px 6px;color:#6b7280;">メール</td><td style="padding:8px 6px;">${data.email}</td></tr>
          <tr><td style="padding:8px 0;color:#6b7280;">電話</td><td style="padding:8px 0;font-weight:bold;color:#ff6b00;">${data.phone}</td></tr>
          <tr style="background:#f9fafb;"><td style="padding:8px 6px;color:#6b7280;">LINE ID</td><td style="padding:8px 6px;">${data.contact || '—'}</td></tr>
          <tr><td style="padding:8px 0;color:#6b7280;">希望日</td><td style="padding:8px 0;">${data.preferred_date || '—'} ${data.preferred_time || ''}</td></tr>
        </table>
        <div style="margin-top:20px;padding:14px;background:#fff8f0;border-radius:8px;font-size:13px;color:#555;">
          24時間以内にご連絡ください。応募者がキャンセルしないうちに対応をお願いします。
        </div>
      </div>
      <div style="padding:12px 24px;background:#f9fafb;font-size:12px;color:#9ca3af;">Tiara — 錦糸町エリア夜のお仕事求人プラットフォーム</div>
    </div>
  `;

  // ── 方法1: Resend ──────────────────────────────────────────
  if (resend) {
    try {
      const result = await resend.emails.send({
        from:    process.env.EMAIL_FROM || 'Tiara <onboarding@resend.dev>',
        to:      toEmail,
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
          type: 'apply',
          data: { ...data, admin_email: process.env.ADMIN_EMAIL || '' },
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
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const data = req.body;

    // _email_only=true のとき DB 保存スキップ（クライアント側で直接保存済み）
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
        contact:        data.contact        || null,
        preferred_date: data.preferred_date || null,
        preferred_time: data.preferred_time || null,
        user_id:        data.user_id        || null,
        status:         'pending',
      }]);
      if (dbError) {
        console.error('[db] insert error:', dbError);
        return res.status(500).json({ error: '申込の保存に失敗しました: ' + dbError.message });
      }
    }

    // メール通知
    const recipients = [...new Set([
      process.env.ADMIN_EMAIL,
      data.owner_email,
    ].filter(Boolean))];
    if (recipients.length > 0) {
      await sendEmail(recipients, data);
    } else {
      console.warn('[email] 送信先メールアドレスが未設定です。owner_email と ADMIN_EMAIL を確認してください。');
    }

    return res.status(200).json({ ok: true });

  } catch (e) {
    console.error('[handler] エラー:', e);
    return res.status(500).json({ error: e.message });
  }
};
