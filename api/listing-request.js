const { createClient } = require('@supabase/supabase-js');

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

      // send-email Edge Function経由でメール送信
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
              type: 'listing',
              data: {
                store_name: body.store_name,
                genre: body.genre,
                address: body.address,
                hourly_min: body.hourly_min,
                hourly_max: body.hourly_max,
                manager_name: body.owner_name,
                phone: body.phone,
                contact_email: body.owner_email,
                plan: body.plan,
                plan_price: body.plan_price,
              },
            }),
          }
        );
        if (!emailRes.ok) {
          const errText = await emailRes.text();
          console.error('Email error:', errText);
        }
      } catch (e) {
        console.error('email error:', e);
      }

      res.status(200).json({ success: true, request: data });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
};
