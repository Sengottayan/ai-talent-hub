const axios = require('axios');
const dotenv = require('dotenv');
dotenv.config();

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

async function test(modelSlug) {
    try {
        console.log(`Testing model: ${modelSlug}`);
        const response = await axios.post(
            'https://openrouter.ai/api/v1/chat/completions',
            {
                model: modelSlug,
                messages: [{ role: 'user', content: "Hello, tell me a joke." }],
            },
            {
                headers: {
                    'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
                    'Content-Type': 'application/json',
                    'HTTP-Referer': 'https://ai-talent-hub.com',
                },
                timeout: 10000,
            }
        );
        console.log(`✅ ${modelSlug} SUCCESS:`, response.data.choices[0].message.content.substring(0, 50) + "...");
        return true;
    } catch (error) {
        console.error(`❌ ${modelSlug} FAILED:`, error.response?.status, error.response?.data || error.message);
        return false;
    }
}

async function runTests() {
    console.log("Starting OpenRouter Connectivity Tests...");
    await test('google/gemini-flash-1.5-free');
    await test('google/gemini-flash-1.5');
    await test('meta-llama/llama-3-8b-instruct:free');
    await test('openai/gpt-3.5-turbo');
}

runTests();
