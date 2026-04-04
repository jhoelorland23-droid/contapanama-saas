const express  = require('express');
const router   = express.Router();
const Stripe   = require('stripe');
const { query } = require('../db');
const auth     = require('../middleware/auth');
const { getAllPlans, getPlan } = require('../services/billing');

const stripe = process.env.STRIPE_SECRET_KEY
  ? Stripe(process.env.STRIPE_SECRET_KEY)
  : null;

// ─── GET /api/billing/plans ── Planes públicos ────────────────────────────────
router.get('/plans', (req, res) => {
  const plans = getAllPlans();
  res.json({ plans });
});

// ─── GET /api/billing/status ── Estado de suscripción del usuario ──────────────
router.get('/status', auth, async (req, res) => {
  try {
    const { rows } = await query(
      'SELECT plan, subscription_status, plan_expires_at, stripe_subscription_id FROM usuarios WHERE id = $1',
      [req.user.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Usuario no encontrado' });
    const u = rows[0];
    const planInfo = getPlan(u.plan);
    res.json({
      plan: u.plan,
      planName: planInfo.name,
      status: u.subscription_status,
      expiresAt: u.plan_expires_at,
      maxClientes: planInfo.maxClientes,
      features: planInfo.features,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/billing/checkout ── Crear sesión de pago Stripe ────────────────
router.post('/checkout', auth, async (req, res) => {
  if (!stripe) return res.status(503).json({ error: 'Pagos no configurados aún' });
  const { plan } = req.body;
  const planInfo = getPlan(plan);
  if (!planInfo.stripePriceId) return res.status(400).json({ error: 'Plan inválido' });

  try {
    const { rows } = await query('SELECT email, stripe_customer_id FROM usuarios WHERE id = $1', [req.user.id]);
    const user = rows[0];

    let customerId = user.stripe_customer_id;
    if (!customerId) {
      const customer = await stripe.customers.create({ email: user.email });
      customerId = customer.id;
      await query('UPDATE usuarios SET stripe_customer_id = $1 WHERE id = $2', [customerId, req.user.id]);
    }

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ['card'],
      mode: 'subscription',
      line_items: [{ price: planInfo.stripePriceId, quantity: 1 }],
      success_url: `${process.env.FRONTEND_URL}/?checkout=success&plan=${plan}`,
      cancel_url:  `${process.env.FRONTEND_URL}/?checkout=cancelled`,
      metadata: { userId: req.user.id, plan },
    });

    res.json({ url: session.url });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/billing/portal ── Portal de gestión Stripe ────────────────────
router.post('/portal', auth, async (req, res) => {
  if (!stripe) return res.status(503).json({ error: 'Pagos no configurados aún' });
  try {
    const { rows } = await query('SELECT stripe_customer_id FROM usuarios WHERE id = $1', [req.user.id]);
    const customerId = rows[0]?.stripe_customer_id;
    if (!customerId) return res.status(400).json({ error: 'No tienes suscripción activa' });

    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: process.env.FRONTEND_URL,
    });
    res.json({ url: session.url });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/billing/webhook ── Eventos de Stripe ──────────────────────────
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  if (!stripe) return res.status(503).end();
  const sig = req.headers['stripe-signature'];
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  const session = event.data.object;

  if (event.type === 'checkout.session.completed') {
    const { userId, plan } = session.metadata;
    await query(
      `UPDATE usuarios SET
        plan = $1,
        stripe_subscription_id = $2,
        subscription_status = 'active',
        plan_expires_at = NOW() + INTERVAL '1 month'
       WHERE id = $3`,
      [plan, session.subscription, userId]
    );
  }

  if (event.type === 'customer.subscription.deleted') {
    await query(
      `UPDATE usuarios SET plan = 'gratis', subscription_status = 'inactive', plan_expires_at = NULL
       WHERE stripe_subscription_id = $1`,
      [session.id]
    );
  }

  if (event.type === 'invoice.payment_succeeded') {
    await query(
      `UPDATE usuarios SET subscription_status = 'active', plan_expires_at = NOW() + INTERVAL '1 month'
       WHERE stripe_subscription_id = $1`,
      [session.subscription]
    );
  }

  if (event.type === 'invoice.payment_failed') {
    await query(
      `UPDATE usuarios SET subscription_status = 'past_due' WHERE stripe_subscription_id = $1`,
      [session.subscription]
    );
  }

  res.json({ received: true });
});

module.exports = router;
