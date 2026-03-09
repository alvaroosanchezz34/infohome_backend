const express  = require('express');
const mongoose = require('mongoose');
const { authMiddleware, requireAdmin, requireManagerOrAdmin } = require('../../middleware/auth.middleware');
const User       = require('../auth/user.model');
const Generation = require('../generate/generation.model');
const Coupon     = require('../coupon/coupon.model');

const router = express.Router();
router.use(authMiddleware);

// ══════════════════════════════════════════════════════════════════════════════
// STATS — solo admin
// ══════════════════════════════════════════════════════════════════════════════

// GET /api/admin/stats
router.get('/stats', requireAdmin, async (req, res, next) => {
    try {
        const now   = new Date();
        const start = new Date(now.getFullYear(), now.getMonth(), 1); // inicio mes actual
        const prev  = new Date(now.getFullYear(), now.getMonth() - 1, 1);

        const [
            totalUsers, activeTrials, paidUsers,
            totalGenerations, generationsThisMonth, generationsLastMonth,
            planCounts, newUsersThisMonth, blockedUsers
        ] = await Promise.all([
            User.countDocuments(),
            User.countDocuments({ plan: 'free', trialEndsAt: { $gt: now }, isActive: true }),
            User.countDocuments({ plan: { $in: ['starter', 'pro', 'agency'] } }),
            Generation.countDocuments(),
            Generation.countDocuments({ createdAt: { $gte: start } }),
            Generation.countDocuments({ createdAt: { $gte: prev, $lt: start } }),
            User.aggregate([{ $group: { _id: '$plan', count: { $sum: 1 } } }]),
            User.countDocuments({ createdAt: { $gte: start } }),
            User.countDocuments({ isActive: false }),
        ]);

        // MRR estimado
        const prices = { starter: 79, pro: 149, agency: 299 };
        const mrr = planCounts.reduce((acc, p) => {
            return acc + (prices[p._id] || 0) * p.count;
        }, 0);

        res.json({
            success: true,
            stats: {
                users: { total: totalUsers, activeTrials, paid: paidUsers, newThisMonth: newUsersThisMonth, blocked: blockedUsers },
                generations: { total: totalGenerations, thisMonth: generationsThisMonth, lastMonth: generationsLastMonth },
                revenue: { mrr, planBreakdown: planCounts },
            }
        });
    } catch (err) { next(err); }
});

// ══════════════════════════════════════════════════════════════════════════════
// USERS — admin ve todos, manager ve los suyos
// ══════════════════════════════════════════════════════════════════════════════

// GET /api/admin/users
router.get('/users', requireManagerOrAdmin, async (req, res, next) => {
    try {
        const page   = Math.max(1, parseInt(req.query.page)  || 1);
        const limit  = Math.min(50, parseInt(req.query.limit) || 20);
        const skip   = (page - 1) * limit;
        const search = req.query.search || '';
        const plan   = req.query.plan || '';
        const role   = req.query.role || '';

        // Managers solo ven sus propios agentes
        const filter = req.user.role === 'manager'
            ? { managerId: req.user._id }
            : {};

        if (search) filter.$or = [
            { email:      { $regex: search, $options: 'i' } },
            { agencyName: { $regex: search, $options: 'i' } },
        ];
        if (plan) filter.plan = plan;
        if (role) filter.role = role;

        const [users, total] = await Promise.all([
            User.find(filter)
                .select('-passwordHash')
                .sort({ createdAt: -1 })
                .skip(skip).limit(limit)
                .lean(),
            User.countDocuments(filter)
        ]);

        res.json({ success: true, users, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
    } catch (err) { next(err); }
});

// GET /api/admin/users/:id
router.get('/users/:id', requireManagerOrAdmin, async (req, res, next) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: 'ID inválido' });
        const user = await User.findById(req.params.id).select('-passwordHash').lean();
        if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

        // Manager solo puede ver sus agentes
        if (req.user.role === 'manager' && user.managerId?.toString() !== req.user._id.toString()) {
            return res.status(403).json({ error: 'Sin permisos' });
        }

        const generationCount = await Generation.countDocuments({ userId: req.params.id });
        res.json({ success: true, user: { ...user, generationCount } });
    } catch (err) { next(err); }
});

