const OpenAI = require("openai");
const pdf = require("pdf-parse");
const mammoth = require("mammoth");
const fs = require("fs");
const SkillGap = require("../models/SkillGap");

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

        const resumeText = await extractText(req.file);
        if (!resumeText) {
            return res.status(400).json({ message: "Could not extract text from file." });
        }

        const prompt = `
            You are an expert technical recruiter and ATS (Applicant Tracking System) specialist.
            Analyze the following resume text and provide a detailed optimization report in JSON format.
            
            Resume Text:
            ${resumeText.substring(0, 15000)}

            The JSON response MUST include these EXACT keys:
            1. "atsScore": (a number between 0-100)
            2. "keyStrengths": (an array of exactly 5 strings)
            3. "areasForImprovement": (an array of exactly 5 strings)
            4. "kpiSuggestions": (an array of 3 specific quantifiable examples)
            5. "suggestedKeywords": (an array of important technical keywords)
            6. "overallFeedback": (a detailed summary string)

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

        if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);

        res.json({ success: true, analysis });

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

module.exports = { optimizeResume, analyzeSkillGap, getSkillGaps };
