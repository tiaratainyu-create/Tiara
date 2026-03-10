// api/webhook.js
// Stripeからのイベントを受け取る（請求完了・失敗・保証判定など）
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

export const config = { api: { bodyParser: false } };

async function buffer(readable) {
  const chunks = [];
  for await (const chunk of readable) chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  return Buffer.concat(chunks);
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
      const customerId = invoice.customer;
      const subscriptionId = invoice.subscription;

      // サブスクリプションのメタデータから店舗情報取得
      const subscription = await stripe.subscriptions.retrieve(subscriptionId);
      const storeName = subscription.metadata?.storeName;

      if (storeName) {
        // 前月の申込件数をチェック（本番ではDBと連携）
        const prevMonthApplications = await getPrevMonthApplications(storeName);
        if (prevMonthApplications === 0) {
          // 保証条件クリア → クーポン自動適用
          const now = new Date();
          const targetMonth = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
          const couponCode = `TIARA-FREE-${storeName.toUpperCase().replace(/\s/g,'').slice(0,8)}-${targetMonth.replace('-','')}`;
          try {
            await stripe.coupons.create({
              id: couponCode,
              percent_off: 100,
              duration: 'once',
              name: `応募ゼロ保証 ${targetMonth}月分無料`,
              metadata: { storeName, targetMonth, reason: 'zero_applications' }
            });
            await stripe.subscriptions.update(subscriptionId, { coupon: couponCode });
            console.log(`✅ 保証適用: ${storeName} → ${couponCode}`);
          } catch (e) {
            console.error('Coupon apply error:', e.message);
          }
        }
      }
      break;
    }

    // 支払い成功
    case 'invoice.payment_succeeded': {
      const invoice = event.data.object;
      console.log(`💳 支払い成功: ${invoice.customer_email} ¥${invoice.amount_paid/100}`);
      // TODO: DB更新・オーナーへの領収書メール送信
      break;
    }

    // 支払い失敗
    case 'invoice.payment_failed': {
      const invoice = event.data.object;
      console.log(`❌ 支払い失敗: ${invoice.customer_email}`);
      // TODO: オーナーへの催促メール送信
      break;
    }

    // サブスクリプション解約
    case 'customer.subscription.deleted': {
      const sub = event.data.object;
      console.log(`📦 解約: ${sub.metadata?.storeName}`);
      // TODO: 掲載停止処理
      break;
    }

    default:
      console.log(`Unhandled event: ${event.type}`);
  }

  res.status(200).json({ received: true });
};

// ダミー関数（本番ではSupabase/DBと連携）
async function getPrevMonthApplications(storeName) {
  // TODO: DBから前月の申込件数を取得
  // return await db.query('SELECT COUNT(*) FROM applications WHERE store_name = ? AND month = ?', [storeName, prevMonth]);
  return 0; // デモ用
}
