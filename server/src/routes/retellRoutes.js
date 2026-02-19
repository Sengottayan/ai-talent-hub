const express = require('express');
const router = express.Router();
const { createWebCall } = require('../controllers/retellController');

router.post('/create-web-call', createWebCall);

module.exports = router;
