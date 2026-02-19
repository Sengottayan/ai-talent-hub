const { GoogleGenerativeAI } = require('@google/generative-ai');
const dotenv = require('dotenv');
dotenv.config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

async function test() {
    try {
        console.log("Testing with key:", process.env.GEMINI_API_KEY ? "Present (Starts with " + process.env.GEMINI_API_KEY.substring(0, 5) + ")" : "MISSING");
        const model = genAI.getGenerativeModel({ model: 'gemini-pro' });
        const result = await model.generateContent("Hello, are you working?");
        const response = await result.response;
        console.log("Response:", response.text());
    } catch (error) {
        console.error("Test Failed:");
        console.error("Status:", error.status);
        console.error("StatusText:", error.statusText);
        console.error("Message:", error.message);
        if (error.response) {
            console.error("Response Data:", error.response.data);
        }
    }
}

test();
