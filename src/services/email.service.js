const { Resend } = require('resend');

let resend = null;
const getResend = () => {
    if (!resend && process.env.RESEND_API_KEY) {
        console.log('[Email] Usando key:', process.env.RESEND_API_KEY.slice(0, 8) + '...');
        resend = new Resend(process.env.RESEND_API_KEY);
    }
    return resend;
};
const FROM = 'InfoHome <hola@infohome.es>';

const wrap = (content) => `
<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f8f5ef;font-family:Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8f5ef;padding:40px 20px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">
        <tr>
          <td style="background:#0f1f35;border-radius:12px 12px 0 0;padding:28px 36px;text-align:center;">
            <span style="font-family:Georgia,serif;font-size:22px;font-weight:600;color:white;">🏠 InfoHome</span>
          </td>
        </tr>
        <tr>
          <td style="background:white;padding:36px;border-left:1px solid #e8e0d0;border-right:1px solid #e8e0d0;">
            ${content}
          </td>
        </tr>
        <tr>
          <td style="background:#f0ebe0;border:1px solid #e8e0d0;border-radius:0 0 12px 12px;padding:20px 36px;text-align:center;">
            <p style="margin:0;font-size:12px;color:#6b6560;">© 2026 InfoHome · <a href="https://infohome.es" style="color:#b8975a;text-decoration:none;">infohome.es</a></p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

const templates = {

    welcome: ({ agencyName, trialDays = 14 }) => ({
        subject: '¡Bienvenido a InfoHome! Tu prueba de 14 días empieza ahora',
        html: wrap(`
      <h1 style="margin:0 0 8px;font-family:Georgia,serif;font-size:26px;color:#0f1f35;">¡Bienvenido${agencyName ? `, ${agencyName}` : ''}! 👋</h1>
      <p style="margin:0 0 24px;font-size:15px;color:#6b6560;line-height:1.6;">Tu prueba gratuita de <strong>${trialDays} días</strong> ya está activa.</p>
      <table cellpadding="0" cellspacing="0" style="background:#f8f5ef;border:1px solid #e8e0d0;border-radius:10px;padding:20px 24px;margin-bottom:28px;width:100%;">
        <tr><td>
          <p style="margin:0 0 8px;font-size:14px;color:#1a1a1a;">✅ Descripciones para Idealista y Fotocasa</p>
          <p style="margin:0 0 8px;font-size:14px;color:#1a1a1a;">✅ Posts listos para Instagram</p>
          <p style="margin:0 0 8px;font-size:14px;color:#1a1a1a;">✅ Títulos A/B para captar más clics</p>
          <p style="margin:0;font-size:14px;color:#1a1a1a;">✅ Versión en inglés para compradores extranjeros</p>
        </td></tr>
      </table>
      <table cellpadding="0" cellspacing="0" style="width:100%;margin-bottom:28px;">
        <tr><td align="center">
          <a href="https://app.infohome.es/dashboard/generate" style="display:inline-block;background:#b8975a;color:#0f1f35;padding:14px 32px;border-radius:8px;font-size:15px;font-weight:600;text-decoration:none;">Generar mi primer anuncio →</a>
        </td></tr>
      </table>
    `)
    }),

    trialExpiringSoon: ({ agencyName, daysLeft = 3 }) => ({
        subject: `⏳ Tu prueba de InfoHome expira en ${daysLeft} días`,
        html: wrap(`
      <h1 style="margin:0 0 8px;font-family:Georgia,serif;font-size:26px;color:#0f1f35;">Tu prueba expira en ${daysLeft} día${daysLeft > 1 ? 's' : ''}</h1>
      <p style="margin:0 0 24px;font-size:15px;color:#6b6560;line-height:1.6;">Hola${agencyName ? ` ${agencyName}` : ''}, activa un plan para seguir generando sin interrupciones.</p>
      <table cellpadding="0" cellspacing="0" style="width:100%;margin-bottom:28px;">
        <tr><td align="center">
          <a href="https://app.infohome.es/dashboard/profile" style="display:inline-block;background:#0f1f35;color:white;padding:14px 32px;border-radius:8px;font-size:15px;font-weight:600;text-decoration:none;">Activar mi plan →</a>
        </td></tr>
      </table>
    `)
    }),

    trialExpired: ({ agencyName }) => ({
        subject: '⚠️ Tu prueba de InfoHome ha expirado',
        html: wrap(`
      <h1 style="margin:0 0 8px;font-family:Georgia,serif;font-size:26px;color:#0f1f35;">Tu prueba ha terminado</h1>
      <p style="margin:0 0 24px;font-size:15px;color:#6b6560;line-height:1.6;">Hola${agencyName ? ` ${agencyName}` : ''}, activa un plan para seguir generando. Todos tus anuncios siguen disponibles.</p>
      <table cellpadding="0" cellspacing="0" style="width:100%;margin-bottom:28px;">
        <tr><td align="center">
          <a href="https://app.infohome.es/dashboard/profile" style="display:inline-block;background:#b8975a;color:#0f1f35;padding:14px 32px;border-radius:8px;font-size:15px;font-weight:600;text-decoration:none;">Ver planes →</a>
        </td></tr>
      </table>
    `)
    }),

    limitReached: ({ agencyName, plan, limit }) => ({
        subject: '⚡ Has alcanzado tu límite de generaciones este mes',
        html: wrap(`
      <h1 style="margin:0 0 8px;font-family:Georgia,serif;font-size:26px;color:#0f1f35;">Límite mensual alcanzado</h1>
      <p style="margin:0 0 24px;font-size:15px;color:#6b6560;line-height:1.6;">Has usado las <strong>${limit} generaciones</strong> de tu plan <strong>${plan}</strong> este mes.</p>
      <table cellpadding="0" cellspacing="0" style="width:100%;margin-bottom:28px;">
        <tr><td align="center">
          <a href="https://app.infohome.es/dashboard/profile" style="display:inline-block;background:#0f1f35;color:white;padding:14px 32px;border-radius:8px;font-size:15px;font-weight:600;text-decoration:none;">Mejorar mi plan →</a>
        </td></tr>
      </table>
    `)
    }),

    planActivated: ({ agencyName, plan }) => ({
        subject: `✅ Plan ${plan} activado — Bienvenido a InfoHome Pro`,
        html: wrap(`
      <h1 style="margin:0 0 8px;font-family:Georgia,serif;font-size:26px;color:#0f1f35;">¡Plan activado! 🎉</h1>
      <p style="margin:0 0 24px;font-size:15px;color:#6b6560;line-height:1.6;">Tu plan <strong>${plan}</strong> está activo${agencyName ? `, ${agencyName}` : ''}.</p>
      <table cellpadding="0" cellspacing="0" style="width:100%;margin-bottom:28px;">
        <tr><td align="center">
          <a href="https://app.infohome.es/dashboard/generate" style="display:inline-block;background:#b8975a;color:#0f1f35;padding:14px 32px;border-radius:8px;font-size:15px;font-weight:600;text-decoration:none;">Ir al dashboard →</a>
        </td></tr>
      </table>
    `)
    }),

};

const sendEmail = async (to, templateName, data = {}) => {
    if (!process.env.RESEND_API_KEY) {
        console.log(`[Email] ${templateName} → ${to} (sin RESEND_API_KEY)`);
        return { success: true, skipped: true };
    }
    const template = templates[templateName];
    if (!template) throw new Error(`Template "${templateName}" no existe`);
    const { subject, html } = template(data);
    try {
        const client = getResend();
        const result = await client.emails.send({ from: FROM, to, subject, html });
        console.log(`[Email] ✅ ${templateName} → ${to}`);
        return { success: true, id: result.id };
    } catch (err) {
        console.error(`[Email] ❌ ${templateName} → ${to}:`, err.message);
        return { success: false, error: err.message };
    }
};

module.exports = { sendEmail };