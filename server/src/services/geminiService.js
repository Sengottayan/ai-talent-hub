const { GoogleGenerativeAI } = require("@google/generative-ai");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

/**
 * Extracts email addresses from resume text using Gemini.
 * @param {string} text - Extracts text content.
 * @returns {Promise<string[]>} - List of found emails.
 */
async function extractEmailsFromText(text) {
    if (!text) return [];

    try {
        // Use gemini-1.5-flash for speed and cost efficiency
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

        const prompt = `
        Identify and extract all email addresses from the text below. 
        Return ONLY a raw JSON array of strings (e.g., ["email1@example.com"]). 
        If none are found, return [].
        Do not output markdown code blocks.

        Text:
        ${text.substring(0, 30000)}
        `;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        let output = response.text().trim();

        // Clean potentially marked down JSON
        if (output.startsWith('```')) {
            output = output.replace(/```json/g, '').replace(/```/g, '');
        }

        try {
            const emails = JSON.parse(output);
            return Array.isArray(emails) ? emails : [];
        } catch (jsonError) {
            console.error("Failed to parse JSON from Gemini:", output);
            // Fallback to Regex extraction on the *original text* if Gemini returns garbage,
            // or maybe just on the output? 
            // If JSON fails, it's safer to try regex on the output or just return []
            // Let's try to regex the output just in case it returned emails in plain text
            const emailRegex = /[\w.-]+@[\w.-]+\.\w+/g;
            return output.match(emailRegex) || [];
        }

    } catch (error) {
        console.error("Gemini extractEmailsFromText Error:", error.message);
        // Robust Fallback: Regex extraction on original text
        const emailRegex = /[\w.-]+@[\w.-]+\.\w+/g;
        return text.match(emailRegex) || [];
    }
}

/**
 * Generates interview questions based on job details.
 * @param {string} jobRole
 * @param {string} jobDescription
 * @param {string} interviewType
 * @param {number|string} duration
 * @returns {Promise<Array<{question: string, type: string}>>}
 */

const axios = require('axios');

/**
 * Generates interview questions via N8N Webhook.
 * @param {string} jobRole
 * @param {string} jobDescription
 * @param {string} interviewType
 * @param {number|string} duration
 * @returns {Promise<Array<{question: string, type: string}>>}
 */
async function generateInterviewQuestions(jobRole, jobDescription, interviewType, duration) {
    try {
        console.log("🔄 Delegating question generation to n8n...");

        const webhookUrl = process.env.N8N_QUESTION_WEBHOOK_URL;
        if (!webhookUrl) {
            console.warn("⚠️  N8N_QUESTION_WEBHOOK_URL is not defined. Falling back to static questions.");
            throw new Error("N8N Webhook URL missing");
        }

        const payload = {
            jobRole,
            jobDescription,
            interviewType,
            duration,
            questionCount: 10,
            requirements: "Generate 10 static questions based on the role."
        };

        console.log(`📤 Sending request to n8n webhook: ${webhookUrl}`);
        console.log(`📦 Payload:`, JSON.stringify(payload, null, 2));

        const response = await axios.post(webhookUrl, payload, {
            headers: {
                'Content-Type': 'application/json'
            },
            timeout: 60000 // 60 second timeout
        });

        console.log(`✅ n8n response status: ${response.status}`);
        console.log(`📥 n8n response data:`, JSON.stringify(response.data, null, 2));

        // Expecting response.data to be the array of questions
        // e.g. [{question: "...", type: "text"}]
        // Or if n8n returns { data: [...] } or { questions: [...] }
        const questions = response.data.questions || response.data.data || response.data || [];

        if (Array.isArray(questions) && questions.length > 0) {
            console.log(`✅ Received ${questions.length} questions from n8n`);
            return questions.map(q => ({
                question: q.question || q,
                type: q.type || 'text'
            }));
        }

        console.warn("⚠️  n8n returned empty or invalid questions array, using fallback");
        throw new Error("Invalid response from n8n");

    } catch (error) {
        console.error("❌ N8N generateInterviewQuestions Error:", error.message);

        if (error.response) {
            console.error(`   Status: ${error.response.status}`);
            console.error(`   Status Text: ${error.response.statusText}`);
            console.error(`   Response Data:`, error.response.data);

            if (error.response.status === 404) {
                console.error("   💡 Hint: The n8n webhook URL might be incorrect or the workflow is not active.");
                console.error("   💡 Please check:");
                console.error("      1. Is the n8n workflow activated?");
                console.error("      2. Is the webhook path correct in the workflow?");
                console.error("      3. Is the n8n instance accessible?");
            }
        } else if (error.request) {
            console.error("   ⚠️  No response received from n8n");
            console.error("   💡 Hint: Check if n8n instance is running and accessible");
        }

        // Fallback to static questions
        console.log("📝 Using fallback static questions");
        return [
            { question: "Could you tell me about yourself?", type: "text" },
            { question: "What are your strengths and weaknesses?", type: "text" },
            { question: "Why do you want to join us?", type: "Behavioral" },
            { question: "Describe a challenging technical problem you solved.", type: "Technical" },
            { question: "How do you handle tight deadlines?", type: "Behavioral" },
            { question: "What technologies are you most comfortable with?", type: "Technical" },
            { question: "Describe a time you worked in a team.", type: "Behavioral" },
            { question: "What are your career goals?", type: "text" },
            { question: "How do you stay updated with industry trends?", type: "text" },
            { question: "Why should we hire you?", type: "text" }
        ];
    }
}

