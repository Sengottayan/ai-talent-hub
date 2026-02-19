const getOtpEmailTemplate = (otp, name) => {
    return `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Your Login OTP</title>
        <style>
            body {
                font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                background-color: #f4f6f8;
                margin: 0;
                padding: 0;
            }
            .container {
                max-width: 600px;
                margin: 40px auto;
                background-color: #ffffff;
                border-radius: 12px;
                box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);
                overflow: hidden;
            }
            .header {
                background-color: #2563eb;
                color: #ffffff;
                padding: 30px;
                text-align: center;
            }
            .header h1 {
                margin: 0;
                font-size: 24px;
                font-weight: 700;
                letter-spacing: 1px;
            }
            .content {
                padding: 40px 30px;
                text-align: center;
                color: #334155;
            }
            .greeting {
                font-size: 18px;
                margin-bottom: 20px;
                color: #1e293b;
            }
            .message {
                font-size: 16px;
                line-height: 1.6;
                margin-bottom: 30px;
                color: #475569;
            }
            .otp-container {
                background-color: #eff6ff;
                border-radius: 8px;
                padding: 20px;
                margin: 0 auto 30px;
                display: inline-block;
                border: 1px dashed #2563eb;
            }
            .otp-code {
                font-size: 32px;
                font-weight: 800;
                color: #2563eb;
                letter-spacing: 5px;
                font-family: monospace;
            }
            .expiry {
                font-size: 14px;
                color: #64748b;
            }
            .footer {
                background-color: #f8fafc;
                padding: 20px;
                text-align: center;
                font-size: 12px;
                color: #94a3b8;
                border-top: 1px solid #e2e8f0;
            }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>HireAI</h1>
            </div>
            <div class="content">
                <p class="greeting">Hello ${name},</p>
                <p class="message">
                    You requested a secure login to your HireAI account.<br>
                    Please use the One-Time Password (OTP) below to complete your sign-in.
                </p>
                <div class="otp-container">
                    <span class="otp-code">${otp}</span>
                </div>
                <p class="expiry">
                    This OTP is valid for 10 minutes.<br>
                    If you did not request this code, please ignore this email.
                </p>
            </div>
            <div class="footer">
                &copy; ${new Date().getFullYear()} HireAI. All rights reserved.<br>
                Secure AI-Powered Recruitment Platform
            </div>
        </div>
    </body>
    </html>
    `;
};

module.exports = { getOtpEmailTemplate };
