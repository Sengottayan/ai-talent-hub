const Interview = require('../models/Interview');
const Question = require('../models/Question');
const mongoose = require('mongoose');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { sendEmail } = require('../services/emailService');

/**
 * @desc    Request OTP for Interview Access
 * @route   POST /api/interviews/otp/request
 * @access  Public
 */
const requestOtp = async (req, res) => {
    try {
        const { interviewId, email } = req.body;
        console.log(`🔐 OTP Request for ${email} on interview ${interviewId}`);

        // Escape special regex characters to prevent injection/errors
        const escapedEmail = email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const emailRegex = new RegExp(`^${escapedEmail}$`, 'i');

        // Find interview by ID and candidate email
        const query = {
            interviewId: interviewId,
            $or: [
                { candidateEmail: emailRegex },
                { candidateEmails: { $in: [emailRegex] } }
            ]
        };

        const interview = await Interview.findOne(query);

        if (!interview) {
            console.log("❌ Interview mismatch or not found");
            return res.status(404).json({
                success: false,
                message: 'Interview not found or email does not match our records.'
            });
        }

        if (['Completed', 'expired'].includes(interview.status)) {
            return res.status(400).json({
                success: false,
                message: 'This interview is no longer active.'
            });
        }

        // Generate 6-digit OTP
        const otp = Math.floor(100000 + Math.random() * 900000).toString();

        // Hash for storage (optional, simple string for MVP)
        interview.otp = otp;
        interview.otpExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
        await interview.save();

        // Send Email
        const html = `
            <h3>Interview Access Code</h3>
            <p>Your verification code for the interview is:</p>
            <h1 style="color: #2563eb; font-size: 32px; letter-spacing: 5px;">${otp}</h1>
            <p>This code will expire in 10 minutes.</p>
        `;

        if (!process.env.EMAILJS_OTP_TEMPLATE_ID) {
            console.warn("⚠️ EMAILJS_OTP_TEMPLATE_ID is not set! Using default template, which may be incorrect.");
        } else {
            console.log(`📋 Using specific OTP Template: ${process.env.EMAILJS_OTP_TEMPLATE_ID}`);
        }

        const emailResult = await sendEmail(
            email,
            `Your Verification Code: ${otp}`, // Explicit Subject
            html,
            {
                // Force important variables to override template defaults if supported
                title: "Interview Access Code",
                intro: `Use the code below to access your interview for ${interview.jobRole}.`,
                message: `Your verification code is: ${otp}`,
                code: otp, // Direct variable for OTP template
                jobRole: interview.jobRole,
                candidateName: interview.candidateName || email.split('@')[0],
                duration: '10' // For display purposes
            },
            process.env.EMAILJS_OTP_TEMPLATE_ID // Use separate template if available
        );

        if (emailResult.success) {
            res.json({ success: true, message: 'OTP sent to your email.' });
        } else {
            res.status(500).json({ success: false, message: 'Failed to send OTP email.' });
        }

    } catch (error) {
        console.error('OTP Request Error:', error);
        res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
};

/**
 * @desc    Verify OTP and Get Token
 * @route   POST /api/interviews/otp/verify
 * @access  Public
 */
const verifyOtp = async (req, res) => {
    try {
        const { interviewId, email, otp } = req.body;

        const escapedEmail = email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const emailRegex = new RegExp(`^${escapedEmail}$`, 'i');

        const interview = await Interview.findOne({
            interviewId,
            $or: [
                { candidateEmail: emailRegex },
                { candidateEmails: { $in: [emailRegex] } }
            ]
        });

        if (!interview) {
            console.warn(`🕵️ Verification failed: Interview ${interviewId} not found for ${email}`);
            return res.status(404).json({ success: false, message: 'Interview not found' });
        }

        // Verify Code
        if (!interview.otp || interview.otp !== otp) {
            console.warn(`❌ OTP mismatch for ${email}. Expected: ${interview.otp}, Received: ${otp}`);
            return res.status(400).json({ success: false, message: 'Invalid verification code.' });
        }

        // Verify Expiry
        if (new Date() > interview.otpExpires) {
            console.warn(`⏰ OTP expired for ${email}. Expired at: ${interview.otpExpires}`);
            return res.status(400).json({ success: false, message: 'Verification code expired.' });
        }

        console.log(`✅ ${email} verified successfully.`);
        // Clear OTP after success (One-time use)
        interview.otp = undefined;
        interview.otpExpires = undefined;
        await interview.save();

        // Generate Session Token
        const token = jwt.sign(
            { interviewId, email, role: 'candidate' },
            process.env.JWT_SECRET,
            { expiresIn: '24h' }
        );

        res.json({ success: true, token, message: 'Verification successful' });

    } catch (error) {
        console.error('OTP Verify Error:', error);
        res.status(500).json({ success: false, message: 'Verification failed' });
    }
};

/**
 * @desc    Interview Status Check Endpoint
 * @route   GET /api/interviews/status/:interviewId
 * @access  Public (Candidate)
 */
const checkInterviewStatus = async (req, res) => {
    try {
        const { interviewId } = req.params;
        const { email } = req.query;

        console.log(`🔍 Verifying status for interview ${interviewId} (email: ${email})`);

        // Simulate verification delay for UX as requested
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Find interview - we check both interviewId and candidateEmail if provided
        // Use a case-insensitive search if needed, but here simple find is okay
        const query = { interviewId: interviewId };
        if (email) {
            const escapedEmail = email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const emailRegex = new RegExp(`^${escapedEmail}$`, 'i');
            query.$or = [
                { candidateEmail: emailRegex },
                { candidateEmails: { $in: [emailRegex] } }
            ];
        }

        const interview = await Interview.findOne(query);

        if (!interview) {
            return res.status(404).json({
                status: 'not_found',
                message: 'Interview not found'
            });
        }

        // Check if interview is already completed
        if (['Completed', 'completed'].includes(interview.status) || interview.submittedAt) {
            return res.json({
                status: 'completed',
                completedAt: interview.submittedAt,
                message: 'This interview has already been completed'
            });
        }

        // Check if interview has expired
        if (interview.expiresAt && new Date() > new Date(interview.expiresAt)) {
            return res.json({
                status: 'expired',
                message: 'This interview link has expired'
            });
        }

        // Interview is valid and ready
        return res.json({
            status: 'ready',
            candidateName: interview.candidateName || 'Candidate',
            role: interview.role || interview.jobRole,
            interviewId: interview.interviewId
        });

    } catch (error) {
        console.error('Interview status check error:', error);
        res.status(500).json({
            status: 'error',
            message: 'Failed to verify interview status'
        });
    }
};

/**
 * @desc    Interview Initialization Endpoint
 * @route   POST /api/interviews/initialize/:interviewId
 * @access  Public (Candidate)
 */
const initializeInterview = async (req, res) => {
    try {
        const { interviewId } = req.params;
        const { email, name } = req.body;

        const query = { interviewId: interviewId };
        if (email) {
            const escapedEmail = email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const emailRegex = new RegExp(`^${escapedEmail}$`, 'i');
            query.$or = [
                { candidateEmail: emailRegex },
                { candidateEmails: { $in: [emailRegex] } }
            ];
        }

        const interview = await Interview.findOne(query);

        if (!interview) {
            return res.status(404).json({ error: 'Interview not found' });
        }

        // Prevent re-initialization of completed interviews
        if (['Completed', 'completed'].includes(interview.status)) {
            return res.status(403).json({
                error: 'Interview already completed',
                redirectTo: '/interview/completed'
            });
        }

        // NEW: Cooldown Restriction
        if (interview.isCooldownViolation) {
            return res.status(403).json({
                error: 'Cooldown active',
                message: `You have already attended an interview for this role at ${interview.companyName}. Please try again after the cooldown period.`
            });
        }

        // Update candidate email and name if provided
        if (email && !interview.candidateEmail) {
            interview.candidateEmail = email.toLowerCase().trim();
        }
        if (name && !interview.candidateName) {
            interview.candidateName = name.trim();
        }

        // Security Check: Verify Token if present (Enforce if strictly required)
        // If we want to be strict, we check req.headers.authorization
        // For backward compat "without affecting other logic", we just log/allow for now or check if token is valid.
        if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
            try {
                const token = req.headers.authorization.split(' ')[1];
                const decoded = jwt.verify(token, process.env.JWT_SECRET);
                if (decoded.interviewId !== interviewId || decoded.email.toLowerCase() !== email.toLowerCase().trim()) {
                    console.warn(`⚠️ Token mismatch for interview ${interviewId}`);
                    // potentially return 401
                } else {
                    console.log(`🔒 Secure session initialized for ${email}`);
                }
            } catch (err) {
                console.warn(`⚠️ Invalid token for interview initialization:`, err.message);
            }
        }

        // Mark interview as started (if not already)
        if (interview.status === 'Created' || interview.status === 'Active' || interview.status === 'pending') {
            interview.status = 'in_progress';
            if (!interview.startedAt) {
                interview.startedAt = new Date();
            }
        }
        await interview.save();

        // Get interview questions for this specific interviewId
        let questionsData = await Question.findOne({
            interviewId: interview.interviewId,
            isActive: true
        });

        let questions = [];
        if (questionsData && questionsData.questions) {
            questions = questionsData.questions;
        } else if (interview.questions && interview.questions.length > 0) {
            // Fallback to questions stored in the interview object
            questions = interview.questions;
        }

        const role = interview.role || interview.jobRole;

        // Create AI agent context
        const aiContext = {
            interviewId: interview.interviewId,
            candidateName: interview.candidateName || 'Candidate',
            role: role,
            companyName: interview.companyName || 'AI Talent Hub',
            duration: interview.duration || 15, // Default to 15 mins if not set
            questions: questions,
            currentQuestionIndex: interview.currentQuestionIndex || 0,
            sessionStarted: interview.startedAt,
            // Add system prompt to context
            systemPrompt: `You are "HireAI", an expert AI Recruiter. You are interviewing ${interview.candidateName || 'the candidate'} for the ${role} position. 
 Your goal is to assess their technical skills and soft skills.
 \n\nJob Description: ${interview.jobDescription || 'Standard role requirements.'}
 \n\nQuestions to ask:\n${questions.map((q, i) => `${i + 1}. ${q.question}`).join('\n')}
 \n\nRules:
 - Be professional but friendly.
 - Ask one question at a time.
 - Wait for the candidate's answer.
 - Dig deeper if the answer is too short.`,
        };

        // Try to restore previous progress from InterviewSession
        try {
            const InterviewSession = require('../models/InterviewSession');
            const session = await InterviewSession.findOne({
                interviewId: interview.interviewId,
                candidateEmail: email ? email.toLowerCase().trim() : undefined
            });

            if (session) {
                // Restore transcript
                const restoredTranscript = session.currentTranscript?.length > 0
                    ? session.currentTranscript
                    : session.transcript;

                if (restoredTranscript && restoredTranscript.length > 0) {
                    aiContext.previousTranscript = restoredTranscript;
                    console.log(`📜 Restored ${restoredTranscript.length} messages from session for ${email}`);

                    // Analyze the last message to determine continuity strategy
                    const lastMessage = restoredTranscript[restoredTranscript.length - 1];
                    const lastWasAI = lastMessage.role === 'assistant' || lastMessage.role === 'agent';

                    const historyText = restoredTranscript
                        .filter(m => m.role !== 'system')
                        .slice(-12) // Slightly more context
                        .map(m => `${(m.role === 'assistant' || m.role === 'agent') ? 'AI' : 'Candidate'}: ${m.content}`)
                        .join('\n');

                    aiContext.systemPrompt += `\n\n### [INTERVIEW RESUMPTION MODE]
You are resuming an interrupted interview. 
RECENT HISTORY:
${historyText}

INSTRUCTIONS:
1. DO NOT greet the candidate again. 
2. CRITICAL: Look at the RECENT HISTORY. If the last message was a question from you (AI) and there is no answer from the Candidate yet, you MUST repeat that exact question.
3. If the candidate answered the last question, only then move to the next one.
4. Review the timeline to ensure continuity.
5. If the Experience Check (Step 2) was already done, jump straight to technical questions (Step 3).`;
                }

                // Sync Timer
                if (session.timerStartTimestamp) {
                    aiContext.timerStartTimestamp = session.timerStartTimestamp;
                }

                // Sync Violations
                if (session.violations) {
                    aiContext.violations = session.violations;
                }
                if (session.tab_switch_count) {
                    aiContext.tab_switch_count = session.tab_switch_count;
                }
            } else {
                // Fallback to InterviewResult if session missing (for edge cases)
                const InterviewResult = require('../models/InterviewResult');
                const result = await InterviewResult.findOne({
                    interviewId: interview.interviewId,
                    email: email?.toLowerCase().trim()
                });
                if (result?.conversationTranscript) {
                    aiContext.previousTranscript = result.conversationTranscript;
                }
            }
        } catch (e) {
            console.warn('Failed to restore progress:', e);
        }

        res.json({
            success: true,
            interview: {
                id: interview.interviewId,
                candidateName: interview.candidateName || 'Candidate',
                role: role,
                status: 'in_progress',
                interviewType: interview.interviewType
            },
            aiContext: aiContext
        });

    } catch (error) {
        console.error('Interview initialization error:', error);
        res.status(500).json({ error: 'Failed to initialize interview' });
    }
};

