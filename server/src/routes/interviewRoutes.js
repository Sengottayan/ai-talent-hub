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
router.post('/coding-execute', upload.none(), async (req, res) => {
    try {
        const { language, code, testCases } = req.body;
        if (!code) {
            return res.status(400).json({ success: false, message: "Code is required" });
        }

        // We use Piston API for free code execution
        let pistonLang = language.toLowerCase();
        let version = "*";

        if (pistonLang === 'c#') pistonLang = 'csharp';
        if (pistonLang === 'c++') pistonLang = 'cpp';

        try {
            const fs = require('fs');
            const path = require('path');
            const os = require('os');
            const crypto = require('crypto');
            const { exec } = require('child_process');

            const executeLocally = (lang, codeStr, stdInp) => {
                return new Promise((resolve) => {
                    const uniqueId = crypto.randomBytes(8).toString('hex');
                    const tmpDir = os.tmpdir();
                    if (lang === 'javascript') {
                        const filePath = path.join(tmpDir, `${uniqueId}.js`);
                        fs.writeFileSync(filePath, codeStr);
                        const child = exec(`node "${filePath}"`, { timeout: 5000 }, (error, stdout, stderr) => {
                            try { fs.unlinkSync(filePath); } catch (e) { }
                            resolve({ output: stdout, stderr: stderr || (error ? error.message : '') });
                        });
                        if (stdInp) { child.stdin.write(stdInp); child.stdin.end(); }
                    } else if (lang === 'python') {
                        const filePath = path.join(tmpDir, `${uniqueId}.py`);
                        fs.writeFileSync(filePath, codeStr);
                        const child = exec(`python "${filePath}"`, { timeout: 5000 }, (error, stdout, stderr) => {
                            try { fs.unlinkSync(filePath); } catch (e) { }
                            resolve({ output: stdout, stderr: stderr || (error ? error.message : '') });
                        });
                        if (stdInp) { child.stdin.write(stdInp); child.stdin.end(); }
                    } else if (lang === 'java') {
                        const dirPath = path.join(tmpDir, uniqueId);
                        fs.mkdirSync(dirPath);
                        // Make sure the class is named Main or matches the template
                        const filePath = path.join(dirPath, `Main.java`);
                        fs.writeFileSync(filePath, codeStr);
                        exec(`javac "${filePath}"`, { timeout: 5000 }, (error, stdout, stderr) => {
                            if (error) {
                                try { fs.rmSync(dirPath, { recursive: true, force: true }); } catch (e) { }
                                resolve({ output: '', stderr: stderr || error.message });
                            } else {
                                const child = exec(`java -cp "${dirPath}" Main`, { timeout: 5000 }, (err2, out2, stderr2) => {
                                    try { fs.rmSync(dirPath, { recursive: true, force: true }); } catch (e) { }
                                    resolve({ output: out2, stderr: stderr2 || (err2 ? err2.message : '') });
                                });
                                if (stdInp) { child.stdin.write(stdInp); child.stdin.end(); }
                            }
                        });
                    } else {
                        resolve({ output: '', stderr: `${lang} is not supported for local execution.` });
                    }
                });
            };

            let parsedTestCases = [];
            try {
                if (testCases) parsedTestCases = JSON.parse(testCases);
            } catch (e) { }

            if (parsedTestCases && parsedTestCases.length > 0) {
                // Evaluate against test cases
                let allOutput = "";
                let allPassed = true;
                const results = [];
                for (let i = 0; i < parsedTestCases.length; i++) {
                    const tc = parsedTestCases[i];
                    try {
                        const response = await executeLocally(pistonLang, code, tc.input || "");
                        const runOut = (response.output || "").trim();
                        const runErr = response.stderr || "";

                        allOutput += `--- Test Case ${i + 1} ---\n`;
                        allOutput += `Input: \n${tc.input}\n`;
                        allOutput += `Expected Output: \n${tc.output}\n`;
                        allOutput += `Your Output: \n${runOut}\n`;
                        if (runErr) allOutput += `Errors: \n${runErr}\n`;

                        // Compare ignoring whitespace
                        const normalize = (str) => (str || "").replace(/\s+/g, ' ').trim();
                        const passed = normalize(runOut) === normalize(tc.output);
                        allOutput += `Result: ${passed ? '✅ PASSED' : '❌ FAILED'}\n\n`;
                        if (!passed) allPassed = false;

                        results.push({
                            input: tc.input,
                            expectedOutput: tc.output,
                            actualOutput: runOut,
                            passed: passed
                        });
                    } catch (err) {
                        allOutput += `--- Test Case ${i + 1} ---\nFailed to locally execute: ${err.message}\n\n`;
                        allPassed = false;
                    }
                }

                return res.status(200).json({
                    success: true,
                    output: allOutput,
                    stderr: '',
                    results,
                    allPassed
                });
            } else {
                // Run without test cases
                const response = await executeLocally(pistonLang, code, "");
                return res.status(200).json({
                    success: true,
                    output: response.output,
                    stderr: response.stderr,
                    code: code
                });
            }
        } catch (execError) {
            console.error("Local code execution error:", execError.message);
            return res.status(200).json({
                success: false,
                message: 'Local execution failed.',
                stderr: execError.message
            });
        }
    } catch (error) {
        console.error('Coding execute error:', error);
        res.status(500).json({ success: false, message: error.message });
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
