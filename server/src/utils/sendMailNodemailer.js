const nodemailer = require('nodemailer');

/**
 * Send an email using Nodemailer + Gmail App Password.
 *
 * Required .env variables:
 *   NODEMAILER_EMAIL    – your Gmail address  (e.g. yourname@gmail.com)
 *   NODEMAILER_PASS     – Gmail App Password  (16-char, no spaces)
 *
 * @param {string}  to       – Recipient email address
 * @param {string}  subject  – Email subject line
 * @param {string}  html     – Full HTML body
 * @returns {{ success: boolean, messageId?: string, error?: string }}
 */
const sendMailNodemailer = async (to, subject, html) => {
    try {
        // ── Validate env vars ───────────────────────────────────────────────
        if (!process.env.NODEMAILER_EMAIL || !process.env.NODEMAILER_PASS) {
            console.error('❌ NODEMAILER_EMAIL or NODEMAILER_PASS is not set in .env');
            return {
                success: false,
                error: 'Nodemailer credentials missing. Add NODEMAILER_EMAIL and NODEMAILER_PASS to .env',
            };
        }

        if (!to || to.trim() === '') {
            return { success: false, error: 'Recipient email is required' };
        }

        // ── Create transporter (Gmail + App Password) ───────────────────────
        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: process.env.NODEMAILER_EMAIL,
                pass: process.env.NODEMAILER_PASS,   // App Password, NOT your Gmail password
            },
        });

        // ── Send mail ───────────────────────────────────────────────────────
        const info = await transporter.sendMail({
            from: `"HireAI Recruitment" <${process.env.NODEMAILER_EMAIL}>`,
            to,
            subject,
            html,
        });

        console.log(`✅ Nodemailer email sent to ${to} | MessageID: ${info.messageId}`);
        return { success: true, messageId: info.messageId };

    } catch (error) {
        const errMsg = error.message || String(error);
        console.error(`❌ Nodemailer failed sending to ${to}:`, errMsg);

        // Helpful hints for common errors
        if (errMsg.includes('Invalid login') || errMsg.includes('535')) {
            console.error('💡 Hint: Your Gmail App Password is incorrect.');
            console.error('   • Make sure 2-Step Verification is ON for your Google account.');
            console.error('   • Generate an App Password at: https://myaccount.google.com/apppasswords');
            console.error('   • Use the 16-character password (no spaces) as NODEMAILER_PASS');
        } else if (errMsg.includes('ENOTFOUND') || errMsg.includes('ECONNREFUSED')) {
            console.error('💡 Hint: Network error. Check your internet connection.');
        }

        return { success: false, error: errMsg };
    }
};

module.exports = { sendMailNodemailer };
