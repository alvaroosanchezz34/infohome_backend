const express = require('express');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { authMiddleware } = require('../../middleware/auth.middleware');
const User = require('../auth/user.model');
const { sendEmail } = require('../../services/email.service');

const router = express.Router();

const PRICE_TO_PLAN = {
    [process.env.STRIPE_PRICE_STARTER]: 'starter',
    [process.env.STRIPE_PRICE_PRO]: 'pro',
    [process.env.STRIPE_PRICE_AGENCY]: 'agency',
};

const PLAN_PRICES = {
    starter: process.env.STRIPE_PRICE_STARTER,
    pro: process.env.STRIPE_PRICE_PRO,
    agency: process.env.STRIPE_PRICE_AGENCY,
};

const PLAN_NAMES = { starter: 'Starter', pro: 'Profesional', agency: 'Agencia' };

// POST /api/stripe/checkout
router.post('/checkout', authMiddleware, async (req, res, next) => {
    try {
        const { plan } = req.body;
        const priceId = PLAN_PRICES[plan];
        if (!priceId) return res.status(400).json({ error: 'Plan no válido' });

        const user = await User.findById(req.userId);
        if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

        let customerId = user.stripeCustomerId;
        if (!customerId) {
            const customer = await stripe.customers.create({
                email: user.email,
                name: user.agencyName || user.email,
                metadata: { userId: user._id.toString() },
            });
            customerId = customer.id;
            await User.findByIdAndUpdate(user._id, { stripeCustomerId: customerId });
        }

        const session = await stripe.checkout.sessions.create({
            customer: customerId,
            mode: 'subscription',
            line_items: [{ price: priceId, quantity: 1 }],
            success_url: `${process.env.FRONTEND_URL}/dashboard/profile?success=1`,
            cancel_url: `${process.env.FRONTEND_URL}/dashboard/profile?cancelled=1`,
            metadata: { userId: user._id.toString(), plan },
            subscription_data: { metadata: { userId: user._id.toString(), plan } },
            allow_promotion_codes: true,
        });

        res.json({ success: true, url: session.url });
    } catch (err) { next(err); }
});

// POST /api/stripe/portal
router.post('/portal', authMiddleware, async (req, res, next) => {
    try {
        const user = await User.findById(req.userId);
        if (!user?.stripeCustomerId) {
            return res.status(400).json({ error: 'No tienes una suscripción activa' });
        }
        const session = await stripe.billingPortal.sessions.create({
            customer: user.stripeCustomerId,
            return_url: `${process.env.FRONTEND_URL}/dashboard/profile`,
        });
        res.json({ success: true, url: session.url });
    } catch (err) { next(err); }
});

// POST /api/stripe/webhook
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
    const sig = req.headers['stripe-signature'];
    let event;
    try {
        event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
    } catch (err) {
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    try {
        switch (event.type) {
            case 'customer.subscription.created':
            case 'customer.subscription.updated': {
                const sub = event.data.object;
                const priceId = sub.items.data[0]?.price?.id;
                const plan = PRICE_TO_PLAN[priceId];
                const userId = sub.metadata?.userId;
                if (!plan || !userId) break;
                const user = await User.findByIdAndUpdate(userId, { plan, stripeSubscriptionId: sub.id, isActive: true }, { new: true });
                if (user && event.type === 'customer.subscription.created') {
                    await sendEmail(user.email, 'planActivated', { agencyName: user.agencyName, plan: PLAN_NAMES[plan] });
                }
                break;
            }
            case 'invoice.payment_succeeded': {
                const invoice = event.data.object;
                if (!invoice.subscription) break;
                const sub = await stripe.subscriptions.retrieve(invoice.subscription);
                const priceId = sub.items.data[0]?.price?.id;
                const plan = PRICE_TO_PLAN[priceId];
                const userId = sub.metadata?.userId;
                if (!plan || !userId) break;
                await User.findByIdAndUpdate(userId, { plan, isActive: true });
                if (invoice.billing_reason === 'subscription_cycle') {
                    await User.findByIdAndUpdate(userId, { monthlyGenerations: 0, monthlyResetAt: new Date() });
                }
                break;
            }
            case 'invoice.payment_failed': {
                const userId = event.data.object.subscription_details?.metadata?.userId;
                if (userId) await User.findByIdAndUpdate(userId, { plan: 'free' });
                break;
            }
            case 'customer.subscription.deleted': {
                const userId = event.data.object.metadata?.userId;
                if (userId) await User.findByIdAndUpdate(userId, { plan: 'free', stripeSubscriptionId: null });
                break;
            }
        }
    } catch (err) {
        console.error('[Stripe Webhook] Error:', err);
    }

    res.json({ received: true });
});

module.exports = router;