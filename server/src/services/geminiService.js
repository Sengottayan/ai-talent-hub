const { GoogleGenerativeAI } = require("@google/generative-ai");
const OpenAI = require('openai');
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const axios = require('axios');

// Initialize Groq (OpenAI Compatible)
const groq = process.env.GROQ_API_KEY ? new OpenAI({
    apiKey: process.env.GROQ_API_KEY.trim(),
    baseURL: "https://api.groq.com/openai/v1"
}) : null;

/**
 * Helper to call Groq as a fallback
 */
async function generateWithGroq(prompt, jsonMode = true) {
    if (!groq) return null;
    try {
        console.log("📡 Falling back to Groq SDK...");
        const completion = await groq.chat.completions.create({
            messages: [{ role: 'user', content: prompt }],
            model: 'llama-3.3-70b-versatile',
            response_format: jsonMode ? { type: 'json_object' } : undefined,
            temperature: 0.1
        });
        return completion.choices[0]?.message?.content;
    } catch (e) {
        console.error("❌ Groq SDK Error:", e.message);
        return null;
    }
}

/**
 * Extracts email addresses from resume text using Gemini.
 * @param {string} text - Extracts text content.
 * @returns {Promise<string[]>} - List of found emails.
 */
async function extractEmailsFromText(text) {
    if (!text) return [];

    // Pre-processing
    const cleanedText = text.replace(/\r?\n/g, ' ').replace(/\s+/g, ' ');

    // 1. Regular Expression (Fast & Reliable)
    // Supports spaces around @ and . common in PDF parsers
    const emailRegex = /([a-zA-Z0-9._%+-]+\s*@\s*[a-zA-Z0-9.-]+\s*\.\s*[a-zA-Z]{2,})/g;
    const regexMatches = cleanedText.match(emailRegex) || [];
    const foundByRegex = Array.from(new Set(regexMatches.map(e => e.replace(/\s+/g, '').toLowerCase().trim())));
    
    // If we have a solid email via regex, we return immediately to save AI quota
    if (foundByRegex.length > 0) {
        console.log(`✅ Extracted ${foundByRegex.length} emails using deterministic regex.`);
        return foundByRegex;
    }

    const prompt = `
        Identify and extract all email addresses from the text below. 
        Look carefully for emails that might have had spaces or weird formatting due to PDF extraction (e.g., "user @ gmail . com").
        Return ONLY a raw JSON array of strings.
        If none are found, return [].
        Do not output markdown code blocks.

        Text:
        ${cleanedText.substring(0, 30000)}
        `;

    try {
        // 2. Gemini AI Extraction
        console.log("📡 Attempting Gemini extraction...");
        const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
        const result = await model.generateContent(prompt).catch((e) => {
            console.warn("Gemini direct call failed:", e.message);
            return null;
        });
        
        if (result) {
            const response = await result.response;
            let output = response.text().trim();
            if (output.startsWith('```')) output = output.replace(/```json/g, '').replace(/```/g, '').trim();
            
            try {
                const emails = JSON.parse(output);
                const resultList = Array.isArray(emails) ? emails : (emails.emails || []);
                if (resultList.length > 0) {
                    console.log(`✅ Extracted ${resultList.length} emails using Gemini.`);
                    return Array.from(new Set([...foundByRegex, ...resultList.map(e => e.toLowerCase().trim())]));
                }
            } catch (e) {
                console.error("Gemini JSON parse failed:", output);
            }
        }
        
    } catch (error) {
        console.warn("Gemini pipeline error:", error.message);
    }

    // 3. Groq Fallback (If Gemini fails or returns empty)
    console.log("📡 Falling back to Groq for extraction...");
    const groqOutput = await generateWithGroq(prompt, true);
    if (groqOutput) {
        try {
            const emails = JSON.parse(groqOutput);
            const resultList = Array.isArray(emails) ? emails : (emails.emails || emails.data || []);
            if (resultList.length > 0) {
                console.log(`✅ Extracted ${resultList.length} emails using Groq SDK fallback.`);
                return Array.from(new Set([...foundByRegex, ...resultList.map(e => e.toLowerCase().trim())]));
            }
        } catch (e) {
            console.error("Groq JSON parse error:", e.message);
        }
    }

    return foundByRegex;
}

/**
 * Generates interview questions based on job details.
 * @param {string} jobRole
 * @param {string} jobDescription
 * @param {string} interviewType
 * @param {number|string} duration
 * @returns {Promise<Array<{question: string, type: string}>>}
 */


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
 * Generates interview questions strictly based on a candidate's resume (CV).
 * @param {string} cvText 
 * @param {number} questionCount 
 */
