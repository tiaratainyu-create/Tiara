// api/create-subscription.js
// オーナーのサブスクリプションを作成する
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { paymentMethodId, planId, ownerEmail, ownerName, storeName } = req.body;

    // プランIDからStripe Price IDに変換
    const PRICE_MAP = {
      light:    process.env.STRIPE_PRICE_LIGHT,    // ¥19,800/月
      standard: process.env.STRIPE_PRICE_STANDARD, // ¥39,800/月
      premium:  process.env.STRIPE_PRICE_PREMIUM,  // ¥79,800/月
    };
    const priceId = PRICE_MAP[planId];
    if (!priceId) return res.status(400).json({ error: '無効なプランです' });

    // Stripeカスタマー作成（または既存取得）
    const customers = await stripe.customers.list({ email: ownerEmail, limit: 1 });
    let customer;
    if (customers.data.length > 0) {
      customer = customers.data[0];
      // 支払い方法を更新
      await stripe.paymentMethods.attach(paymentMethodId, { customer: customer.id });
      await stripe.customers.update(customer.id, {
        invoice_settings: { default_payment_method: paymentMethodId },
        metadata: { storeName }
      });
    } else {
      customer = await stripe.customers.create({
        email: ownerEmail,
        name: ownerName,
        payment_method: paymentMethodId,
        invoice_settings: { default_payment_method: paymentMethodId },
        metadata: { storeName }
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
      metadata: { storeName, planId }
    });

    const invoice = subscription.latest_invoice;
    const paymentIntent = invoice.payment_intent;

    res.status(200).json({
      subscriptionId: subscription.id,
      customerId: customer.id,
      clientSecret: paymentIntent?.client_secret || null,
      status: subscription.status,
    });
  } catch (err) {
    console.error('create-subscription error:', err);
    res.status(500).json({ error: err.message });
  }
};
