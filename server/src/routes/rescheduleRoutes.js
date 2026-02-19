const express = require('express');
const router = express.Router();
const {
    getRescheduleRequests,
    createRescheduleRequest,
    approveRescheduleRequest,
    rejectRescheduleRequest,
    updateRescheduleStatus,
    confirmReschedule,
    pendingReschedule,
    getRescheduleStatus,
    getRescheduleByInterview,
    confirmRescheduleCandidate
} = require('../controllers/rescheduleController');
const { protectServer } = require('../middleware/authMiddleware');

// ── Candidate Routes ──────────────────────────────────────────────────────────
router.post('/', createRescheduleRequest);          // Submit reschedule request
router.post('/request', createRescheduleRequest);   // Alias
router.get('/interview/:interviewId', getRescheduleByInterview);
router.post('/:id/candidate-confirm', confirmRescheduleCandidate);

// ── HR Management Routes ──────────────────────────────────────────────────────
router.get('/', getRescheduleRequests);                         // List all requests
router.put('/:id', updateRescheduleStatus);                     // Generic status update (fallback)
router.post('/:id/approve', approveRescheduleRequest);          // HR Approve → triggers n8n
router.post('/:id/reject', rejectRescheduleRequest);            // HR Reject  → sends rejection email

// ── Status Check ──────────────────────────────────────────────────────────────
router.get('/:id/status', getRescheduleStatus);

// ── n8n Webhook Callbacks (protected by server secret) ───────────────────────
// n8n calls /confirm when requested date is available
router.post('/confirm', protectServer, confirmReschedule);
// n8n calls /pending when date is unavailable (sends alternative dates)
router.post('/pending', protectServer, pendingReschedule);

module.exports = router;
