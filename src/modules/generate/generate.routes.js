const express    = require('express');
const { z }      = require('zod');
const OpenAI     = require('openai');
const authMiddleware = require('../../middleware/auth.middleware');
const User       = require('../auth/user.model');
const Generation = require('./generation.model');

const router = express.Router();

let _openai;
const getOpenAI = () => {
    if (!_openai) _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    return _openai;
};

// ── Límite mensual por plan ───────────────────────────────────────────────────
const checkAndIncrementUsage = async (user) => {
    // Resetear contador si es un mes nuevo
    const now = new Date();
    const resetAt = new Date(user.monthlyResetAt);
    if (now.getMonth() !== resetAt.getMonth() || now.getFullYear() !== resetAt.getFullYear()) {
        user.monthlyGenerations = 0;
        user.monthlyResetAt = now;
    }

    const limit = user.generationLimit();
    if (user.monthlyGenerations >= limit) {
        const err = new Error(`Has alcanzado el límite de ${limit} generaciones este mes. Actualiza tu plan para continuar.`);
        err.statusCode = 429;
        throw err;
    }

    user.monthlyGenerations += 1;
    await user.save();
};

// ── Prompt principal ──────────────────────────────────────────────────────────
const buildPrompt = (input, tone) => {
    const toneMap = {
        profesional: 'profesional, claro y directo. Transmite confianza y seriedad.',
        cercano:     'cercano y amigable, como si lo explicara un vecino de confianza.',
        lujo:        'exclusivo y sofisticado, evocando calidad de vida premium.',
        inversor:    'orientado al inversor: destaca rentabilidad, ubicación estratégica y potencial.',
    };
    const toneDesc = toneMap[tone] || toneMap.profesional;

    return `Eres un experto en marketing inmobiliario español con 15 años de experiencia.
El tono de la agencia es: ${toneDesc}

Genera los siguientes textos para este inmueble. Devuelve SOLO un JSON válido con estas claves exactas: idealista, fotocasa, instagram, titulos, ingles. Sin explicaciones adicionales, sin bloques de código markdown.

Inmueble:
- Tipo: ${input.tipo}
- Precio: ${input.precio || 'a consultar'}
- Habitaciones: ${input.habitaciones}
- Baños: ${input.banos}
- Metros: ${input.metros}m²
- Planta: ${input.planta || 'no especificada'}
- Ascensor: ${input.ascensor}
- Zona: ${input.zona}
- Características destacadas: ${input.extras || 'ninguna especificada'}

Instrucciones por campo:
- "idealista": descripción de 800-1100 caracteres, persuasiva, evita frases genéricas como "no te lo pierdas" u "oportunidad única". Usa párrafos cortos. Termina con llamada a la acción.
- "fotocasa": versión condensada de 400-550 caracteres, más directa y con los datos clave.
- "instagram": post con emojis apropiados, datos en formato visual (🏠 metros, 🛏 hab, etc), y 5 hashtags relevantes en español al final. Máximo 220 caracteres sin contar hashtags.
- "titulos": dos opciones de título separadas por salto de línea. Formato "Opción A: ..." y "Opción B: ...". Incluye al final una breve nota de cuál recomiendas y por qué.
- "ingles": traducción del título y descripción de Idealista al inglés, para compradores internacionales.`;
};

// ── POST /api/generate ────────────────────────────────────────────────────────
router.post('/', authMiddleware, async (req, res, next) => {
    try {
        // 1. Validar input
        const schema = z.object({
            tipo:         z.string().min(1),
            precio:       z.string().optional().default(''),
            habitaciones: z.string().optional().default(''),
            banos:        z.string().optional().default(''),
            metros:       z.string().optional().default(''),
            zona:         z.string().min(1),
            planta:       z.string().optional().default(''),
            ascensor:     z.string().optional().default('Sí'),
            extras:       z.string().optional().default(''),
        });

        const input = schema.parse(req.body);

        // 2. Comprobar acceso y límites
        const user = await User.findById(req.userId);
        if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

        if (!user.hasActiveAccess()) {
            return res.status(403).json({
                error: 'Tu prueba gratuita ha expirado. Activa un plan para continuar.',
                code: 'TRIAL_EXPIRED'
            });
        }

        await checkAndIncrementUsage(user);

        // 3. Llamar a OpenAI
        const prompt = buildPrompt(input, user.agencyTone);

        const completion = await getOpenAI().chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.7,
            max_tokens: 2000,
        });

        const raw = completion.choices[0].message.content.trim();

        // 4. Parsear JSON
        let output;
        try {
            // Limpiar posibles bloques ```json ... ```
            const clean = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
            output = JSON.parse(clean);
        } catch {
            console.error('❌ OpenAI no devolvió JSON válido:', raw.substring(0, 200));
            return res.status(500).json({ error: 'Error procesando la respuesta de IA. Inténtalo de nuevo.' });
        }

        // 5. Guardar en historial
        const title = `${input.tipo} en ${input.zona}${input.precio ? ' — ' + input.precio : ''}`;
        const generation = await Generation.create({ userId: user._id, input, output, title });

        // 6. Responder
        res.json({
            success: true,
            generationId: generation._id,
            title,
            output,
            usage: {
                used:  user.monthlyGenerations,
                limit: user.generationLimit(),
            }
        });

    } catch (err) {
        if (err.statusCode === 429) return res.status(429).json({ error: err.message });
        next(err);
    }
});

// ── POST /api/generate/demo ───────────────────────────────────────────────────
// Endpoint público para la demo de la landing (sin auth, límite estricto)
const demoLimiter = require('express-rate-limit')({
    windowMs: 60 * 60 * 1000, // 1 hora
    max: 5,
    message: { error: 'Límite de demo alcanzado. Regístrate para continuar.' }
});

router.post('/demo', demoLimiter, async (req, res, next) => {
    try {
        const schema = z.object({
            tipo:         z.string().min(1),
            precio:       z.string().optional().default(''),
            habitaciones: z.string().optional().default('3'),
            banos:        z.string().optional().default('2'),
            metros:       z.string().optional().default('90'),
            zona:         z.string().optional().default('Centro'),
            planta:       z.string().optional().default('3ª'),
            ascensor:     z.string().optional().default('Sí'),
            extras:       z.string().optional().default(''),
        });

        const input = schema.parse(req.body);
        const prompt = buildPrompt(input, 'profesional');

        const completion = await getOpenAI().chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.7,
            max_tokens: 2000,
        });

        const raw = completion.choices[0].message.content.trim();
        let output;
        try {
            const clean = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
            output = JSON.parse(clean);
        } catch {
            return res.status(500).json({ error: 'Error generando la demo. Inténtalo de nuevo.' });
        }

        res.json({ success: true, output });
    } catch (err) {
        if (err.name === 'ZodError') return res.status(400).json({ error: err.errors[0].message });
        next(err);
    }
});

module.exports = router;