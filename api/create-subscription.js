// api/create-subscription.js
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    // トークン検証
    const token = (req.headers.authorization || '').replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: '認証トークンがありません' });
    const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !user) return res.status(401).json({ error: '認証に失敗しました' });

    const { paymentMethodId, planId, ownerEmail, ownerName, storeName } = req.body;
    if (!paymentMethodId || !planId || !storeName) {
      return res.status(400).json({ error: '必須パラメータが不足しています' });
    }

    const PRICE_MAP = {
      light:    process.env.STRIPE_PRICE_LIGHT,
      standard: process.env.STRIPE_PRICE_STANDARD,
      premium:  process.env.STRIPE_PRICE_PREMIUM,
    };
    const priceId = PRICE_MAP[planId];
    if (!priceId) return res.status(400).json({ error: '無効なプランです' });

    const email = ownerEmail || user.email;

    // Stripeカスタマー作成（または既存取得）
    const customers = await stripe.customers.list({ email, limit: 1 });
    let customer;
    if (customers.data.length > 0) {
      customer = customers.data[0];
      await stripe.paymentMethods.attach(paymentMethodId, { customer: customer.id });
      await stripe.customers.update(customer.id, {
        invoice_settings: { default_payment_method: paymentMethodId },
        metadata: { storeName },
      });
    } else {
      customer = await stripe.customers.create({
        email,
        name: ownerName || storeName,
        payment_method: paymentMethodId,
        invoice_settings: { default_payment_method: paymentMethodId },
        metadata: { storeName },
      });
    }

    // サブスクリプション作成
    const subscription = await stripe.subscriptions.create({
      customer: customer.id,
      items: [{ price: priceId }],
      payment_settings: {
        payment_method_types: ['card'],
        save_default_payment_method: 'on_subscription',
      },
      expand: ['latest_invoice.payment_intent'],
      metadata: { storeName, planId },
    });

    // Supabaseのオーナー情報を更新（プラン・サブスクID・ステータス）
    const { error: dbErr } = await supabase.from('owners').update({
      plan:                    planId,
      status:                  'active',
      stripe_subscription_id:  subscription.id,
      stripe_customer_id:      customer.id,
    }).eq('user_id', user.id);
    if (dbErr) console.error('owners update error:', dbErr.message);

    const paymentIntent = subscription.latest_invoice?.payment_intent;
    res.status(200).json({
      subscriptionId: subscription.id,
      customerId:     customer.id,
      clientSecret:   paymentIntent?.client_secret || null,
      status:         subscription.status,
    });
  } catch (err) {
    console.error('create-subscription error:', err);
    res.status(500).json({ error: err.message });
  }
};
