const OpenAI = require("openai");
const pdf = require("pdf-parse");
const mammoth = require("mammoth");
const fs = require("fs");
const SkillGap = require("../models/SkillGap");
const ResumeAnalysis = require("../models/ResumeAnalysis");

// Helper for Text Extraction
const extractText = async (file) => {
    let text = "";
    if (file.mimetype === "application/pdf") {
        const dataBuffer = fs.readFileSync(file.path);
        const data = await pdf(dataBuffer);
        text = data.text;
    } else if (file.mimetype === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
        const data = await mammoth.extractRawText({ path: file.path });
        text = data.value;
    }
    return text;
};

const optimizeResume = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ message: "No file uploaded" });
        }

        const { targetJobDescription } = req.body;

        const resumeText = await extractText(req.file);
        if (!resumeText) {
            return res.status(400).json({ message: "Could not extract text from file." });
        }

        const prompt = `
            You are an expert technical recruiter and ATS (Applicant Tracking System) specialist.
            Analyze the following resume text and provide a detailed optimization report in JSON format.
            
            ${targetJobDescription ? `Target Job Description:\n${targetJobDescription}\n\nNote: Please score and evaluate the resume specifically against this job description.` : ''}
            
            Resume Text:
            ${resumeText.substring(0, 15000)}

            The JSON response MUST include these EXACT keys:
            1. "atsScore": (a number between 0-100)
            2. "keyStrengths": (an array of exactly 5 strings)
            3. "areasForImprovement": (an array of exactly 5 strings)
            4. "kpiSuggestions": (an array of 3 specific quantifiable examples)
            5. "suggestedKeywords": (an array of important technical keywords)
            6. "overallFeedback": (a detailed summary string)
            7. "bulletPointRewrites": (an array of exactly 3 objects with "original" and "rewrite" keys, taking weak bullet points from the resume and rewriting them to be impact-driven and quantifiable)

            Return ONLY a raw JSON object. No markdown, no backticks.
        `;

        const groq = new OpenAI({
            apiKey: process.env.GROQ_API_KEY,
            baseURL: "https://api.groq.com/openai/v1"
        });

        const completion = await groq.chat.completions.create({
            messages: [{ role: "user", content: prompt }],
            model: "llama-3.3-70b-versatile",
            response_format: { type: "json_object" }
        });

        const analysis = JSON.parse(completion.choices[0].message.content);

        let savedId = null;
        if (req.user && req.user._id) {
            const entry = await ResumeAnalysis.create({
                candidateId: req.user._id,
                ...analysis
            });
            savedId = entry._id;
        }

        if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);

        res.json({ success: true, analysis, savedId });

    } catch (error) {
        console.error("Resume Optimization Error:", error);
        if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        res.status(500).json({ message: "AI Analysis failed.", error: error.message });
    }
};

const analyzeSkillGap = async (req, res) => {
    try {
        const { targetRole, jobDescription } = req.body;
        const candidateId = req.user._id;

        if (!req.file) {
            return res.status(400).json({ message: "No resume uploaded" });
        }
        if (!targetRole) {
            return res.status(400).json({ message: "Please specify a target job role" });
        }

        const resumeText = await extractText(req.file);

        const prompt = `
            You are an expert technical career coach and hiring specialist.
            Perform a MISSION-CRITICAL Skill Gap Analysis comparing the candidate's resume against the target job role.

            Target Role: ${targetRole}
            Job Description (if provided): ${jobDescription || 'Not provided. Use industry standards for this role.'}
            
            Candidate Resume:
            ${resumeText.substring(0, 15000)}

            The JSON response MUST include these EXACT keys:
            1. "matchPercentage": (a number 0-100)
            2. "skillsAnalysis": [An array of exactly 5 objects: { "skill": "name", "proficiency": 0-100, "status": "Ready" | "Gap" | "Critical Gap" }]
            3. "criticalGaps": [List of 3 most important missing skills for this role]
            4. "learningRoadmap": [Array of 3 specific actionable learning steps or courses]
            5. "careerInsight": "A high-level sentence about the market value of closing these gaps."

            Return ONLY a raw JSON object. No markdown, no backticks.
        `;

        const groq = new OpenAI({
            apiKey: process.env.GROQ_API_KEY,
            baseURL: "https://api.groq.com/openai/v1"
        });

        const completion = await groq.chat.completions.create({
            messages: [{ role: "user", content: prompt }],
            model: "llama-3.3-70b-versatile",
            response_format: { type: "json_object" }
        });

        const analysis = JSON.parse(completion.choices[0].message.content);

        // Save to Database
        const skillGapEntry = await SkillGap.create({
            candidateId,
            targetRole,
            jobDescription,
            matchPercentage: analysis.matchPercentage,
            skillsAnalysis: analysis.skillsAnalysis,
            criticalGaps: analysis.criticalGaps,
            learningRoadmap: analysis.learningRoadmap,
            careerInsight: analysis.careerInsight
        });

        if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);

        res.json({ success: true, analysis, savedId: skillGapEntry._id });

    } catch (error) {
        console.error("Skill Gap Analysis Error:", error);
        if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        res.status(500).json({ message: "Skill Gap Analysis failed.", error: error.message });
    }
};

const getSkillGaps = async (req, res) => {
    try {
        const candidateId = req.user._id;
        const history = await SkillGap.find({ candidateId }).sort({ createdAt: -1 });
        res.json({ success: true, history });
    } catch (error) {
        res.status(500).json({ message: "Failed to fetch history.", error: error.message });
    }
};

const getResumeHistory = async (req, res) => {
    try {
        const candidateId = req.user._id;
        const history = await ResumeAnalysis.find({ candidateId }).sort({ createdAt: -1 });
        res.json({ success: true, history });
    } catch (error) {
        res.status(500).json({ message: "Failed to fetch history.", error: error.message });
    }
};

const generateCoverLetter = async (req, res) => {
    try {
        const { targetJobDescription, keyStrengths, overallFeedback } = req.body;

        const prompt = `
            You are an expert career coach and technical writer.
            Write a professional, compelling cover letter for a candidate applying to the following job description.

            Target Job Description (Optional - use general tech framing if missing):
            ${targetJobDescription || 'Not provided'}

            Candidate's Key Strengths:
            ${(keyStrengths || []).join(', ')}

            Overall Assessment Profile:
            ${overallFeedback || ''}

            Format: Give ONLY the raw cover letter text. Keep it strictly to 3 paragraphs: Hook, Value Proposition (using strengths), and Call to Action. Do not include placeholders for [Your Name] at the bottom, just return the body content that the candidate can copy-paste.
        `;

        const groq = new OpenAI({
            apiKey: process.env.GROQ_API_KEY,
            baseURL: "https://api.groq.com/openai/v1"
        });

        const completion = await groq.chat.completions.create({
            messages: [{ role: "user", content: prompt }],
            model: "llama-3.3-70b-versatile",
        });

        const coverLetter = completion.choices[0].message.content;

        res.json({ success: true, coverLetter });

    } catch (error) {
        console.error("Cover Letter Generator Error:", error);
        res.status(500).json({ message: "Failed to generate cover letter.", error: error.message });
    }
};

module.exports = { optimizeResume, analyzeSkillGap, getSkillGaps, getResumeHistory, generateCoverLetter };
