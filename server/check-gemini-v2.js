const { GoogleGenerativeAI } = require("@google/generative-ai");
require('dotenv').config();

async function checkModels() {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const models = [
        "gemini-1.5-flash",
        "gemini-1.5-pro",
        "gemini-pro",
        "gemini-1.0-pro",
        "models/gemini-1.5-flash",
        "models/gemini-pro"
    ];

    console.log("Starting model check...");

    for (const modelName of models) {
        try {
            process.stdout.write(`Testing ${modelName}... `);
            const model = genAI.getGenerativeModel({ model: modelName });
            const result = await model.generateContent("test");
            const text = await result.response.text();
            console.log("✅ Success!");
        } catch (error) {
            console.log(`❌ Failed: ${error.message.substring(0, 50)}...`);
        }
    }
}

checkModels();
