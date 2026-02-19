require('dotenv').config();
const axios = require('axios');

async function testEmail() {
    const SERVICE_ID = process.env.EMAILJS_SERVICE_ID;
    const TEMPLATE_ID = process.env.EMAILJS_TEMPLATE_ID;
    const PUBLIC_KEY = process.env.EMAILJS_PUBLIC_KEY;
    const PRIVATE_KEY = process.env.EMAILJS_PRIVATE_KEY;

    console.log('Testing EmailJS with credentials:');
    console.log('Service ID:', SERVICE_ID);
    console.log('Template ID:', TEMPLATE_ID);
    console.log('Public Key:', PUBLIC_KEY);

    const toEmail = 'sengosaminathan@gmail.com';
    const name = 'Sengo Saminathan (Debug Info)';
    const subject = 'Test Email with Name and Context';
    const content = 'This is a <strong>formatted</strong> message verifying the code update.';

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

    try {
        const response = await axios.post('https://api.emailjs.com/api/v1.0/email/send', data, {
            headers: { 'Content-Type': 'application/json' }
        });
        console.log('SUCCESS: Email sent successfully!');
        console.log('Response:', response.data);
    } catch (error) {
        console.log('FAILURE: Failed to send email.');
        if (error.response) {
            console.log('Status:', error.response.status);
            console.log('Data:', error.response.data);
        } else {
            console.log('Error:', error.message);
        }
    }
}

testEmail();
