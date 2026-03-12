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
 * Handles specialized prompting for Problem Solving (Coding) questions.
 * @param {string} jobRole
 * @param {string} jobDescription
 * @param {string} interviewType
 * @param {number|string} duration
 * @param {number} questionCount
 * @returns {Promise<Array<{question: string, type: string, testCases?: Array<{input: string, output: string}>}>>}
 */
async function generateInterviewQuestions(jobRole, jobDescription, interviewType, duration, questionCount = 10) {
    try {
        console.log(`🔄 Delegating ${interviewType} question generation...`);

        // Determine which webhook to use: Specific for Problem Solving or Generic
        let webhookUrl = process.env.N8N_QUESTION_WEBHOOK_URL;
        if (interviewType === 'Problem Solving' && process.env.N8N_PROBLEM_SOLVING_WEBHOOK_URL) {
            console.log("🧩 Using dedicated Problem Solving webhook");
            webhookUrl = process.env.N8N_PROBLEM_SOLVING_WEBHOOK_URL;
        }

        if (!webhookUrl) {
            console.warn("⚠️ Webhook URL is not defined. Falling back to static questions.");
            throw new Error("Webhook URL missing");
        }

        // Create specialized requirements for Problem Solving
        let requirements = `Generate ${questionCount} static questions based on the role and description.`;
        if (interviewType === 'Problem Solving') {
            requirements = `Generate ${questionCount} CODING problems with 3 difficulty levels (Easy, Medium, Hard). 
            Each problem MUST have:
            - "question": Detailed problem statement (string).
            - "difficulty": "Easy", "Medium", or "Hard" (string).
            - "testCases": Array of 3-5 objects with "input" (string) and "output" (string).
            - "type": "Coding". 
            Ensure test cases cover edge cases and logic verification.`;
        }

        const payload = {
            jobRole,
            jobDescription,
            interviewType,
            duration,
            questionCount: parseInt(questionCount),
            requirements
        };

        const response = await axios.post(webhookUrl, payload, {
            headers: { 'Content-Type': 'application/json' },
            timeout: 90000 // 90 second timeout for complex coding generation
        });

        // n8n returns { questions: [...] }
        const responseData = response.data.questions || response.data.data || response.data || [];
        const questions = Array.isArray(responseData) ? responseData : [];

        if (questions.length > 0) {
            return questions.map(q => ({
                question: q.question || (typeof q === 'string' ? q : ''),
                type: q.type || (interviewType === 'Problem Solving' ? 'Coding' : 'Technical'),
                difficulty: q.difficulty || 'Medium',
                testCases: Array.isArray(q.testCases) ? q.testCases : []
            }));
        }

        throw new Error("Empty or invalid response from n8n");
    } catch (error) {
        console.error("❌ generateInterviewQuestions Error:", error.message);

        // Final fallback aligned with types
        const staticQuestions = [
            {
                question: "Explain a technical challenge you faced.",
                type: "Technical",
                difficulty: "Medium",
                testCases: []
            },
            {
                question: "How do you handle team conflict?",
                type: "Behavioral",
                difficulty: "Easy",
                testCases: []
            }
        ];
        return staticQuestions.slice(0, questionCount);
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
