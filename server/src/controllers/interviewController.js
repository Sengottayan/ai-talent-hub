const { v4: uuidv4 } = require('uuid');
const Interview = require('../models/Interview');
const { processUploadedResumes } = require('../services/resumeService');
const { generateInterviewQuestions, generateInterviewFeedback, generateCvQuestions, generateHybridQuestions } = require('../services/geminiService');
const CandidateInterviewQuestion = require('../models/CandidateInterviewQuestion');
const crypto = require('crypto');

// @desc    Step 1: Parse Resumes & Generate Draft Questions
// @route   POST /api/interviews/draft
// @access  Private
const draftInterviewController = async (req, res) => {
    try {
        console.log("📝 Draft Request Body Keys:", Object.keys(req.body));
        console.log("📝 questionCount present:", 'questionCount' in req.body);
        console.log("📝 questionCount value:", req.body.questionCount);

        const { jobRole, jobDescription } = req.body;

        // --- 1. Resume Parsing (Email Extraction) ---
        let candidateEmails = [];

        // Manual Emails
        if (req.body.candidateEmails) {
            try {
                const parsed = JSON.parse(req.body.candidateEmails);
                if (Array.isArray(parsed)) candidateEmails = parsed;
            } catch (e) {
                if (Array.isArray(req.body.candidateEmails)) {
                    candidateEmails = req.body.candidateEmails;
                } else {
                    candidateEmails.push(req.body.candidateEmails);
                }
            }
        }


        // File Upload Extraction
        let resumeTexts = {}; // map of email -> fullText
        if (req.files && req.files.length > 0) {
            resumeTexts = await processUploadedResumes(req.files);
            const fileEmails = Object.keys(resumeTexts);
            candidateEmails = [...candidateEmails, ...fileEmails];
        }

        candidateEmails = [...new Set(candidateEmails)];
        const companyName = req.user?.company || req.user?.name || 'AI Talent Hub';
        const recruiterName = req.user?.name || '';

        // --- 1.5 Strict Cooldown Violation Check (Aborts Generation) ---
        const CandidateInterviewHistory = require('../models/CandidateInterviewHistory');
        const cooldownInfo = [];

        for (const email of candidateEmails) {
            const cleanEmail = email.toLowerCase().trim();
            // Match against both Company AND individual name to catch legacy records
            const history = await CandidateInterviewHistory.findOne({
                candidateEmail: cleanEmail,
                jobRole: jobRole,
                $or: [
                    { companyName: companyName },
                    { companyName: recruiterName }
                ],
                cooldownUntil: { $gt: new Date() }
            });

            if (history) {
                cooldownInfo.push({
                    email: cleanEmail,
                    cooldownUntil: history.cooldownUntil,
                    isViolation: true
                });
            }
        }

        const hasViolation = cooldownInfo.some(c => c.isViolation);
        const forceGenerate = req.body.forceGenerate === 'true' || req.body.forceGenerate === true;

        if (hasViolation && !forceGenerate) {
            console.log("🛑 Cooldown Violation - Aborting Draft Generation to preserve resources.");
            return res.status(409).json({
                success: false,
                message: "One or more candidates are in a cooldown period.",
                isCooldownViolation: true,
                data: {
                    candidateEmails,
                    questions: [],
                    cooldownInfo
                }
            });
        }

        // 2. Question Generation
        const { interviewType, duration, questionCount, questionMode = 'JD_ONLY' } = req.body;
        console.log(`Generating draft questions | Mode: ${questionMode} | Candidates: ${candidateEmails.length}`);
        
        let questions = [];
        const firstResumeEmail = Object.keys(resumeTexts)[0];
        const firstResumeText = firstResumeEmail ? resumeTexts[firstResumeEmail] : null;

        if (questionMode === 'CV_ONLY' && !firstResumeText) {
            console.error("❌ CV_ONLY Error: No resumes parsed successfully.");
            return res.status(422).json({ 
                success: false, 
                message: "No candidates or resume text found. Please ensure you've uploaded valid PDF/DOCX resumes with clear text."
            });
        }

        if (questionMode === 'JD_ONLY' || (questionMode !== 'JD_ONLY' && !firstResumeText)) {
            // Fallback to JD if mode is JD_ONLY or if no candidate resume was found yet
            console.log("📝 Generating generic JD-based questions as placeholders...");
            questions = await generateInterviewQuestions(jobRole, jobDescription, interviewType, duration, questionCount);
        } else if (questionMode === 'CV_ONLY') {
            // Use the first resume for the draft preview
            console.log(`📄 CV_ONLY: Generating draft questions from first resume (${firstResumeEmail}).`);
            questions = await generateCvQuestions(firstResumeText, questionCount);
        } else if (questionMode === 'HYBRID') {
            // Hybrid Draft: Merge generic JD and the first resume
            console.log(`⚖️ HYBRID: Merging JD and first resume for draft preview.`);
            const jdPortion = await generateInterviewQuestions(jobRole, jobDescription, interviewType, duration, Math.ceil(questionCount/2));
            const cvPortion = await generateCvQuestions(firstResumeText, Math.floor(questionCount/2));
            questions = [...jdPortion, ...cvPortion];
        }

        res.status(200).json({
            success: true,
            message: "Draft generated successfully.",
            data: {
                candidateEmails,
                questions,
                cooldownInfo,
                isCooldownViolation: hasViolation,
                questionMode,
                resumeTexts // Send to frontend so it can be passed back to finalize
            }
        });

    } catch (error) {
        console.error("Draft Interview Error:", error);
        res.status(500).json({ message: error.message });
    }
};

