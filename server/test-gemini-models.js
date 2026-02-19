const { GoogleGenerativeAI } = require("@google/generative-ai");
require('dotenv').config();

async function listModels() {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    try {
        // Attempt to list models to see what is legitimate
        // Note: The SDK might not expose listModels directly easily on the client instance, 
        // but we can try to inspect or just try a simple generate to see if it works.
        // Actually, the SDK doesn't have listModels on the main class easily in all versions.
        // Let's try to run a simple generation with multiple candidates.

        const models = ["gemini-1.5-flash", "gemini-1.5-pro", "gemini-pro", "gemini-1.0-pro"];

        for (const m of models) {
            console.log(`Testing model: ${m}...`);
            try {
                const model = genAI.getGenerativeModel({ model: m });
                const result = await model.generateContent("Hello");
                const response = await result.response;
                console.log(`✅ Success with ${m}:`, response.text());
                return; // Stop after first success
            } catch (e) {
                console.log(`❌ Failed with ${m}:`, e.message);
            }
        }
    } catch (e) {
        console.error("Global Error:", e);
    }
}

listModels();
