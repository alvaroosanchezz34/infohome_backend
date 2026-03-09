const express = require('express');
const twilio = require('twilio');
const OpenAI = require('openai');
const User = require('../auth/user.model');
const Generation = require('../generate/generation.model');

const router = express.Router();
const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ── Sesiones en memoria (clave: número de whatsapp) ───────────────────────────
// En producción esto debería estar en Redis o MongoDB
const sessions = new Map();

const STEPS = ['tipo', 'zona', 'habitaciones', 'metros', 'precio', 'extras'];

const STEP_QUESTIONS = {
    tipo: '🏠 ¡Hola! Soy InfoHome. Vamos a generar tu anuncio.\n\n¿Qué tipo de inmueble es?\n\nEj: Piso, Chalet, Ático, Local, Estudio',
    zona: '📍 ¿En qué zona o ciudad está el inmueble?\n\nEj: Triana, Sevilla',
    habitaciones: '🛏 ¿Cuántas habitaciones y baños tiene?\n\nEj: 3 habitaciones, 2 baños',
    metros: '📐 ¿Cuántos metros cuadrados?\n\nEj: 95',
    precio: '💰 ¿Cuál es el precio?\n\nEj: 185.000€ o 900€/mes si es alquiler',
    extras: '✨ ¿Alguna característica destacada?\n\nEj: terraza, garaje, cocina reformada, piscina\n\nSi no hay ninguna escribe *ninguna*',
};

const sendMessage = async (to, body) => {
    await client.messages.create({
        from: process.env.TWILIO_WHATSAPP_NUMBER,
        to,
        body,
    });
};

const generateListing = async (data, tone = 'profesional') => {
    const prompt = `Eres un experto en marketing inmobiliario español. 
Genera descripciones profesionales para este inmueble.

Datos:
- Tipo: ${data.tipo}
- Zona: ${data.zona}
- Habitaciones y baños: ${data.habitaciones}
- Metros: ${data.metros}
- Precio: ${data.precio}
- Extras: ${data.extras}
- Tono: ${tone}

Devuelve SOLO un JSON válido con estas claves:
{
  "idealista": "texto para idealista (máx 1500 chars)",
  "fotocasa": "texto para fotocasa (máx 1200 chars)",
  "instagram": "texto para instagram con emojis y hashtags (máx 800 chars)",
  "titulos": "3 títulos alternativos separados por salto de línea",
  "ingles": "english version for idealista (máx 1000 chars)"
}`;

    const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7,
    });

    const text = response.choices[0].message.content;
    const clean = text.replace(/```json|```/g, '').trim();
    return JSON.parse(clean);
};

