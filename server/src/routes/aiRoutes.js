const express = require('express');
const router = express.Router();
const { generateJobDescription, suggestSkills } = require('../controllers/aiController');

router.post('/generate-description', generateJobDescription);
router.post('/suggest-skills', suggestSkills);


module.exports = router;
