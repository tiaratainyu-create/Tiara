// api/webhook.js
// Stripeからのイベントを受け取る（請求完了・失敗・保証判定など）
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function buffer(readable) {
  const chunks = [];
  for await (const chunk of readable) chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  return Buffer.concat(chunks);
}

// 前月の申込件数をSupabaseから取得
async function getPrevMonthApplications(storeName) {
  const now = new Date();
  const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
  const prevMonthEnd   = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59).toISOString();

  const { count, error } = await supabase
    .from('applications')
    .select('*', { count: 'exact', head: true })
    .eq('store_name', storeName)
    .gte('created_at', prevMonthStart)
    .lte('created_at', prevMonthEnd);

  if (error) {
    console.error('getPrevMonthApplications error:', error.message);
    return 1; // エラー時は保証発動しない（安全側）
  }
  return count || 0;
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();

  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  let event;

  try {
    const buf = await buffer(req);
    event = stripe.webhooks.constructEvent(buf, sig, webhookSecret);
  } catch (err) {
    console.error('Webhook signature failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  switch (event.type) {
    // 請求書作成時：応募ゼロ保証チェック
    case 'invoice.created': {
      const invoice = event.data.object;
      const subscriptionId = invoice.subscription;
      if (!subscriptionId) break;

      const subscription = await stripe.subscriptions.retrieve(subscriptionId);
      const storeName = subscription.metadata?.storeName;

      if (storeName) {
        const prevCount = await getPrevMonthApplications(storeName);
        if (prevCount === 0) {
          const now = new Date();
          const targetMonth = `${now.getFullYear()}-${String(now.getMonth()).padStart(2,'0')}`; // 前月
          const couponCode = `TIARA-FREE-${storeName.toUpperCase().replace(/\s/g,'').replace(/[^A-Z0-9]/g,'').slice(0,8)}-${targetMonth.replace('-','')}`;

          try {
            // クーポンが既存なら取得、なければ作成
            let coupon;
            try { coupon = await stripe.coupons.retrieve(couponCode); }
            catch { coupon = await stripe.coupons.create({
              id: couponCode, percent_off: 100, duration: 'once',
              name: `応募ゼロ保証 ${targetMonth}月分無料`,
              metadata: { storeName, targetMonth, reason: 'zero_applications' }
            }); }

            await stripe.subscriptions.update(subscriptionId, { coupon: coupon.id });
            console.log(`✅ 保証適用: ${storeName} → ${couponCode}`);

            // guarantee_historyテーブルに記録
            const { data: ownerData } = await supabase
              .from('owners').select('id').eq('store_name', storeName).single();
            if (ownerData) {
              await supabase.from('guarantee_history').upsert({
                owner_id: ownerData.id,
                target_month: targetMonth,
                app_count: 0,
                is_free: true,
                coupon_code: couponCode,
              }, { onConflict: 'owner_id,target_month' });
            }
          } catch (e) {
            console.error('Coupon apply error:', e.message);
          }
        } else {
          // 申込あり → 通常請求の履歴を記録
          const now = new Date();
          const targetMonth = `${now.getFullYear()}-${String(now.getMonth()).padStart(2,'0')}`;
          const { data: ownerData } = await supabase
            .from('owners').select('id').eq('store_name', storeName).single();
          if (ownerData) {
            await supabase.from('guarantee_history').upsert({
              owner_id: ownerData.id,
              target_month: targetMonth,
              app_count: prevCount,
              is_free: false,
            }, { onConflict: 'owner_id,target_month' });
          }
        }
      }
      break;
    }

    // 支払い成功
    case 'invoice.payment_succeeded': {
      const invoice = event.data.object;
      console.log(`💳 支払い成功: ${invoice.customer_email} ¥${(invoice.amount_paid/100).toLocaleString()}`);
      // owners テーブルのステータスを active に
      if (invoice.customer_email) {
        await supabase.from('owners').update({ status: 'active' }).eq('email', invoice.customer_email);
      }
      break;
    }

    // 支払い失敗
    case 'invoice.payment_failed': {
      const invoice = event.data.object;
      console.log(`❌ 支払い失敗: ${invoice.customer_email}`);
      if (invoice.customer_email) {
        await supabase.from('owners').update({ status: 'suspended' }).eq('email', invoice.customer_email);
      }
      break;
    }

    // サブスクリプション解約
    case 'customer.subscription.deleted': {
      const sub = event.data.object;
      const storeName = sub.metadata?.storeName;
      console.log(`📦 解約: ${storeName}`);
      if (storeName) {
        await supabase.from('owners').update({ status: 'suspended' }).eq('store_name', storeName);
        await supabase.from('stores').update({ status: 'inactive' }).eq('name', storeName);
      }
      break;
    }

    default:
      console.log(`Unhandled event: ${event.type}`);
  }

  res.status(200).json({ received: true });
};