// ── POST /api/whatsapp/webhook ────────────────────────────────────────────────
router.post('/webhook', express.urlencoded({ extended: false }), async (req, res) => {
    // Responder inmediatamente a Twilio para evitar timeout
    res.status(200).send('OK');

    const from = req.body.From;   // ej: whatsapp:+34600000000
    const body = (req.body.Body || '').trim();

    if (!from || !body) return;

    console.log(`[WhatsApp] ${from}: ${body}`);

    try {
        // ── Comandos globales ──────────────────────────────────────────────────────
        const lower = body.toLowerCase();

        if (['hola', 'hi', 'hello', 'start', 'empezar', 'inicio'].includes(lower)) {
            sessions.delete(from);
            const session = { step: 0, data: {} };
            sessions.set(from, session);
            await sendMessage(from, STEP_QUESTIONS.tipo);
            return;
        }

        if (['cancelar', 'cancel', 'salir', 'stop'].includes(lower)) {
            sessions.delete(from);
            await sendMessage(from, '❌ Anuncio cancelado. Escribe *hola* para empezar de nuevo.');
            return;
        }

        // ── Sin sesión activa ──────────────────────────────────────────────────────
        if (!sessions.has(from)) {
            await sendMessage(from, '👋 ¡Hola! Soy el bot de *InfoHome*.\n\nEscribe *hola* para generar un anuncio inmobiliario con IA.');
            return;
        }

        const session = sessions.get(from);

        // ── Flujo de preguntas ─────────────────────────────────────────────────────
        if (session.step < STEPS.length) {
            const currentStep = STEPS[session.step];
            session.data[currentStep] = body;
            session.step++;

            if (session.step < STEPS.length) {
                // Siguiente pregunta
                const nextStep = STEPS[session.step];
                await sendMessage(from, STEP_QUESTIONS[nextStep]);
            } else {
                // Todas las preguntas respondidas → generar
                await sendMessage(from, '⚡ Generando tu anuncio con IA...\n\nEsto tarda unos segundos ✨');

                // Buscar usuario por teléfono (opcional, para usar su tono)
                const phone = from.replace('whatsapp:+34', '').replace('whatsapp:+', '');
                const user = await User.findOne({ phone }).lean();
                const tone = user?.agencyTone || 'profesional';

                // Generar
                const output = await generateListing(session.data, tone);

                // Guardar en historial si hay usuario
                if (user) {
                    const title = `${session.data.tipo} en ${session.data.zona}`;
                    await Generation.create({
                        userId: user._id,
                        title,
                        input: session.data,
                        output,
                    });
                    await User.findByIdAndUpdate(user._id, { $inc: { monthlyGenerations: 1 } });
                }

                // Enviar resultado — Idealista primero
                const msg = `✅ *Anuncio generado*\n\n` +
                    `━━━━━━━━━━━━━━━\n` +
                    `🏠 *IDEALISTA*\n` +
                    `━━━━━━━━━━━━━━━\n\n` +
                    `${output.idealista}\n\n` +
                    `━━━━━━━━━━━━━━━\n\n` +
                    `¿Quieres más versiones? Responde:\n` +
                    `• *fotocasa* — texto para Fotocasa\n` +
                    `• *instagram* — post para Instagram\n` +
                    `• *titulos* — títulos A/B\n` +
                    `• *ingles* — versión en inglés\n` +
                    `• *nuevo* — generar otro anuncio`;

                await sendMessage(from, msg);

                // Guardar output en sesión para responder peticiones de otros formatos
                session.output = output;
                session.step = 'done';
            }

            sessions.set(from, session);
            return;
        }

        // ── Petición de formato adicional ──────────────────────────────────────────
        if (session.step === 'done' && session.output) {
            const formatMap = {
                fotocasa: '🏡 *FOTOCASA*',
                instagram: '📱 *INSTAGRAM*',
                titulos: '🎯 *TÍTULOS A/B*',
                ingles: '🇬🇧 *ENGLISH VERSION*',
            };

            if (lower === 'nuevo' || lower === 'hola') {
                sessions.delete(from);
                const newSession = { step: 0, data: {} };
                sessions.set(from, newSession);
                await sendMessage(from, STEP_QUESTIONS.tipo);
                return;
            }

            const format = Object.keys(formatMap).find(k => lower.includes(k));
            if (format && session.output[format]) {
                await sendMessage(from, `${formatMap[format]}\n━━━━━━━━━━━━━━━\n\n${session.output[format]}`);
            } else {
                await sendMessage(from,
                    '¿Qué versión quieres?\n\n' +
                    '• *fotocasa*\n• *instagram*\n• *titulos*\n• *ingles*\n• *nuevo* — nuevo anuncio'
                );
            }
            return;
        }

    } catch (err) {
        console.error('[WhatsApp] Error:', err);
        sessions.delete(from);
        await sendMessage(from, '❌ Ha ocurrido un error. Escribe *hola* para intentarlo de nuevo.');
    }
});

// ── GET /api/whatsapp/webhook — verificación de Twilio ────────────────────────
router.get('/webhook', (req, res) => {
    res.status(200).send('OK');
});

module.exports = router;