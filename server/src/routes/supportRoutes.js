const express = require('express');
const router = express.Router();

// @desc    Prepare Support Email Payload
// @route   POST /api/support/contact
// @access  Public
router.post('/contact', async (req, res) => {
    const { name, email, issueType, message } = req.body;

    const emailSubject = `[Support Request] ${issueType || 'General Inquiry'} - ${name || 'User'}`;
    const emailBody = `
        <h3>Support Request</h3>
        <p><strong>Name:</strong> ${name || 'N/A'}</p>
        <p><strong>Email:</strong> ${email || 'N/A'}</p>
        <p><strong>Issue Type:</strong> ${issueType || 'General'}</p>
        <br/>
        <p><strong>Message:</strong></p>
        <p>${message}</p>
    `;

    // Return payload instead of sending directly
    res.json({
        success: true,
        message: 'Support request payload prepared.',
        email_payload: {
            to: process.env.IT_SUPPORT_EMAIL || 'itsupport@example.com',
            subject: emailSubject,
            body: emailBody,
            role: "admin"
        }
    });
});

module.exports = router;