const { sendEmail } = require('../services/emailService');

// @desc    Step 2: Finalize & Send
// @route   POST /api/interviews/finalize
// @access  Private
const finalizeInterviewController = async (req, res) => {
    try {
        const { jobRole, jobDescription, duration, interviewType, candidateEmails, questions, questionMode = 'JD_ONLY', resumeTexts = {} } = req.body;

        if (!candidateEmails || !Array.isArray(candidateEmails) || candidateEmails.length === 0) {
            return res.status(400).json({ message: "No candidates provided." });
        }

        const results = [];
        let allSuccess = true;
        const createdInterviews = [];

        console.log(`Starting to create interviews for ${candidateEmails.length} candidates using mode: ${questionMode}...`);

        for (const email of candidateEmails) {
            const cleanEmail = email.toLowerCase().trim();
            const interviewId = uuidv4();
            const baseUrl = process.env.FRONTEND_URL || 'https://ai-talent-hub.vercel.app'; // Better production fallback
            const link = `${baseUrl}/interview/${interviewId}`;

            // --- PER-CANDIDATE QUESTIONS (CV_ONLY/HYBRID) ---
            let effectiveQuestions = questions; // Fallback to provided global questions
            
            if (questionMode !== 'JD_ONLY') {
                const cvText = resumeTexts[cleanEmail];
                if (!cvText) {
                    console.log(`⚠️ No resume text found for ${cleanEmail}. Skipping personalization.`);
                    if (questionMode === 'CV_ONLY') {
                        console.log("🛑 CV_ONLY mode requires resume text. Aborting creation for this candidate.");
                        results.push({ email: cleanEmail, success: false, message: "Resume required for CV_ONLY mode." });
                        continue; 
                    }
                } else {
                    try {
                        // Caching Logic: hash(cvText + jobDescription)
                        const hash = crypto.createHash('md5').update(cvText + (questionMode === 'HYBRID' ? jobDescription : '')).digest('hex');
                        
                        // Check if these questions already exist for this candidate/JD match
                        let existing = await CandidateInterviewQuestion.findOne({ questionHash: hash });
                        
                        if (existing) {
                            console.log(`♻️ Reusing cached questions for ${cleanEmail} (Hash matched).`);
                            effectiveQuestions = existing.questions;
                        } else {
                            // Generate new questions based on mode
                            if (questionMode === 'CV_ONLY') {
                                effectiveQuestions = await generateCvQuestions(cvText, 7);
                            } else if (questionMode === 'HYBRID') {
                                // Hybrid: Merging HR-Edited global JD questions with new CV-specific AI questions
                                const jdPortion = Array.isArray(questions) ? questions.slice(0, 5) : [];
                                const cvPortion = await generateCvQuestions(cvText, 5); 
                                
                                // Final merged set
                                effectiveQuestions = [...jdPortion, ...cvPortion];
                                console.log(`⚖️ Hybrid mode: Merged ${jdPortion.length} JD and ${cvPortion.length} CV questions for ${cleanEmail}.`);
                            }
                        }

                        // Always ensure a record exists for this specific interview link session
                        await CandidateInterviewQuestion.create({
                            interviewId,
                            candidateEmail: cleanEmail,
                            questionMode,
                            questions: effectiveQuestions,
                            questionHash: hash
                        });

                    } catch (genError) {
                        console.error(`❌ Personalization failed for ${cleanEmail}:`, genError.message);
                        // Fallback to global questions remains as effectiveQuestions
                    }
                }
            }

            // --- NEW: Cooldown Logic Check ---
            const CandidateInterviewHistory = require('../models/CandidateInterviewHistory');
            const companyName = req.user?.company || req.user?.name || 'AI Talent Hub';
            
            const history = await CandidateInterviewHistory.findOne({
                candidateEmail: cleanEmail,
                jobRole: jobRole,
                companyName: companyName,
                cooldownUntil: { $gt: new Date() }
            });

            const isViolation = !!history;

            // Create Interview Document
            const newInterview = await Interview.create({
                interviewId,
                candidateEmail: cleanEmail,
                candidateEmails: [cleanEmail],
                jobRole,
                role: jobRole,
                jobDescription,
                duration: parseInt(duration),
                interviewType,
                questions: effectiveQuestions, // This will be the personalized set if CV/Hybrid
                interviewLink: link,
                status: 'Created',
                companyName,
                isCooldownViolation: isViolation,
                questionMode
            });

            createdInterviews.push(newInterview);

            // Send Email
            console.log(`Sending invitation to ${cleanEmail} (ID: ${interviewId})`);

            const subject = `Interview Invitation: ${jobRole}`;
            const body = `
                <h3>Interview Invitation</h3>
                <p>You have been invited to an AI-conducted interview for the position of <strong>${jobRole}</strong>.</p>
                <p><strong>Details:</strong></p>
                <ul>
                    <li>Job Description: ${jobDescription.substring(0, 100)}...</li>
                    <li>Duration: ${duration} minutes</li>
                    <li>Type: ${interviewType}</li>
                </ul>
                <p>Please click the link below to start your interview:</p>
                <p><a href="${link}?email=${encodeURIComponent(cleanEmail)}">${link}</a></p>
                <br>
                <p>Good luck!</p>
            `;

            const result = await sendEmail(
                cleanEmail,
                subject,
                body,
                { duration, interviewType }
            );

            // Create History Entry (Start Cooldown)
            const days = parseInt(req.body.cooldownPeriod || 90);
            
            if (days > 0) {
                const cooldownUntil = new Date();
                cooldownUntil.setDate(cooldownUntil.getDate() + days);

                await CandidateInterviewHistory.create({
                    candidateEmail: cleanEmail,
                    jobRole,
                    companyName,
                    interviewId,
                    cooldownUntil
                });
            }

            results.push({ email: cleanEmail, success: result.success });

            // Update email status on the document
            newInterview.email_sent = result.success;
            if (result.success) {
                newInterview.email_sent_at = new Date();
                newInterview.status = 'Created'; // Initial status
            }
            await newInterview.save();

            // Step 13: Logging
            console.log(`[Interview Creation] Candidate: ${cleanEmail}, ID: ${interviewId}, Mode: ${questionMode}, Timestamp: ${new Date().toISOString()}`);

            if (!result.success) allSuccess = false;
        }

        res.status(201).json({
            success: true,
            message: allSuccess ? "Interviews created and emails sent." : "Interviews created but some emails failed.",
            data: createdInterviews, // Return array of created docs
            email_results: results
        });

    } catch (error) {
        console.error("Finalize Interview Error:", error);
        res.status(500).json({ message: error.message });
    }
};


