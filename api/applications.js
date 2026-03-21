const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const data = req.body;

    // DBへ保存（カラム名はapplicationsテーブルの実際の定義に合わせる）
    const { error: dbError } = await supabase.from('applications').insert([{
      store_name:     data.store_name,
      applicant_name: data.applicant_name,
      age:            data.age,
      experience:     data.experience,
      email:          data.email,
      phone:          data.phone,
      contact:        data.contact,
      preferred_date: data.preferred_date,
      preferred_time: data.preferred_time,
      user_id:        data.user_id || null,
      status:         'pending',
    }]);

    if (dbError) {
      console.error('DB insert error:', dbError);
      // DBエラーでも処理継続（メール送信を試みる）
    }

    // オーナーへメール通知（owner_emailが指定されている場合）
    if (data.owner_email || process.env.ADMIN_EMAIL) {
      try {
        const emailRes = await fetch(
          `${process.env.SUPABASE_URL}/functions/v1/send-email`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
            },
            body: JSON.stringify({
              type: 'apply',
              data: {
                store_name:     data.store_name,
                applicant_name: data.applicant_name,
                age:            data.age,
                experience:     data.experience,
                email:          data.email,
                phone:          data.phone,
                contact:        data.contact,
                preferred_date: data.preferred_date,
                preferred_time: data.preferred_time,
                owner_email:    data.owner_email,
                admin_email:    process.env.ADMIN_EMAIL || '',
              },
            }),
          }
        );
        const emailResult = await emailRes.text();
        console.log('Email result:', emailRes.status, emailResult);
      } catch (emailErr) {
        console.error('Email send error:', emailErr);
      }
    }

    return res.status(200).json({ ok: true });

  } catch (e) {
    console.error('Handler error:', e);
    return res.status(500).json({ error: e.message });
  }
};
