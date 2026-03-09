const jwt  = require('jsonwebtoken');
const User = require('../modules/auth/user.model');

// ── Verifica JWT y carga usuario completo ─────────────────────────────────────
const authMiddleware = async (req, res, next) => {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Token requerido' });
    }
    const token = header.split(' ')[1];
    try {
        const payload = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(payload.userId).select('-passwordHash');
        if (!user) return res.status(401).json({ error: 'Usuario no encontrado' });
        if (!user.isActive) return res.status(403).json({ error: 'Cuenta desactivada. Contacta con soporte.' });
        req.user   = user;
        req.userId = user._id;
        next();
    } catch {
        return res.status(401).json({ error: 'Token inválido o expirado' });
    }
};

// ── Requiere uno o varios roles ───────────────────────────────────────────────
// Uso: requireRole('admin')  o  requireRole('admin', 'manager')
const requireRole = (...roles) => (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'No autenticado' });
    if (!roles.includes(req.user.role)) {
        return res.status(403).json({ error: 'No tienes permisos para esta acción' });
    }
    next();
};

// ── Shortcuts ─────────────────────────────────────────────────────────────────
const requireAdmin          = requireRole('admin');
const requireManagerOrAdmin = requireRole('admin', 'manager');
const requireAgent          = requireRole('admin', 'manager', 'agent'); // viewers excluidos

module.exports = { authMiddleware, requireRole, requireAdmin, requireManagerOrAdmin, requireAgent };
