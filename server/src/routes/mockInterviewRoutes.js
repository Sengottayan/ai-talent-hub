const express = require('express');
const router = express.Router();
const multer = require('multer');
const {
    createMockInterviewController,
    getCandidateInterviewHistoryController,
    getMockInterviewStatsController
} = require('../controllers/mockInterviewController');

const upload = multer({ storage: multer.memoryStorage() });

// Create a new mock interview session
router.post('/create', upload.none(), createMockInterviewController);

// Get candidate's interview history
router.get('/history/:email', getCandidateInterviewHistoryController);

// Get mock interview statistics
router.get('/stats/:email', getMockInterviewStatsController);

module.exports = router;
