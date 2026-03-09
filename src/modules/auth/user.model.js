const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    email: {
        type: String, required: true, unique: true,
        lowercase: true, trim: true
    },
    passwordHash: { type: String, required: true },
    agencyName: { type: String, default: '' },
    city: { type: String, default: '' },
    phone: { type: String, default: '' },

    // ── Rol del usuario ───────────────────────────────────────────────────────
    // admin   → acceso total al panel de administración
    // manager → gestiona agentes de su agencia
    // agent   → usuario normal, puede generar anuncios
    // viewer  → solo puede ver, no generar
    role: {
        type: String,
        enum: ['admin', 'manager', 'agent', 'viewer'],
        default: 'agent'
    },

    // Manager al que pertenece este agente/viewer (si aplica)
    managerId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    },

    // ── Plan ──────────────────────────────────────────────────────────────────
    plan: {
        type: String,
        enum: ['free', 'starter', 'pro', 'agency'],
        default: 'free'
    },
    trialEndsAt: {
        type: Date,
        default: () => new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)
    },
    stripeCustomerId: { type: String, default: null },
    stripeSubscriptionId: { type: String, default: null },

    // ── Estado ────────────────────────────────────────────────────────────────
    isActive: { type: Boolean, default: true }, // false = bloqueado por admin

    // ── Uso mensual ───────────────────────────────────────────────────────────
    monthlyGenerations: { type: Number, default: 0 },
    monthlyResetAt: { type: Date, default: () => new Date() },

    // ── Preferencias ─────────────────────────────────────────────────────────
    agencyTone: {
        type: String,
        enum: ['profesional', 'cercano', 'lujo', 'inversor'],
        default: 'profesional'
    },

    createdAt: { type: Date, default: Date.now }
});

// ── Métodos ───────────────────────────────────────────────────────────────────
userSchema.methods.hasActiveAccess = function () {
    if (!this.isActive) return false;
    if (this.role === 'viewer') return false; // viewers no generan
    if (['starter', 'pro', 'agency'].includes(this.plan)) return true;
    if (this.plan === 'free' && this.trialEndsAt > new Date()) return true;
    return false;
};

userSchema.methods.generationLimit = function () {
    if (this.role === 'admin') return Infinity;
    const limits = { free: 10, starter: 30, pro: Infinity, agency: Infinity };
    return limits[this.plan] ?? 10;
};

userSchema.methods.isAdmin = function () {
    return this.role === 'admin';
};

userSchema.methods.isManagerOrAdmin = function () {
    return ['admin', 'manager'].includes(this.role);
};

module.exports = mongoose.model('User', userSchema);
