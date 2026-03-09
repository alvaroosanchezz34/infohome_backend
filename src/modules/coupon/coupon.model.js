const mongoose = require('mongoose');

const couponSchema = new mongoose.Schema({
    code:        { type: String, required: true, unique: true, uppercase: true, trim: true },
    description: { type: String, default: '' },

    // Tipo de descuento
    type: {
        type: String,
        enum: ['percent', 'fixed'], // percent = %, fixed = €
        default: 'percent'
    },
    value: { type: Number, required: true }, // 20 = 20% o 20€

    // Límites
    maxUses:   { type: Number, default: null }, // null = ilimitado
    usedCount: { type: Number, default: 0 },

    // Validez
    expiresAt: { type: Date, default: null }, // null = no expira
    isActive:  { type: Boolean, default: true },

    // Registro de usos
    usedBy: [{
        userId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        usedAt:    { type: Date, default: Date.now },
        planApplied: { type: String },
    }],

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    createdAt: { type: Date, default: Date.now }
});

// Validar si el cupón es aplicable
couponSchema.methods.isValid = function () {
    if (!this.isActive) return { valid: false, reason: 'Cupón desactivado' };
    if (this.expiresAt && this.expiresAt < new Date()) return { valid: false, reason: 'Cupón expirado' };
    if (this.maxUses !== null && this.usedCount >= this.maxUses) return { valid: false, reason: 'Cupón agotado' };
    return { valid: true };
};

module.exports = mongoose.model('Coupon', couponSchema);