// @desc    Evaluate Interview Answers
// @route   POST /api/interviews/feedback
// @access  Private
const submitFeedbackController = async (req, res) => {
    try {
        const { conversation } = req.body;

        // Validation similar to user snippet
        if (!conversation || !Array.isArray(conversation) || conversation.length === 0) {
            return res.status(200).json({
                success: true,
                data: {
                    rating: { TechnicalSkills: 0, Communication: 0, ProblemSolving: 0, Experience: 0, Behavioral: 0, Thinking: 0 },
                    summery: "No conversation provided.",
                    Recommendation: "Not Recommended",
                    "Recommendation Message": "No responses found."
                }
            });
        }

        console.log("Generating feedback...");
        const feedback = await generateInterviewFeedback(conversation);

        res.status(200).json({
            success: true,
            message: "Feedback generated successfully.",
            data: feedback
        });

    } catch (error) {
        console.error("Feedback Generation Error:", error);
        res.status(500).json({ message: error.message });
    }
};


// @desc    Get All Interviews for the logged-in company
// @route   GET /api/interviews
// @access  Private
const getAllInterviewsController = async (req, res) => {
    try {
        const companyName = req.user?.company;

        if (!companyName && req.user.role === 'recruiter') {
            return res.status(400).json({ message: "Company profile not found. Please update your settings." });
        }

        const query = { interviewType: { $ne: 'Mock' } };
        
        // Apply multi-tenancy filter for recruiters
        if (req.user.role === 'recruiter') {
            query.companyName = companyName;
        }

        const interviews = await Interview.find(query).sort({ createdAt: -1 });
        res.status(200).json(interviews);
    } catch (error) {
        console.error("Get All Interviews Error:", error);
        res.status(500).json({ message: error.message });
    }
};

