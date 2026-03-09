const express    = require('express');
const mongoose   = require('mongoose');
const authMiddleware = require('../../middleware/auth.middleware');
const Generation = require('../generate/generation.model');

const router = express.Router();
router.use(authMiddleware);

// ── GET /api/history ──────────────────────────────────────────────────────────
// Lista paginada del historial del usuario
router.get('/', async (req, res, next) => {
    try {
        const page  = Math.max(1, parseInt(req.query.page)  || 1);
        const limit = Math.min(50, parseInt(req.query.limit) || 20);
        const skip  = (page - 1) * limit;

        const [items, total] = await Promise.all([
            Generation.find({ userId: req.userId })
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .select('title input.tipo input.zona input.precio createdAt')
                .lean(),
            Generation.countDocuments({ userId: req.userId })
        ]);

        res.json({
            success: true,
            items,
            pagination: {
                page, limit, total,
                pages: Math.ceil(total / limit)
            }
        });
    } catch (err) { next(err); }
});

// ── GET /api/history/:id ──────────────────────────────────────────────────────
// Detalle completo de una generación
router.get('/:id', async (req, res, next) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) {
            return res.status(400).json({ error: 'ID inválido' });
        }

        const item = await Generation.findOne({
            _id: req.params.id,
            userId: req.userId
        }).lean();

        if (!item) return res.status(404).json({ error: 'Generación no encontrada' });

        res.json({ success: true, item });
    } catch (err) { next(err); }
});

// ── DELETE /api/history/:id ───────────────────────────────────────────────────
router.delete('/:id', async (req, res, next) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) {
            return res.status(400).json({ error: 'ID inválido' });
        }

        await Generation.deleteOne({ _id: req.params.id, userId: req.userId });
        res.json({ success: true });
    } catch (err) { next(err); }
});

module.exports = router;