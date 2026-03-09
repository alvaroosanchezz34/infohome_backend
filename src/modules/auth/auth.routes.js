const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { z } = require('zod');
const User = require('./user.model');
const { authMiddleware } = require('../../middleware/auth.middleware');
const { sendEmail } = require('../../services/email.service');

const router = express.Router();

const signToken = (user) => jwt.sign(
    { userId: user._id, plan: user.plan, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
);

// ── POST /api/auth/register ───────────────────────────────────────────────────
router.post('/register', async (req, res, next) => {
    try {
        const schema = z.object({
            email: z.string().email(),
            password: z.string().min(6),
            agencyName: z.string().optional(),
            city: z.string().optional(),
            phone: z.string().optional(),
        });

        const data = schema.parse(req.body);

        const exists = await User.findOne({ email: data.email });
        if (exists) return res.status(409).json({ error: 'Email ya registrado' });

        const passwordHash = await bcrypt.hash(data.password, 10);
        const user = await User.create({
            email: data.email,
            passwordHash,
            agencyName: data.agencyName || '',
            city: data.city || '',
            phone: data.phone || '',
        });

        const token = signToken(user);
        sendEmail(user.email, 'welcome', {
            agencyName: user.agencyName,
            trialDays: 14,
        }).catch(err => console.error('[Email] Bienvenida falló:', err));
        res.status(201).json({
            success: true,
            token,
            user: {
                id: user._id,
                email: user.email,
                agencyName: user.agencyName,
                plan: user.plan,
                trialEndsAt: user.trialEndsAt,
            }
        });
    } catch (err) {
        if (err.name === 'ZodError') return res.status(400).json({ error: err.errors[0].message });
        next(err);
    }
});

// ── POST /api/auth/login ──────────────────────────────────────────────────────
router.post('/login', async (req, res, next) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) return res.status(400).json({ error: 'Email y contraseña requeridos' });

        const user = await User.findOne({ email: email.toLowerCase().trim() });
        if (!user) return res.status(401).json({ error: 'Credenciales incorrectas' });

        const valid = await bcrypt.compare(password, user.passwordHash);
        if (!valid) return res.status(401).json({ error: 'Credenciales incorrectas' });

        const token = signToken(user);
        res.json({
            success: true,
            token,
            user: {
                id: user._id,
                email: user.email,
                agencyName: user.agencyName,
                plan: user.plan,
                trialEndsAt: user.trialEndsAt,
                agencyTone: user.agencyTone,
            }
        });
    } catch (err) { next(err); }
});

// ── GET /api/auth/me ──────────────────────────────────────────────────────────
router.get('/me', authMiddleware, async (req, res, next) => {
    try {
        const user = await User.findById(req.userId).select('-passwordHash');
        if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

        const trialDaysLeft = user.plan === 'free'
            ? Math.max(0, Math.ceil((user.trialEndsAt - Date.now()) / (1000 * 60 * 60 * 24)))
            : null;

        res.json({
            success: true,
            user: {
                id: user._id,
                email: user.email,
                agencyName: user.agencyName,
                city: user.city,
                phone: user.phone,
                plan: user.plan,
                role: user.role,
                isActive: user.isActive,
                trialEndsAt: user.trialEndsAt,
                trialDaysLeft,
                hasAccess: user.hasActiveAccess(),
                agencyTone: user.agencyTone,
                monthlyGenerations: user.monthlyGenerations,
                generationLimit: user.generationLimit(),
            }
        });
    } catch (err) { next(err); }
});

// ── PATCH /api/auth/profile ───────────────────────────────────────────────────
router.patch('/profile', authMiddleware, async (req, res, next) => {
    try {
        const { agencyName, city, phone, agencyTone } = req.body;
        const update = {};
        if (agencyName !== undefined) update.agencyName = agencyName;
        if (city !== undefined) update.city = city;
        if (phone !== undefined) update.phone = phone;
        if (agencyTone !== undefined) update.agencyTone = agencyTone;

        const user = await User.findByIdAndUpdate(req.userId, update, { new: true }).select('-passwordHash');
        res.json({ success: true, user });
    } catch (err) { next(err); }
});

module.exports = router;