// @desc    Get Interview by ID
// @route   GET /api/interviews/:id
// @access  Public (Candidate)
const getInterviewController = async (req, res) => {
    try {
        const { id } = req.params;
        const interview = await Interview.findOne({ interviewId: id });

        if (!interview) {
            return res.status(404).json({ message: "Interview not found" });
        }

        res.status(200).json({
            success: true,
            data: interview
        });
    } catch (error) {
        console.error("Get Interview Error:", error);
        res.status(500).json({ message: error.message });
    }
};

// @desc    Resend Interview Link
// @route   POST /api/interviews/resend/:id
// @access  Private
const resendInterviewLinkController = async (req, res) => {
    try {
        const { id } = req.params;
        const interview = await Interview.findOne({ interviewId: id });

        if (!interview) {
            return res.status(404).json({ message: "Interview not found" });
        }

        const baseUrl = process.env.FRONTEND_URL || 'https://ai-talent-hub.vercel.app';
        
        // Defensive fix for any legacy links
        if (interview.interviewLink && (interview.interviewLink.includes(':8081') || interview.interviewLink.includes(':8080') || interview.interviewLink.includes('localhost'))) {
            const path = new URL(interview.interviewLink).pathname;
            interview.interviewLink = `${baseUrl}${path}`;
            await interview.save();
        }

        const subject = `Interview Invitation: ${interview.jobRole}`;
        const results = [];
        let allSuccess = true;

        for (const email of interview.candidateEmails) {
            let currentLink = interview.interviewLink || '';
            // Defensive check for this specific email link
            if (currentLink.includes(':8081') || currentLink.includes(':8080') || currentLink.includes('localhost')) {
                 const path = new URL(currentLink).pathname;
                 currentLink = `${baseUrl}${path}`;
            }

            console.log(`Resending email to ${email} with link: ${currentLink}`);

            const body = `
                <h3>Interview Invitation</h3>
                <p>You have been invited to an AI-conducted interview for the position of <strong>${interview.jobRole}</strong>.</p>
                <p><strong>Details:</strong></p>
                <ul>
                    <li>Job Description: ${interview.jobDescription.substring(0, 100)}...</li>
                    <li>Duration: ${interview.duration} minutes</li>
                    <li>Type: ${interview.interviewType}</li>
                </ul>
                <p>Please click the link below to start your interview:</p>
                <p><a href="${currentLink}?email=${encodeURIComponent(email)}">${currentLink}</a></p>
                <br>
                <p>Good luck!</p>
            `;
            const result = await sendEmail(
                email,
                subject,
                body,
                { duration: interview.duration, interviewType: interview.interviewType }
            );
            results.push({ email, ...result });
            if (!result.success) allSuccess = false;
        }

        interview.email_sent = allSuccess;
        if (allSuccess) {
            interview.email_sent_at = new Date();
        }
        await interview.save();

        res.status(200).json({
            success: true,
            message: allSuccess ? "Email(s) resent successfully." : "Some emails failed to send.",
            email_results: results
        });
    } catch (error) {
        console.error("Resend Link Error:", error);
        res.status(500).json({ message: error.message });
    }
};

