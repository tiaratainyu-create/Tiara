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
 
    const { error: dbError } = await supabase.from('applications').insert([{
      store_id: data.store_id,
      store_name: data.store_name,
      genre: data.genre,
      name: data.name,
      age: data.age,
      experience: data.experience,
      contact: data.contact,
      date: data.date,
      pay: data.pay,
      owner_email: data.owner_email,
    }]);
 
    if (dbError) {
      console.error('DB error:', dbError);
    }
 
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
            store_name: data.store_name,
            genre: data.genre,
            name: data.name,
            age: data.age,
            experience: data.experience,
            contact: data.contact,
            date: data.date,
            pay: data.pay,
            owner_email: data.owner_email,
          },
        }),
      }
    );
 
    if (!emailRes.ok) {
      const errText = await emailRes.text();
      console.error('Email error:', errText);
    }
 
    return res.status(200).json({ ok: true });
 
  } catch (e) {
    console.error('Handler error:', e);
    return res.status(500).json({ error: e.message });
  }
};
 
