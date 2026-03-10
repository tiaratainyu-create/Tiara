// api/apply-guarantee.js
// 応募ゼロ保証：翌月無料クーポンをサブスクリプションに適用する
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { subscriptionId, storeName, targetMonth } = req.body;
    // targetMonth例: "2025-04"

    // 1回限り有効な100%オフクーポンを作成
    const couponCode = `TIARA-FREE-${storeName.toUpperCase().replace(/\s/g,'').slice(0,8)}-${targetMonth.replace('-','')}`;

    let coupon;
    try {
      coupon = await stripe.coupons.retrieve(couponCode);
    } catch {
      coupon = await stripe.coupons.create({
        id: couponCode,
        percent_off: 100,
        duration: 'once',
        name: `応募ゼロ保証 ${targetMonth}月分無料`,
        metadata: { storeName, targetMonth, reason: 'zero_applications' }
      });
    }

    // サブスクリプションにクーポン適用
    const updated = await stripe.subscriptions.update(subscriptionId, {
      coupon: coupon.id,
    });

    res.status(200).json({
      success: true,
      couponId: coupon.id,
      couponCode,
      subscriptionStatus: updated.status,
      message: `${targetMonth}分の月額費用を無料にしました`
    });
  } catch (err) {
    console.error('apply-guarantee error:', err);
    res.status(500).json({ error: err.message });
  }
};