/**
 * @desc    Interview Submission Endpoint (Fixed)
 * @route   POST /api/interviews/submit/:interviewId
 * @access  Public (Candidate)
 */
const submitInterview = async (req, res) => {
    try {
        const { interviewId } = req.params;
        const { email, responses, duration } = req.body;

        const query = { interviewId: interviewId };
        if (email) {
            const escapedEmail = email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const emailRegex = new RegExp(`^${escapedEmail}$`, 'i');
            query.$or = [
                { candidateEmail: emailRegex },
                { candidateEmails: { $in: [emailRegex] } }
            ];
        }

        const interview = await Interview.findOne(query);

        if (!interview) {
            return res.status(404).json({ error: 'Interview not found' });
        }

        if (['Completed', 'completed', 'Terminated', 'terminated'].includes(interview.status) || interview.submittedAt) {
            console.log(`ℹ️ Interview ${interviewId} already finalized for ${email}`);
            return res.json({
                success: true,
                message: 'Interview already submitted or terminated',
                submittedAt: interview.submittedAt
            });
        }

        // Handle termination status if passed or if already terminated (preserve the reason)
        const isTerminated = interview.status === 'Terminated' || req.body.status === 'Terminated' || req.body.status === 'terminated';
        interview.status = isTerminated ? 'Terminated' : 'Completed';
        interview.submittedAt = new Date();

        // Ensure responses is an array
        interview.responses = Array.isArray(responses) ? responses : [];

        // Ensure duration is a number (if passed as string/null)
        if (duration !== undefined) {
            const parsedDuration = typeof duration === 'number' ? duration : parseInt(duration);
            if (!isNaN(parsedDuration)) {
                interview.duration = parsedDuration;
            }
        }

        interview.completedBy = email;

        await interview.save();

        console.log(`✅ Interview ${interviewId} submitted by ${email} (Status: ${interview.status})`);

        res.json({
            success: true,
            message: 'Interview submitted successfully',
            redirectTo: '/interview/completed'
        });

    } catch (error) {
        console.error('Interview submission error:', error);
        // Return specifics if it's a validation error
        if (error.name === 'ValidationError') {
            console.error('Validation Details:', error.errors);
            return res.status(400).json({
                error: 'Validation Error',
                details: Object.keys(error.errors).map(k => `${k}: ${error.errors[k].message}`)
            });
        }
        res.status(500).json({ error: 'Failed to submit interview: ' + error.message });
    }
};

