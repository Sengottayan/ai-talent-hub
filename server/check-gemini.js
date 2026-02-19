const { GoogleGenerativeAI } = require("@google/generative-ai");
require('dotenv').config();

async function checkModels() {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const models = [
        "gemini-1.5-flash",
        "gemini-1.5-flash-8b",
        "gemini-1.5-pro",
        "gemini-1.0-pro"
    ];

    console.log("Starting model check with API Key: " + process.env.GEMINI_API_KEY.substring(0, 5) + "...");

    for (const modelName of models) {
        try {
            console.log(`Checking ${modelName}...`);
            const model = genAI.getGenerativeModel({ model: modelName });
            const result = await model.generateContent("test");
            const text = result.response.text();
            console.log(`✅ ${modelName} works!`);
        } catch (error) {
            console.log(`❌ ${modelName} failed: ${error.message}`);
        }
    }
}

checkModels();