// PATCH /api/admin/users/:id — cambiar plan, rol, estado
router.patch('/users/:id', requireAdmin, async (req, res, next) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: 'ID inválido' });

        const allowed = ['plan', 'role', 'isActive', 'agencyName', 'managerId'];
        const update = {};
        for (const key of allowed) {
            if (req.body[key] !== undefined) update[key] = req.body[key];
        }

        // No puede cambiarse a sí mismo de rol
        if (req.params.id === req.user._id.toString() && update.role) {
            return res.status(400).json({ error: 'No puedes cambiar tu propio rol' });
        }

        const user = await User.findByIdAndUpdate(req.params.id, update, { new: true }).select('-passwordHash');
        if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

        res.json({ success: true, user });
    } catch (err) { next(err); }
});

// DELETE /api/admin/users/:id
router.delete('/users/:id', requireAdmin, async (req, res, next) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: 'ID inválido' });
        if (req.params.id === req.user._id.toString()) return res.status(400).json({ error: 'No puedes eliminarte a ti mismo' });
        await User.findByIdAndDelete(req.params.id);
        res.json({ success: true });
    } catch (err) { next(err); }
});

// ══════════════════════════════════════════════════════════════════════════════
// GENERATIONS — admin ve todas
// ══════════════════════════════════════════════════════════════════════════════

// GET /api/admin/generations
router.get('/generations', requireAdmin, async (req, res, next) => {
    try {
        const page  = Math.max(1, parseInt(req.query.page)  || 1);
        const limit = Math.min(50, parseInt(req.query.limit) || 20);
        const skip  = (page - 1) * limit;

        const [items, total] = await Promise.all([
            Generation.find()
                .populate('userId', 'email agencyName plan')
                .sort({ createdAt: -1 })
                .skip(skip).limit(limit)
                .lean(),
            Generation.countDocuments()
        ]);

        res.json({ success: true, items, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
    } catch (err) { next(err); }
});

// ══════════════════════════════════════════════════════════════════════════════
// COUPONS — solo admin
// ══════════════════════════════════════════════════════════════════════════════

// GET /api/admin/coupons
router.get('/coupons', requireAdmin, async (req, res, next) => {
    try {
        const coupons = await Coupon.find().sort({ createdAt: -1 }).lean();
        res.json({ success: true, coupons });
    } catch (err) { next(err); }
});

// POST /api/admin/coupons
router.post('/coupons', requireAdmin, async (req, res, next) => {
    try {
        const { code, description, type, value, maxUses, expiresAt } = req.body;
        if (!code || !type || value === undefined) {
            return res.status(400).json({ error: 'code, type y value son obligatorios' });
        }

        const coupon = await Coupon.create({
            code: code.toUpperCase().trim(),
            description, type, value,
            maxUses:   maxUses   || null,
            expiresAt: expiresAt || null,
            createdBy: req.user._id,
        });

        res.status(201).json({ success: true, coupon });
    } catch (err) {
        if (err.code === 11000) return res.status(409).json({ error: 'Ese código ya existe' });
        next(err);
    }
});

// PATCH /api/admin/coupons/:id
router.patch('/coupons/:id', requireAdmin, async (req, res, next) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: 'ID inválido' });
        const { description, maxUses, expiresAt, isActive } = req.body;
        const update = {};
        if (description !== undefined) update.description = description;
        if (maxUses     !== undefined) update.maxUses     = maxUses;
        if (expiresAt   !== undefined) update.expiresAt   = expiresAt;
        if (isActive    !== undefined) update.isActive    = isActive;

        const coupon = await Coupon.findByIdAndUpdate(req.params.id, update, { new: true });
        if (!coupon) return res.status(404).json({ error: 'Cupón no encontrado' });
        res.json({ success: true, coupon });
    } catch (err) { next(err); }
});

// DELETE /api/admin/coupons/:id
router.delete('/coupons/:id', requireAdmin, async (req, res, next) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: 'ID inválido' });
        await Coupon.findByIdAndDelete(req.params.id);
        res.json({ success: true });
    } catch (err) { next(err); }
});

// POST /api/admin/coupons/validate — validar cupón desde el checkout
router.post('/coupons/validate', authMiddleware, async (req, res, next) => {
    try {
        const { code } = req.body;
        if (!code) return res.status(400).json({ error: 'Código requerido' });

        const coupon = await Coupon.findOne({ code: code.toUpperCase().trim() });
        if (!coupon) return res.status(404).json({ error: 'Cupón no válido' });

        const { valid, reason } = coupon.isValid();
        if (!valid) return res.status(400).json({ error: reason });

        res.json({
            success: true,
            coupon: { code: coupon.code, type: coupon.type, value: coupon.value, description: coupon.description }
        });
    } catch (err) { next(err); }
});

module.exports = router;
