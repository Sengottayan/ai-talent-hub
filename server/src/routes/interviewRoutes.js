const express = require('express');
const router = express.Router();
const multer = require('multer');
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 }
});
const { draftInterviewController, finalizeInterviewController, submitFeedbackController, getAllInterviewsController, getInterviewController, resendInterviewLinkController, getCandidateInterviewsController, updateInterviewDate, shareInterviewLinkController } = require('../controllers/interviewController');
const { saveInterviewSessionController, getInterviewSessionController, terminateInterviewSessionController, claimSessionController } = require('../controllers/interviewSessionController');
const { getAllResults, getResultsByInterview, upsertResult } = require('../controllers/interviewResultController');
const { generateRetellToken, handleRetellWebhook } = require('../controllers/retellController');
const { finalizeInterview } = require('../controllers/feedbackController');
const { logAntiCheatingEvent, getAntiCheatingState, getAntiCheatingEvents } = require('../controllers/antiCheatingController');
const { checkInterviewStatus, initializeInterview, submitInterview, getAiContext, requestOtp, verifyOtp } = require('../controllers/interviewStatusController');
const { protect, authorizeRole } = require('../middleware/authMiddleware');

// New Status & Session Management
router.get('/status/:interviewId', checkInterviewStatus);
router.post('/initialize/:interviewId', upload.none(), initializeInterview);
router.post('/submit/:interviewId', upload.none(), submitInterview);
router.get('/ai-context/:interviewId', getAiContext);

// OTP Routes (Secure Candidate Access)
router.post('/otp/request', requestOtp);
router.post('/otp/verify', verifyOtp);

router.get('/all', protect, authorizeRole('recruiter', 'admin'), getAllInterviewsController);
router.get('/my-interviews/:email', getCandidateInterviewsController);
router.patch('/:id/date', updateInterviewDate);

// Step 1: Draft (Uploads & Generation)
router.post('/draft', protect, authorizeRole('recruiter', 'admin'), upload.array('resumes', 10), draftInterviewController);

// Step 2: Finalize (Save & Send)
router.post('/finalize', protect, authorizeRole('recruiter', 'admin'), upload.none(), finalizeInterviewController);
router.post('/resend/:id', protect, authorizeRole('recruiter', 'admin'), resendInterviewLinkController);
router.post('/share/:id', protect, authorizeRole('recruiter', 'admin'), upload.none(), shareInterviewLinkController);

// Step 3: Feedback
router.post('/feedback', upload.none(), submitFeedbackController);

// NEW: Retell AI Integration
router.post('/retell/token', upload.none(), generateRetellToken);
router.post('/retell/webhook', upload.none(), handleRetellWebhook);

// NEW: Voice Interview Finalization with AI Feedback
router.post('/finalize-session', upload.none(), finalizeInterview);

// Session Management (Save/Restore)
router.post('/session/save', upload.none(), saveInterviewSessionController);
router.post('/session/terminate', upload.none(), terminateInterviewSessionController);
router.post('/session/claim', upload.none(), claimSessionController);
router.get('/session/:interviewId/:email', getInterviewSessionController);

// NEW: Anti-Cheating
router.post('/anti-cheating-event', upload.none(), logAntiCheatingEvent);
router.get('/anti-cheating-state/:interviewId/:email', getAntiCheatingState);
router.get('/anti-cheating-events/:interviewId/:email', getAntiCheatingEvents);

