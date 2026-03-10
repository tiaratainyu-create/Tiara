// api/subscription-status.js
// オーナーのサブスクリプション状態・請求履歴を取得
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const { email } = req.query;
    if (!email) return res.status(400).json({ error: 'emailが必要です' });

    const customers = await stripe.customers.list({ email, limit: 1 });
    if (customers.data.length === 0) return res.status(404).json({ error: '顧客が見つかりません' });

    const customer = customers.data[0];

    // サブスクリプション取得
    const subscriptions = await stripe.subscriptions.list({
      customer: customer.id,
      status: 'all',
      limit: 1,
      expand: ['data.default_payment_method']
    });

    // 請求履歴取得（直近6件）
    const invoices = await stripe.invoices.list({
      customer: customer.id,
      limit: 6,
    });

    const sub = subscriptions.data[0] || null;
    const card = sub?.default_payment_method?.card;

    res.status(200).json({
      customerId: customer.id,
      subscription: sub ? {
        id: sub.id,
        status: sub.status,
        planId: sub.metadata?.planId,
        storeName: sub.metadata?.storeName,
        currentPeriodEnd: new Date(sub.current_period_end * 1000).toLocaleDateString('ja-JP'),
        cancelAtPeriodEnd: sub.cancel_at_period_end,
        coupon: sub.discount?.coupon?.name || null,
      } : null,
      card: card ? {
        brand: card.brand,
        last4: card.last4,
        expMonth: card.exp_month,
        expYear: card.exp_year,
      } : null,
      invoices: invoices.data.map(inv => ({
        id: inv.id,
        month: new Date(inv.created * 1000).toLocaleDateString('ja-JP', { year: 'numeric', month: 'long' }),
        amount: inv.amount_paid,
        amountDue: inv.amount_due,
        discount: inv.discount?.coupon?.name || null,
        status: inv.status,
        paidAt: inv.status_transitions?.paid_at
          ? new Date(inv.status_transitions.paid_at * 1000).toLocaleDateString('ja-JP')
          : null,
        hostedUrl: inv.hosted_invoice_url,
        pdfUrl: inv.invoice_pdf,
      }))
    });
  } catch (err) {
    console.error('subscription-status error:', err);
    res.status(500).json({ error: err.message });
  }
};