// @desc    Get Interviews for a specific candidate by email
// @route   GET /api/interviews/my-interviews/:email
// @access  Public (Candidate)
const getCandidateInterviewsController = async (req, res) => {
    try {
        const { email } = req.params;

        // Escape special regex characters to prevent injection/errors
        const escapedEmail = email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

        const interviews = await Interview.find({
            candidateEmails: { $regex: new RegExp(`^${escapedEmail}$`, 'i') },
            status: { $in: ['Created', 'Active', 'Rescheduled', 'Scheduled'] }
        }).sort({ createdAt: -1 });

        res.status(200).json({
            success: true,
            data: interviews
        });
    } catch (error) {
        console.error("Get Candidate Interviews Error:", error);
        res.status(500).json({ message: error.message });
    }
};

const updateInterviewDate = async (req, res) => {
    try {
        const { id } = req.params;
        const { scheduledDate } = req.body;

        const interview = await Interview.findByIdAndUpdate(id, {
            scheduledDate,
            status: 'Active'
        }, { new: true });

        if (!interview) return res.status(404).json({ message: "Interview not found" });

        res.status(200).json({ success: true, data: interview });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Share Interview Link to specific email
// @route   POST /api/interviews/share/:id
// @access  Private
const shareInterviewLinkController = async (req, res) => {
    try {
        const { id } = req.params;
        const { email } = req.body;
        const interview = await Interview.findOne({ interviewId: id });

        if (!interview) {
            return res.status(404).json({ message: "Interview not found" });
        }

        if (!email) {
            return res.status(400).json({ message: "Email is required" });
        }

        const subject = `Interview Invitation: ${interview.jobRole}`;

        // 1. Generate a NEW unique ID for the shared candidate 
        // to prevent session collision with the original candidate
        const newInterviewId = uuidv4();
        const baseUrl = process.env.FRONTEND_URL || 'http://localhost:8080';
        const newLink = `${baseUrl}/interview/${newInterviewId}`;

        // Create a CLONE of the interview for the new candidate
        const sharedInterview = await Interview.create({
            interviewId: newInterviewId,
            candidateEmail: email.toLowerCase().trim(),
            candidateEmails: [email.toLowerCase().trim()],
            jobRole: interview.jobRole,
            role: interview.role || interview.jobRole,
            jobDescription: interview.jobDescription,
            duration: interview.duration,
            interviewType: interview.interviewType,
            questions: interview.questions,
            interviewLink: newLink,
            status: 'Created',
            companyName: interview.companyName
        });

        const body = `
            <h3>Interview Invitation</h3>
            <p>You have been invited to an AI-conducted interview for the position of <strong>${interview.jobRole}</strong>.</p>
            <p><strong>Details:</strong></p>
            <ul>
                <li>Duration: ${interview.duration} minutes</li>
                <li>Type: ${interview.interviewType}</li>
            </ul>
            <p>Please click the link below to start your interview:</p>
            <p><a href="${newLink}?email=${encodeURIComponent(email.toLowerCase().trim())}">${newLink}</a></p>
            <br>
            <p>Good luck!</p>
        `;

        const result = await sendEmail(
            email.toLowerCase().trim(),
            subject,
            body,
            { duration: interview.duration, interviewType: interview.interviewType }
        );

        if (!result.success) {
            return res.status(500).json({ success: false, message: "Failed to send email" });
        }

        res.status(201).json({
            success: true,
            message: `New interview session created and link sent to ${email}`,
            data: sharedInterview
        });
    } catch (error) {
        console.error("Share Link Error:", error);
        res.status(500).json({ message: error.message });
    }
};

module.exports = {
    draftInterviewController,
    finalizeInterviewController,
    submitFeedbackController,
    getAllInterviewsController,
    getInterviewController,
    resendInterviewLinkController,
    getCandidateInterviewsController,
    updateInterviewDate,
    shareInterviewLinkController
};
