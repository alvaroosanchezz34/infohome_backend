require('dotenv').config();
const express    = require('express');
const cors       = require('cors');
const helmet     = require('helmet');
const mongoose   = require('mongoose');
const rateLimit  = require('express-rate-limit');

const authRoutes     = require('./modules/auth/auth.routes');
const adminRoutes = require('./modules/admin/admin.routes');
const generateRoutes = require('./modules/generate/generate.routes');
const historyRoutes  = require('./modules/history/history.routes');
const stripeRoutes = require('./modules/stripe/stripe.routes');
const whatsappRoutes = require('./modules/whatsapp/whatsapp.routes');

const app  = express();
const PORT = process.env.PORT || 3001;

// ── Security ──────────────────────────────────────────────────────────────────
app.use(helmet());
app.use(cors({
    origin: [
        process.env.FRONTEND_URL,
        'http://localhost:3000',
        'https://infohome.es',
        'https://www.infohome.es'
    ],
    credentials: true
}));

// ── Rate limiting ─────────────────────────────────────────────────────────────
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutos
    max: 100,
    message: { error: 'Demasiadas peticiones, espera un momento.' }
});
app.use('/api/', limiter);

// ── Body parsing ──────────────────────────────────────────────────────────────
app.use('/api/stripe/webhook', express.raw({ type: 'application/json' }));
app.use(express.json({ limit: '10mb' }));

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/api/auth',     authRoutes);
app.use('/api/generate', generateRoutes);
app.use('/api/history',  historyRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/stripe', stripeRoutes);
app.use('/api/whatsapp', whatsappRoutes);

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', version: '1.0.0', service: 'InfoHome API' });
});

// ── Error handler ─────────────────────────────────────────────────────────────
app.use((err, req, res, next) => {
    console.error('❌ Error:', err.message);
    res.status(err.statusCode || 500).json({
        error: err.message || 'Error interno del servidor'
    });
});

// ── MongoDB + Start ───────────────────────────────────────────────────────────
mongoose.connect(process.env.MONGODB_URI)
    .then(() => {
        console.log('✅ MongoDB conectado');
        require('./cron');
        app.listen(PORT, () => console.log(`🚀 InfoHome API en puerto ${PORT}`) );
    })
    .catch(err => {
        console.error('❌ Error MongoDB:', err.message);
        process.exit(1);
    });