/**
 * Generates feedback and rating based on interview conversation.
 * @param {Array} conversation
 * @returns {Promise<Object>}
 */
async function generateInterviewFeedback(conversation) {
    try {
        if (!conversation || !Array.isArray(conversation) || conversation.length === 0) {
            return {
                rating: { TechnicalSkills: 0, Communication: 0, ProblemSolving: 0, Experience: 0, Behavioral: 0, Thinking: 0 },
                summary: "No conversation history found.",
                Recommendation: "Review Required",
                "Recommendation Message": "The interview session ended without data."
            };
        }

        const userMessages = conversation.filter(m => m.role === 'user' || m.role === 'candidate');
        if (userMessages.length === 0) {
            return {
                rating: { TechnicalSkills: 0, Communication: 0, ProblemSolving: 0, Experience: 0, Behavioral: 0, Thinking: 0 },
                summary: "Candidate did not provide any verbal responses.",
                Recommendation: "Not Recommended",
                "Recommendation Message": "No participation detected during the interview session."
            };
        }

        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        const conversationText = JSON.stringify(conversation);
        // ... (rest of function)


        const prompt = `
        Analyze the following interview conversation and provide detailed feedback.

        Conversation:
        ${conversationText.substring(0, 50000)}

        Requirements:
        1. Evaluate the candidate on: TechnicalSkills, Communication, ProblemSolving, Experience, Behavioral, Thinking.
        2. Provide a rating from 1-10 for each category.
        3. Provide a summary of the candidate's performance.
        4. Provide a final recommendation (Recommended/Not Recommended/Hiring Manager Review).
        5. Provide a recommendation message justifying the decision.
        6. Return ONLY a raw JSON object with this EXACT structure:
        {
          "rating": { 
            "TechnicalSkills": number, 
            "Communication": number, 
            "ProblemSolving": number, 
            "Experience": number, 
            "Behavioral": number, 
            "Thinking": number 
          },
          "summary": "Detailed summary string...",
          "Recommendation": "String...",
          "Recommendation Message": "String..."
        }
        7. Do not output markdown.
        `;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        let output = response.text().trim();

        if (output.startsWith('```')) {
            output = output.replace(/```json/g, '').replace(/```/g, '');
        }

        return JSON.parse(output);

    } catch (error) {
        console.error("Gemini generateInterviewFeedback Error:", error.message);
        return {
            rating: { TechnicalSkills: 0, Communication: 0, ProblemSolving: 0, Experience: 0, Behavioral: 0, Thinking: 0 },
            summary: "Error generating feedback.",
            Recommendation: "Review Required",
            "Recommendation Message": "An error occurred while analyzing the interview."
        };
    }
}

module.exports = {
    extractEmailsFromText,
    generateInterviewQuestions,
    generateInterviewFeedback
};
