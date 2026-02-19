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

// NEW: Coding Submission
router.post('/coding-submission', upload.none(), async (req, res) => {
    try {
        const InterviewResult = require('../models/InterviewResult');
        const { interview_id, email, candidate_name, submission } = req.body;

        await InterviewResult.findOneAndUpdate(
            { interview_id, email: email.toLowerCase().trim() },
            {
                codingSubmission: submission,
                $set: { 'metadata.codingCompleted': true }
            },
            { upsert: true }
        );

        console.log(`✅ Coding submission saved for ${email}`);
        res.status(200).json({ success: true, message: 'Coding submission saved' });
    } catch (error) {
        console.error('Coding submission error:', error);
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
