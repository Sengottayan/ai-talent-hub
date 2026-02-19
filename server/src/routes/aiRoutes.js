const express = require('express');
const router = express.Router();
const { generateJobDescription } = require('../controllers/aiController');

router.post('/generate-description', generateJobDescription);

module.exports = router;
