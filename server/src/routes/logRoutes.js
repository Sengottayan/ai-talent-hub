const express = require('express');
const router = express.Router();
const { getEvaluationLogs, getIncidents } = require('../controllers/logController');

router.get('/evaluations', getEvaluationLogs);
router.get('/incidents', getIncidents);

module.exports = router;