/**
 * @desc    Get AI Agent Context for Active Interview
 * @route   GET /api/interviews/ai-context/:interviewId
 * @access  Public (Candidate)
 */
const getAiContext = async (req, res) => {
    try {
        const { interviewId } = req.params;
        const { email } = req.query;

        const query = {
            interviewId: interviewId,
            status: 'in_progress'
        };

        if (email) {
            const escapedEmail = email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const emailRegex = new RegExp(`^${escapedEmail}$`, 'i');
            query.$or = [
                { candidateEmail: emailRegex },
                { candidateEmails: { $in: [emailRegex] } }
            ];
        }

        const interview = await Interview.findOne(query);

        if (!interview) {
            return res.status(403).json({
                error: 'Interview not accessible or already completed'
            });
        }

        const role = interview.role || interview.jobRole;

        // Fetch questions for this specific interviewId
        let questionsData = await Question.findOne({
            interviewId: interview.interviewId,
            isActive: true
        });

        let questions = [];
        if (questionsData && questionsData.questions) {
            questions = questionsData.questions;
        } else if (interview.questions && interview.questions.length > 0) {
            // Fallback
            questions = interview.questions;
        }

        // Build comprehensive AI context
        const aiContext = {
            systemPrompt: `You are conducting a technical interview for the position of ${role}.
Candidate Name: ${interview.candidateName || 'Candidate'}
Company: ${interview.companyName || 'AI Talent Hub'}

Interview Questions:
${questions.map((q, idx) => `${idx + 1}. ${q.question}`).join('\n')}

Guidelines:
- Be professional and friendly
- Ask questions one at a time
- Evaluate answers based on role requirements
- Provide follow-up questions when appropriate
- Keep track of interview progress`,

            candidateInfo: {
                name: interview.candidateName || 'Candidate',
                email: interview.candidateEmail || email,
                role: role
            },

            interviewConfig: {
                interviewId: interview.interviewId,
                totalQuestions: questions.length,
                currentQuestion: interview.currentQuestionIndex || 0,
                questions: questions
            }
        };

        res.json(aiContext);

    } catch (error) {
        console.error('AI context fetch error:', error);
        res.status(500).json({ error: 'Failed to get AI context' });
    }
};

module.exports = {
    checkInterviewStatus,
    initializeInterview,
    submitInterview,
    getAiContext,
    requestOtp,
    verifyOtp
};
