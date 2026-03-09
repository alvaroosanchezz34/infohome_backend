const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    email: {
        type: String, required: true, unique: true,
        lowercase: true, trim: true
    },
    passwordHash:  { type: String, required: true },
    agencyName:    { type: String, default: '' },
    city:          { type: String, default: '' },
    phone:         { type: String, default: '' },

    // Plan: free (trial), starter, pro, agency
    plan: {
        type: String,
        enum: ['free', 'starter', 'pro', 'agency'],
        default: 'free'
    },
    trialEndsAt:   { type: Date, default: () => new Date(Date.now() + 14 * 24 * 60 * 60 * 1000) },
    stripeCustomerId:     { type: String, default: null },
    stripeSubscriptionId: { type: String, default: null },

    // Uso mensual (para plan starter con límite)
    monthlyGenerations: { type: Number, default: 0 },
    monthlyResetAt:     { type: Date,   default: () => new Date() },

    // Preferencias de tono de la agencia
    agencyTone: {
        type: String,
        enum: ['profesional', 'cercano', 'lujo', 'inversor'],
        default: 'profesional'
    },

    createdAt: { type: Date, default: Date.now }
});

// Comprueba si el usuario tiene acceso activo
userSchema.methods.hasActiveAccess = function () {
    if (['starter', 'pro', 'agency'].includes(this.plan)) return true;
    if (this.plan === 'free' && this.trialEndsAt > new Date()) return true;
    return false;
};

// Límite de generaciones según plan
userSchema.methods.generationLimit = function () {
    const limits = { free: 10, starter: 30, pro: Infinity, agency: Infinity };
    return limits[this.plan] ?? 10;
};

module.exports = mongoose.model('User', userSchema);