async function generateCvQuestions(cvText, questionCount = 7) {
    const prompt = `
        Generate ${questionCount} interview questions based EXCLUSIVELY on the candidate's resume provided below.
        
        Focus areas:
        - Specific technical skills mentioned
        - Past professional experience and roles
        - Projects and specific contributions
        - Tools and technologies used
        - Clarification of specific achievements

        Requirements:
        1. Return ONLY a raw JSON array of objects.
        2. Each object MUST have:
           - "question": The question text (string)
           - "type": "Technical", "Behavioral", or "Experience"
           - "difficulty": "Easy", "Medium", or "Hard"
        3. Do not output markdown code blocks.
        
        Resume Text:
        ${cvText.substring(0, 30000)}
        `;

    try {
        console.log("📄 Generating CV-based interview questions...");
        const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

        const result = await model.generateContent(prompt);
        const response = await result.response;
        let output = response.text().trim();

        if (output.startsWith('```')) {
            output = output.replace(/```json/g, '').replace(/```/g, '');
        }

        const questions = JSON.parse(output);
        return Array.isArray(questions) ? questions : [];

    } catch (error) {
        console.warn(`⚠️ [Gemini AI Failover] generateCvQuestions: Primary provider hit a quota or error (${error.message}). Trying secondary...`);
        
        // Try Groq Fallback
        const groqOutput = await generateWithGroq(prompt, true);
        if (groqOutput) {
             try {
                const questions = JSON.parse(groqOutput);
                return Array.isArray(questions) ? questions : (questions.questions || []);
            } catch (e) {}
        }
        
        return [{ question: "Can you walk me through your most significant project mentioned in your resume?", type: "Experience", difficulty: "Medium" }];
    }
}

/**
 * Generates hybrid interview questions matching a candidate's CV against a Job Description.
 * @param {string} cvText 
 * @param {string} jobDescription 
 * @param {number} questionCount 
 */
async function generateHybridQuestions(cvText, jobDescription, questionCount = 7) {
    try {
        console.log("⚖️ Generating Hybrid (CV + JD) interview questions...");
        const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

        const prompt = `
        Generate ${questionCount} interview questions by comparing the candidate's Resume against the Job Description.
        
        Focus areas:
        - How the candidate's specific experience maps to the JD requirements
        - Skill gaps or areas needing more depth
        - Scenario-based questions based on their past projects applied to this specific role
        - Behavioral questions about their suitability for this specific company context

        Requirements:
        1. Return ONLY a raw JSON array of objects.
        2. Each object MUST have:
           - "question": The question text (string)
           - "type": "Technical", "Behavioral", or "Scenario"
           - "difficulty": "Easy", "Medium", or "Hard"
        3. Do not output markdown code blocks.

        Candidate Resume:
        ${cvText.substring(0, 15000)}

        Job Description:
        ${jobDescription.substring(0, 5000)}
        `;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        let output = response.text().trim();

        if (output.startsWith('```')) {
            output = output.replace(/```json/g, '').replace(/```/g, '');
        }

        const questions = JSON.parse(output);
        return Array.isArray(questions) ? questions : [];

    } catch (error) {
        console.warn(`⚠️ [Gemini AI Failover] generateHybridQuestions: Primary provider hit a quota or error (${error.message}). Trying secondary...`);
        
        // Try Groq Fallback
        const groqOutput = await generateWithGroq(prompt, true);
        if (groqOutput) {
             try {
                const questions = JSON.parse(groqOutput);
                const list = Array.isArray(questions) ? questions : (questions.questions || []);
                if (list.length > 0) {
                    console.log("✅ Hybrid questions generated via Groq fallback.");
                    return list;
                }
            } catch (e) {}
        }
        
        return [{ question: "How does your past experience prepare you for the requirements mentioned in our job description?", type: "Technical", difficulty: "Medium" }];
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

        const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
        const conversationText = JSON.stringify(conversation);


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

        const result = await model.generateContent(prompt).catch(() => null);
        
        if (result) {
            const response = await result.response;
            let output = response.text().trim();
            if (output.startsWith('```')) output = output.replace(/```json/g, '').replace(/```/g, '').trim();
            try {
                return JSON.parse(output);
            } catch (e) {}
        }
        
        throw new Error("Gemini feedback failed or rate limited");

    } catch (error) {
        console.warn(`⚠️ [Gemini AI Failover] generateInterviewFeedback: Primary provider hit a quota or error (${error.message}). Trying secondary...`);
        
        const groqOutput = await generateWithGroq(prompt, true);
        if (groqOutput) {
            try {
                const feedback = JSON.parse(groqOutput);
                console.log("✅ Interview feedback generated via Groq fallback.");
                return feedback;
            } catch (e) {}
        }

        return {
            rating: { TechnicalSkills: 0, Communication: 0, ProblemSolving: 0, Experience: 0, Behavioral: 0, Thinking: 0 },
            summary: "Error generating feedback via primary and secondary AI.",
            Recommendation: "Review Required",
            "Recommendation Message": "An error occurred while analyzing the interview."
        };
    }
}

module.exports = {
    extractEmailsFromText,
    generateInterviewQuestions,
    generateInterviewFeedback,
    generateCvQuestions,
    generateHybridQuestions
};
