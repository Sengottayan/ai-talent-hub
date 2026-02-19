const axios = require('axios');

// EmailJS Credentials
const SERVICE_ID = process.env.EMAILJS_SERVICE_ID;
const TEMPLATE_ID = process.env.EMAILJS_TEMPLATE_ID;
const PUBLIC_KEY = process.env.EMAILJS_PUBLIC_KEY;
const PRIVATE_KEY = process.env.EMAILJS_PRIVATE_KEY;

/**
 * Sends an email using EmailJS REST API.
 * @param {string} to - Recipient email.
 * @param {string} subject - Email subject.
 * @param {string} text - Email body text.
 */
const sendEmail = async (toEmail, subject, content, name = "AI Talent Hub") => {
    try {
        const data = {
            service_id: SERVICE_ID,
            template_id: TEMPLATE_ID,
            user_id: PUBLIC_KEY,
            accessToken: PRIVATE_KEY,
            template_params: {
                email: toEmail,
                subject: subject,
                html_context: content,
                name: name,
            }
        };

        const response = await axios.post('https://api.emailjs.com/api/v1.0/email/send', data, {
            headers: {
                'Content-Type': 'application/json'
            }
        });

        console.log(`Email sent to ${toEmail} via EmailJS:`, response.data);

    } catch (error) {
        console.error(`Error sending email to ${toEmail}:`, error.response ? error.response.data : error.message);
        // Note: EmailJS might fail if the template params don't match or quotas exceeded.
        // We'll throw so the controller knows.
        throw new Error(`Email sending failed: ${error.message}`);
    }
};

module.exports = sendEmail;