// NEW: Coding Execution
// NEW: Coding Execution (Secure Production Sandbox)
router.post('/coding-execute', upload.none(), async (req, res) => {
    try {
        const { language, code, testCases } = req.body;
        if (!code) {
            return res.status(400).json({ success: false, message: "Code is required" });
        }

        const languageMap = {
            'javascript': { language: 'js', version: '18.15.0' },
            'python': { language: 'python', version: '3.10.0' },
            'java': { language: 'java', version: '15.0.2' },
            'cpp': { language: 'cpp', version: '10.2.0' },
            'csharp': { language: 'csharp', version: '6.12.0' }
        };

        const target = languageMap[language.toLowerCase()] || { language: language.toLowerCase(), version: '*' };
        let parsedTestCases = [];
        try { if (testCases) parsedTestCases = typeof testCases === 'string' ? JSON.parse(testCases) : testCases; } catch (e) { }

        const executeOnPiston = async (sourceCode, stdin = "") => {
            const resp = await axios.post('https://emkc.org/api/v2/piston/execute', {
                language: target.language,
                version: target.version,
                files: [{ content: sourceCode }],
                stdin: stdin
            }, { timeout: 10000 });
            return resp.data;
        };

        if (parsedTestCases && parsedTestCases.length > 0) {
            let allOutput = "";
            let allPassed = true;
            const results = [];
            for (let i = 0; i < parsedTestCases.length; i++) {
                const tc = parsedTestCases[i];
                try {
                    const result = await executeOnPiston(code, tc.input || "");
                    const runOut = (result.run?.stdout || "").trim();
                    const runErr = (result.run?.stderr || "").trim();
                    allOutput += `--- Test Case ${i + 1} ---\nInput: ${tc.input}\nExpected: ${tc.output}\nOutput: ${runOut}\n${runErr ? 'Errors: ' + runErr + '\n' : ''}`;
                    const normalize = (str) => (str || "").replace(/\s+/g, ' ').trim();
                    const passed = normalize(runOut) === normalize(tc.output);
                    allOutput += `Result: ${passed ? '✅ PASSED' : '❌ FAILED'}\n\n`;
                    if (!passed) allPassed = false;
                    results.push({ input: tc.input, expectedOutput: tc.output, actualOutput: runOut, passed });
                } catch (err) {
                    allOutput += `--- Test Case ${i + 1} ---\nExecution Error: ${err.message}\n\n`;
                    allPassed = false;
                }
            }
            return res.status(200).json({ success: true, output: allOutput, results, allPassed });
        } else {
            const result = await executeOnPiston(code, "");
            return res.status(200).json({ success: true, output: result.run?.stdout || "", stderr: result.run?.stderr || "", code });
        }
    } catch (error) {
        console.error('Coding execute error:', error.message);
        res.status(500).json({ success: false, message: "Sandbox execution failed." });
    }
});

// NEW: Coding Submission
router.post('/coding-submission', upload.none(), async (req, res) => {
    try {
        const ProblemSolvingSubmission = require('../models/ProblemSolvingSubmission');
        const InterviewResult = require('../models/InterviewResult');
        const { interview_id, email, candidate_name, submission } = req.body;

        const cleanEmail = email.toLowerCase().trim();

        // 1. Save detailed submission for this specific question
        await ProblemSolvingSubmission.findOneAndUpdate(
            {
                interviewId: interview_id,
                candidateEmail: cleanEmail,
                questionIndex: submission.questionIndex
            },
            {
                ...submission,
                interviewId: interview_id,
                candidateEmail: cleanEmail
            },
            { upsert: true, new: true }
        );

        // 2. Update summary in InterviewResult
        // We push to an array or update a map if we want to keep it in InterviewResult too
        await InterviewResult.findOneAndUpdate(
            { interview_id, email: cleanEmail },
            {
                candidate_name: candidate_name,
                $set: { 'metadata.codingCompletedAt': new Date() },
                // For backward compatibility with existing codingSubmission field
                // but we might want to change this to an array if it isn't already
                codingSubmission: submission
            },
            { upsert: true }
        );

        console.log(`✅ Coding submission saved for ${cleanEmail} (Question ${submission.questionIndex})`);
        res.status(200).json({ success: true, message: 'Coding submission saved' });
    } catch (error) {
        console.error('Coding submission error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Get coding submissions
router.get('/coding-submissions/:interviewId/:email', protect, authorizeRole('recruiter', 'admin'), async (req, res) => {
    try {
        const ProblemSolvingSubmission = require('../models/ProblemSolvingSubmission');
        const submissions = await ProblemSolvingSubmission.find({
            interviewId: req.params.interviewId,
            candidateEmail: req.params.email.toLowerCase().trim()
        }).sort({ questionIndex: 1 });
        res.status(200).json({ success: true, data: submissions });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Interview Results
router.get('/results/all', protect, authorizeRole('recruiter', 'admin'), getAllResults);
router.get('/results/:interviewId', protect, authorizeRole('recruiter', 'admin'), getResultsByInterview);
router.post('/results', upload.none(), upsertResult);

// Public: Get Interview
router.get('/:id', getInterviewController);

module.exports = router;
