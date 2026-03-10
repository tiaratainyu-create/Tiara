const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const { keyword, genre, min_wage, max_wage } = req.query;

    let query = supabase
      .from('stores')
      .select('*')
      .eq('status', 'active')
      .order('plan', { ascending: false })
      .order('created_at', { ascending: false });

    if (keyword) {
      query = query.or(`name.ilike.%${keyword}%,pr_text.ilike.%${keyword}%,genre.ilike.%${keyword}%`);
    }
    if (genre) query = query.eq('genre', genre);
    if (min_wage) query = query.gte('min_wage', parseInt(min_wage));
    if (max_wage) query = query.lte('max_wage', parseInt(max_wage));

    const { data, error } = await query;
    if (error) throw error;

    res.status(200).json({ stores: data, total: data.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
