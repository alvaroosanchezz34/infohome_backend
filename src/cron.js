const User = require('./modules/auth/user.model');
const { sendEmail } = require('./services/email.service');

const checkTrials = async () => {
    const now = new Date();
    const in3days = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
    const margin = 12 * 60 * 60 * 1000;

    const expiringSoon = await User.find({
        plan: 'free', isActive: true,
        trialEndsAt: { $gte: new Date(in3days - margin), $lte: new Date(in3days + margin) }
    });
    for (const user of expiringSoon) {
        const daysLeft = Math.ceil((user.trialEndsAt - now) / (1000 * 60 * 60 * 24));
        await sendEmail(user.email, 'trialExpiringSoon', { agencyName: user.agencyName, daysLeft });
    }

    const expiredToday = await User.find({
        plan: 'free', isActive: true,
        trialEndsAt: { $gte: new Date(now - 24 * 60 * 60 * 1000), $lte: now }
    });
    for (const user of expiredToday) {
        await sendEmail(user.email, 'trialExpired', { agencyName: user.agencyName });
    }

    console.log(`[Cron] ${expiringSoon.length} expiring, ${expiredToday.length} expired`);
};

const schedule = (hour, minute, fn) => {
    setInterval(() => {
        const now = new Date();
        if (now.getHours() === hour && now.getMinutes() === minute) {
            fn().catch(err => console.error('[Cron] Error:', err));
        }
    }, 60 * 1000);
};

schedule(9, 0, checkTrials);

module.exports = { checkTrials };