const axios = require('axios');

/**
 * Sends an email using EmailJS REST API.
 * Uses credentials from .env
 * @param {string} to - Recipient email
 * @param {string} subject - Email subject
 * @param {string} html - HTML body content
 * @param {object} metadata - Additional interview metadata (duration, interviewType, etc.)
 */
const sendEmail = async (to, subject, html, metadata = {}, templateId = null) => {
    try {
        // Validate inputs
        if (!to || to.trim() === '') {
            console.error('Error: Recipient email address is empty');
            return { success: false, error: 'Recipient email address is required' };
        }

        if (!process.env.EMAILJS_SERVICE_ID || !(templateId || process.env.EMAILJS_TEMPLATE_ID) || !process.env.EMAILJS_PUBLIC_KEY) {
            console.error('Error: EmailJS credentials are not configured');
            return { success: false, error: 'EmailJS credentials missing in environment variables' };
        }

        // Extract candidate name from email or metadata
        const candidateName = metadata.candidateName || to.split('@')[0].replace(/[._-]/g, ' ');
        const jobRole = metadata.jobRole || subject.replace('Interview Invitation: ', '').trim();

        // Extract interview link from HTML
        const linkMatch = html.match(/href="([^"]+)"/);
        const interviewLink = linkMatch ? linkMatch[1] : '';

        // Extract job description from HTML (between "Job Description:" and next tag)
        const descMatch = html.match(/Job Description:\s*([^<]+)/);
        const jobDescription = descMatch ? descMatch[1].trim().substring(0, 100) : '';

        // Use metadata duration if provided, otherwise extract from HTML
        let duration = metadata.duration ? String(metadata.duration) : '';
        if (!duration) {
            const durationMatch = html.match(/Duration:\s*(\d+)\s*minutes/);
            duration = durationMatch ? durationMatch[1] : '';
        }

        // Use metadata interviewType if provided, otherwise extract from HTML
        let interviewType = metadata.interviewType ? String(metadata.interviewType) : '';
        if (!interviewType) {
            const typeMatch = html.match(/Type:\s*([^<]+)/);
            interviewType = typeMatch ? typeMatch[1].trim() : '';
        }

        const finalTemplateId = templateId || process.env.EMAILJS_TEMPLATE_ID;
        const data = {
            service_id: process.env.EMAILJS_SERVICE_ID,
            template_id: finalTemplateId,
            user_id: process.env.EMAILJS_PUBLIC_KEY,
            accessToken: process.env.EMAILJS_PRIVATE_KEY,
            template_params: {
                // Standard EmailJS parameters
                to_name: candidateName,
                to_email: to,
                from_name: 'Talent AI Recruitment',
                reply_to: process.env.REPLY_TO_EMAIL || 'noreply@talentai.com',

                // Custom parameters for your template
                subject: subject,
                message: html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim(),
                html_content: html,
                job_role: jobRole,
                job_description: jobDescription,
                duration: duration,
                interview_type: interviewType,

                // OTP specific (if applicable)
                otp_code: metadata.code || metadata.otp || '',

                // Additional context
                interview_link: interviewLink,
                company_name: 'Talent AI',
                year: new Date().getFullYear().toString()
            }
        };

        console.log(`📧 Attempting to send email to: ${to}`);
        console.log(`📋 Subject: ${subject}`);
        console.log(`📝 Using EmailJS Service: ${process.env.EMAILJS_SERVICE_ID}, Template: ${finalTemplateId}`);

        const response = await axios.post('https://api.emailjs.com/api/v1.0/email/send', data, {
            headers: {
                'Content-Type': 'application/json'
            }
        });

        if (response.status === 200) {
            console.log(`✅ Email sent successfully to ${to} via EmailJS`);
            return { success: true, messageId: 'emailjs-' + Date.now() };
        } else {
            console.error('❌ EmailJS Error:', response.data);
            return { success: false, error: response.data };
        }
    } catch (error) {
        const errorMsg = error.response?.data || error.message;
        console.error(`❌ Error sending email to ${to} via EmailJS:`, errorMsg);

        // Provide more helpful error messages
        if (error.response?.status === 400) {
            console.error('💡 Hint: Check your EmailJS template parameters match what you\'re sending');
            console.error('   Expected template variables: to_name, to_email, subject, html_content, job_role, interview_link');
        } else if (error.response?.status === 403) {
            console.error('💡 Hint: Check your EmailJS API keys and service permissions');
        }

        return { success: false, error: errorMsg };
    }
};

module.exports = { sendEmail };
