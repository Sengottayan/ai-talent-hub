const express = require('express');
const router = express.Router();
const { createJob, getShortlistedCandidates, getCandidates } = require('../controllers/candidateController');
const { protect } = require('../middleware/authMiddleware');

router.route('/job').post(protect, createJob); // Replaces /upload
router.route('/shortlisted').get(protect, getShortlistedCandidates);
router.route('/').get(protect, getCandidates);

module.exports = router;
