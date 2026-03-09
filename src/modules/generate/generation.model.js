const mongoose = require('mongoose');

const generationSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User', required: true, index: true
    },

    // Input del agente
    input: {
        tipo:         { type: String, required: true },
        precio:       { type: String, default: '' },
        habitaciones: { type: String, default: '' },
        banos:        { type: String, default: '' },
        metros:       { type: String, default: '' },
        zona:         { type: String, default: '' },
        planta:       { type: String, default: '' },
        ascensor:     { type: String, default: 'Sí' },
        extras:       { type: String, default: '' },
    },

    // Outputs generados
    output: {
        idealista:  { type: String, default: '' },
        fotocasa:   { type: String, default: '' },
        instagram:  { type: String, default: '' },
        titulos:    { type: String, default: '' },
        ingles:     { type: String, default: '' },
    },

    // Referencia rápida para el historial
    title: { type: String, default: '' }, // ej: "Piso en Triana, Sevilla"

    createdAt: { type: Date, default: Date.now, index: true }
});

module.exports = mongoose.model('Generation', generationSchema);