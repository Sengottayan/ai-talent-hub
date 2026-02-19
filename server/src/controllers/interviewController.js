const { v4: uuidv4 } = require('uuid');
const Interview = require('../models/Interview');
const { processUploadedResumes } = require('../services/resumeService');
const { generateInterviewQuestions, generateInterviewFeedback } = require('../services/geminiService');

// @desc    Step 1: Parse Resumes & Generate Draft Questions
// @route   POST /api/interviews/draft
// @access  Private
const draftInterviewController = async (req, res) => {
    try {
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
        if (req.files && req.files.length > 0) {
            const fileEmails = await processUploadedResumes(req.files);
            candidateEmails = [...candidateEmails, ...fileEmails];
        }

        candidateEmails = [...new Set(candidateEmails)];

        // --- 2. Question Generation ---
        console.log("Generating draft questions...");
        const { interviewType, duration } = req.body;
        const questions = await generateInterviewQuestions(jobRole, jobDescription, interviewType, duration);

        res.status(200).json({
            success: true,
            message: "Draft generated successfully.",
            data: {
                candidateEmails,
                questions
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
        const { jobRole, jobDescription, duration, interviewType, candidateEmails, questions } = req.body;

        if (!candidateEmails || !Array.isArray(candidateEmails) || candidateEmails.length === 0) {
            return res.status(400).json({ message: "No candidates provided." });
        }

        const results = [];
        let allSuccess = true;
        const createdInterviews = [];

        console.log(`Starting to create interviews for ${candidateEmails.length} candidates...`);

        // Iterate through each candidate and create a UNIQUE interview document
        for (const email of candidateEmails) {
            const cleanEmail = email.toLowerCase().trim();
            const interviewId = uuidv4();

            // Construct Link
            const baseUrl = process.env.FRONTEND_URL || 'http://localhost:8080';
            const link = `${baseUrl}/interview/${interviewId}`;

            // Create Interview Document
            const newInterview = await Interview.create({
                interviewId,
                candidateEmail: cleanEmail,
                candidateEmails: [cleanEmail], // For compatibility with regex search
                jobRole,
                role: jobRole, // Dual field support
                jobDescription,
                duration: parseInt(duration),
                interviewType,
                questions,
                interviewLink: link,
                status: 'Created'
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
                <p><a href="${link}">${link}</a></p>
                <br>
                <p>Good luck!</p>
            `;

            const result = await sendEmail(
                cleanEmail,
                subject,
                body,
                { duration, interviewType }
            );

            results.push({ email: cleanEmail, success: result.success });

            // Update email status on the document
            newInterview.email_sent = result.success;
            if (result.success) {
                newInterview.email_sent_at = new Date();
                newInterview.status = 'Created'; // Initial status
            }
            await newInterview.save();

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


// @desc    Get All Interviews
// @route   GET /api/interviews
// @access  Private
const getAllInterviewsController = async (req, res) => {
    try {
        const interviews = await Interview.find({
            interviewType: { $ne: 'Mock' }
        }).sort({ createdAt: -1 });
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

        // Fix port if 8081
        if (interview.interviewLink && interview.interviewLink.includes(':8081')) {
            interview.interviewLink = interview.interviewLink.replace(':8081', ':8080');
            await interview.save();
        }

        const subject = `Interview Invitation: ${interview.jobRole}`;
        const results = [];
        let allSuccess = true;

        for (const email of interview.candidateEmails) {
            // Force 8080 if not already present (defensive)
            let currentLink = interview.interviewLink || '';
            if (currentLink.includes(':8081')) {
                currentLink = currentLink.replace(':8081', ':8080');
                // Persist fix
                interview.interviewLink = currentLink;
                await interview.save();
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
                <p><a href="${currentLink}">${currentLink}</a></p>
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

        // Defensive port fix
        let currentLink = interview.interviewLink || '';
        if (currentLink.includes(':8081')) {
            currentLink = currentLink.replace(':8081', ':8080');
        }

        const body = `
            <h3>Interview Invitation</h3>
            <p>You have been invited to an AI-conducted interview for the position of <strong>${interview.jobRole}</strong>.</p>
            <p><strong>Details:</strong></p>
            <ul>
                <li>Duration: ${interview.duration} minutes</li>
                <li>Type: ${interview.interviewType}</li>
            </ul>
            <p>Please click the link below to start your interview:</p>
            <p><a href="${currentLink}">${currentLink}</a></p>
            <br>
            <p>Good luck!</p>
        `;

        const result = await sendEmail(
            email,
            subject,
            body,
            { duration: interview.duration, interviewType: interview.interviewType }
        );

        if (!result.success) {
            return res.status(500).json({ success: false, message: "Failed to send email" });
        }

        // Optional: Add to candidateEmails if not already there
        if (!interview.candidateEmails.includes(email.toLowerCase().trim())) {
            interview.candidateEmails.push(email.toLowerCase().trim());
            await interview.save();
        }

        res.status(200).json({
            success: true,
            message: `Email sent successfully to ${email}`
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
