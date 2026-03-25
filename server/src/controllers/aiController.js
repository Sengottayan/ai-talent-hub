const axios = require('axios');

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const GROQ_API_KEY = process.env.GROQ_API_KEY;

/**
 * Generate job description using AI (OpenRouter with Groq fallback)
 * @route POST /api/ai/generate-description
 */
const generateJobDescription = async (req, res) => {
    console.log("🚀 Starting AI job description generation...");
    try {
        const { prompt } = req.body;

        if (!prompt) {
            console.warn("⚠️ AI Generation: No prompt provided");
            return res.status(400).json({ message: 'Prompt is required' });
        }

        // Try OpenRouter first (verified to work with gpt-3.5-turbo)
        if (OPENROUTER_API_KEY) {
            try {
                console.log(`📡 Sending request to OpenRouter (Model: openai/gpt-3.5-turbo)...`);
                const response = await axios.post(
                    'https://openrouter.ai/api/v1/chat/completions',
                    {
                        model: 'openai/gpt-3.5-turbo',
                        messages: [{ role: 'user', content: prompt }],
                    },
                    {
                        headers: {
                            'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
                            'Content-Type': 'application/json',
                            'HTTP-Referer': 'https://ai-talent-hub.com',
                        },
                        timeout: 20000,
                    }
                );

                if (response.data?.choices?.[0]?.message?.content) {
                    const text = response.data.choices[0].message.content;
                    console.log("✅ AI Generation successful via OpenRouter");
                    return res.status(200).json({ success: true, description: text });
                }
            } catch (orError) {
                console.error("⚠️ OpenRouter primary failed, trying fallback...", orError.message);
            }
        }

        // Try Groq as fallback (v. fast and reliable)
        if (GROQ_API_KEY) {
            try {
                console.log(`📡 Sending request to Groq (Model: llama3-8b-8192)...`);
                const response = await axios.post(
                    'https://api.groq.com/openai/v1/chat/completions',
                    {
                        model: 'llama3-8b-8192',
                        messages: [{ role: 'user', content: prompt }],
                    },
                    {
                        headers: {
                            'Authorization': `Bearer ${GROQ_API_KEY.trim()}`,
                            'Content-Type': 'application/json',
                        },
                        timeout: 15000,
                    }
                );

                if (response.data?.choices?.[0]?.message?.content) {
                    const text = response.data.choices[0].message.content;
                    console.log("✅ AI Generation successful via Groq");
                    return res.status(200).json({ success: true, description: text });
                }
            } catch (groqError) {
                console.error("❌ Groq fallback failed:", groqError.response?.data || groqError.message);
            }
        }

        throw new Error("All AI services failed to generate content.");

    } catch (error) {
        console.error('❌ AI Generation Final Error:', error.message);
        res.status(500).json({
            success: false,
            message: 'Failed to generate job description',
            error: error.message
        });
    }
};

/**
 * Suggest skills based on job role
 * @route POST /api/ai/suggest-skills
 */
const suggestSkills = async (req, res) => {
    console.log("🚀 Starting AI skills suggestion...");
    try {
        const { role } = req.body;

        if (!role) {
            console.warn("⚠️ AI Suggestion: No role provided");
            return res.status(400).json({ message: 'Job role is required' });
        }

        const prompt = `Based on the job role "${role}", suggest exactly 10 essential technical and soft skills. Format as a comma-separated list ONLY, no extra text. Example: React, Node.js, Problem Solving`;

        // Try OpenRouter first
        if (OPENROUTER_API_KEY) {
            try {
                console.log(`📡 Sending suggestion request to OpenRouter...`);
                const response = await axios.post(
                    'https://openrouter.ai/api/v1/chat/completions',
                    {
                        model: 'openai/gpt-3.5-turbo',
                        messages: [{ role: 'user', content: prompt }],
                    },
                    {
                        headers: {
                            'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
                            'Content-Type': 'application/json',
                            'HTTP-Referer': 'https://ai-talent-hub.com',
                        },
                        timeout: 5000,
                    }
                );

                if (response.data?.choices?.[0]?.message?.content) {
                    const text = response.data.choices[0].message.content.trim();
                    console.log("✅ AI Suggestion successful via OpenRouter");
                    return res.status(200).json({ success: true, skills: text });
                }
            } catch (orError) {
                console.error("⚠️ OpenRouter primary failed for suggestion, trying fallback...", orError.message);
            }
        }

        // Try Groq as fallback
        if (GROQ_API_KEY) {
            try {
                console.log(`📡 Sending suggestion request to Groq...`);
                const response = await axios.post(
                    'https://api.groq.com/openai/v1/chat/completions',
                    {
                        model: 'llama3-8b-8192',
                        messages: [{ role: 'user', content: prompt }],
                    },
                    {
                        headers: {
                            'Authorization': `Bearer ${GROQ_API_KEY.trim()}`,
                            'Content-Type': 'application/json',
                        },
                        timeout: 3000,
                    }
                );

                if (response.data?.choices?.[0]?.message?.content) {
                    const text = response.data.choices[0].message.content.trim();
                    console.log("✅ AI Suggestion successful via Groq");
                    return res.status(200).json({ success: true, skills: text });
                }
            } catch (groqError) {
                console.error("❌ Groq fallback failed for suggestion:", groqError.response?.data || groqError.message);
            }
        }

        throw new Error("All AI services failed to suggest skills.");

    } catch (error) {
        console.error('❌ AI Suggestion Final Error:', error.message);
        res.status(500).json({
            success: false,
            message: 'Failed to suggest skills',
            error: error.message
        });
    }
};

module.exports = {
    generateJobDescription,
    suggestSkills
};

