const AntiCheatingEvent = require('../models/AntiCheatingEvent');
const InterviewSession = require('../models/InterviewSession');
const InterviewResult = require('../models/InterviewResult');
const Interview = require('../models/Interview');

// Scoring rules for different event types
// IMPORTANT: All values must be >= 0. Score NEVER decreases.
const SCORING_RULES = {
    visibility_hidden: 2,     // Tab switch, minimize, screen lock
    window_blur: 1,           // Window lost focus (different app). Only fires if tab is still visible.
    window_focus: 0,          // Return to interview — not penalized, just logged
    mouse_leave: 0,           // Not used (too noisy)
    mouse_enter: 0,           // Not used
    multi_face_detected: 3,   // High penalty: multiple people visible in camera
    no_face_detected: 1,      // Medium penalty: candidate not visible in camera
};

// Minimum seconds between two events of the same type for the SAME interview+email
// Server-side deduplication: protects against frontend/reconnect duplicate sends
const SERVER_SIDE_COOLDOWN_SECS = {
    visibility_hidden: 2,
    window_blur: 5,
    window_focus: 2,
    multi_face_detected: 15,
    no_face_detected: 15,
};

const MAX_ALLOWED_SCORE = 10;

/**
 * @desc    Log and process anti-cheating event
 * @route   POST /api/interviews/anti-cheating-event
 * @access  Public (Candidate)
 */
const logAntiCheatingEvent = async (req, res) => {
    try {
        const {
            interview_id,
            email,
            clientId, // NEW: Enforce client identity
            candidate_name,
            event_type,
            timestamp,
            timestamp_str,
            durationMs,
            faceCount   // For multi_face_detected events
        } = req.body;

        if (!interview_id || !email || !event_type) {
            return res.status(400).json({
                success: false,
                message: 'Missing required fields: interview_id, email, event_type'
            });
        }

        const normalizedEmail = email.toLowerCase().trim();

        // SECURITY CHECK: Verify clientId against active session
        const session = await InterviewSession.findOne({
            interviewId: interview_id,
            candidateEmail: normalizedEmail
        });

        if (session && session.activeSessionId && clientId && session.activeSessionId !== clientId) {
            const lastUpdate = session.updatedAt ? new Date(session.updatedAt).getTime() : 0;
            const diff = (Date.now() - lastUpdate) / 1000;

            // If the active session is fresh (< 30s), ignore this event from an inactive client
            if (diff < 30) {
                return res.status(200).json({
                    success: false,
                    conflict: true,
                    message: "Event ignored: session active on another device/tab."
                });
            }
        }

        // Get the LATEST event of the SAME type for this interview + candidate
        // (for per-type cooldown deduplication)
        const latestSameTypeEvent = await AntiCheatingEvent.findOne({
            interview_id,
            email: normalizedEmail,
            event_type
        }).sort({ createdAt: -1 });

        // Server-side cooldown: reject duplicate events within cooldown window
        const cooldownSecs = SERVER_SIDE_COOLDOWN_SECS[event_type];
        if (cooldownSecs && latestSameTypeEvent) {
            const elapsedSecs = (Date.now() - new Date(latestSameTypeEvent.createdAt).getTime()) / 1000;
            if (elapsedSecs < cooldownSecs) {
                console.log(`[ACE] Suppressing duplicate "${event_type}" — fired ${elapsedSecs.toFixed(1)}s ago (cooldown: ${cooldownSecs}s)`);
                // Return current state without modifying score
                const latestEvent = await AntiCheatingEvent.findOne({
                    interview_id,
                    email: normalizedEmail
                }).sort({ createdAt: -1 });
                return res.status(200).json({
                    suspicious_score: latestEvent?.suspicious_score ?? 0,
                    max_allowed_score: MAX_ALLOWED_SCORE,
                    interview_status: latestEvent?.interview_status ?? 'active',
                    event_type,
                    score_change: 0,
                    deduplicated: true
                });
            }
        }

        // Get the latest event for this interview + candidate (for current score)
        const latestEvent = await AntiCheatingEvent.findOne({
            interview_id,
            email: normalizedEmail
        }).sort({ createdAt: -1 });

        // Calculate new score — STRICTLY NON-DECREASING (Math.max prevents any negative change)
        const currentScore = latestEvent ? latestEvent.suspicious_score : 0;
        const scoreChange = Math.max(0, SCORING_RULES[event_type] ?? 0); // Never negative
        const newScore = currentScore + scoreChange; // No Math.max(0,...) needed since scoreChange >= 0

        // Check if interview was already auto-completed
        let interviewStatus = latestEvent?.interview_status || 'active';

        // If score exceeds threshold, mark as auto-completed
        if (newScore >= MAX_ALLOWED_SCORE && interviewStatus === 'active') {
            interviewStatus = 'auto_completed';

            // Update interview session status
            console.log(`🔍 Auto-terminating session: ${interview_id} for ${normalizedEmail}`);
            const sessionUpdate = await InterviewSession.findOneAndUpdate(
                { interviewId: interview_id, candidateEmail: normalizedEmail },
                {
                    sessionStatus: 'terminated',
                    completedAt: new Date(),
                    $push: {
                        violations: {
                            type: 'auto_termination',
                            timestamp: new Date(),
                            reason: `Exceeded ${MAX_ALLOWED_SCORE} violation threshold`
                        }
                    }
                },
                { new: true }
            );
            console.log(`✅ Session status updated: ${sessionUpdate?.sessionStatus || 'Failed'}`);

            // Update interview result
            console.log(`🔍 Updating interview result: ${interview_id}`);
            const resultUpdate = await InterviewResult.findOneAndUpdate(
                { interview_id, email: normalizedEmail },
                {
                    completedAt: new Date(),
                    isCompleted: true,
                    violationCount: newScore,
                    antiCheatingState: {
                        total_focus_loss_events: newScore,
                        auto_terminated: true,
                        termination_reason: 'Exceeded violation threshold'
                    }
                },
                { new: true }
            );
            console.log(`✅ Result status updated: ${resultUpdate?.isCompleted ? 'Completed' : 'Failed'}`);

            // Update main Interview status
            const interviewUpdate = await Interview.findOneAndUpdate(
                { interviewId: interview_id },
                { status: 'Terminated' },
                { new: true }
            );
            console.log(`✅ Main interview status updated: ${interviewUpdate?.status || 'Failed'}`);
        }

        // SYNC WITH INTERVIEW SESSION (For persistence across reloads)
        const sessionUpdateData = {
            $set: {
                tab_switch_count: newScore // Using current score as a proxy for total violations
            }
        };

        // Only push significant violations to session record to keep it clean
        if (scoreChange > 0) {
            sessionUpdateData.$push = {
                violations: {
                    type: event_type,
                    timestamp: new Date(),
                    duration: durationMs || 0,
                    reason: `Violation detected at ${timestamp_str || '00:00'}`
                }
            }
        }

        await InterviewSession.findOneAndUpdate(
            { interviewId: interview_id, candidateEmail: normalizedEmail },
            sessionUpdateData
        ).catch(e => console.warn("Failed to sync AC event to session:", e.message));

        // Create new event record
        const event = await AntiCheatingEvent.create({
            interview_id,
            email: normalizedEmail,
            candidate_name,
            event_type,
            timestamp: timestamp || new Date(),
            timestamp_str: timestamp_str || '00:00',
            duration_ms: durationMs || 0,
            suspicious_score: newScore,
            max_allowed_score: MAX_ALLOWED_SCORE,
            interview_status: interviewStatus,
            ...(faceCount != null && { faceCount })  // Store face count for multi_face_detected events
        });

        // Return current state
        res.status(200).json({
            id: event._id,
            suspicious_score: newScore,
            max_allowed_score: MAX_ALLOWED_SCORE,
            interview_status: interviewStatus,
            event_type,
            score_change: scoreChange
        });

    } catch (error) {
        console.error('Anti-Cheating Event Error:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

/**
 * @desc    Get current anti-cheating state
 * @route   GET /api/interviews/anti-cheating-state/:interviewId/:email
 * @access  Public (Candidate)
 */
const getAntiCheatingState = async (req, res) => {
    try {
        const { interviewId, email } = req.params;
        const normalizedEmail = email.toLowerCase().trim();

        // Get latest event
        const latestEvent = await AntiCheatingEvent.findOne({
            interview_id: interviewId,
            email: normalizedEmail
        }).sort({ createdAt: -1 });

        if (!latestEvent) {
            return res.status(200).json({
                suspicious_score: 0,
                max_allowed_score: MAX_ALLOWED_SCORE,
                interview_status: 'active',
                total_events: 0
            });
        }

        // Get total event count
        const totalEvents = await AntiCheatingEvent.countDocuments({
            interview_id: interviewId,
            email: normalizedEmail
        });

        res.status(200).json({
            suspicious_score: latestEvent.suspicious_score,
            max_allowed_score: latestEvent.max_allowed_score,
            interview_status: latestEvent.interview_status,
            total_events: totalEvents,
            last_event_type: latestEvent.event_type,
            last_event_time: latestEvent.timestamp
        });

    } catch (error) {
        console.error('Get Anti-Cheating State Error:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

/**
 * @desc    Get all anti-cheating events for an interview
 * @route   GET /api/interviews/anti-cheating-events/:interviewId/:email
 * @access  Private (Recruiter)
 */
const getAntiCheatingEvents = async (req, res) => {
    try {
        const { interviewId, email } = req.params;
        const normalizedEmail = email.toLowerCase().trim();

        const events = await AntiCheatingEvent.find({
            interview_id: interviewId,
            email: normalizedEmail
        }).sort({ createdAt: 1 });

        res.status(200).json({
            success: true,
            count: events.length,
            data: events
        });

    } catch (error) {
        console.error('Get Anti-Cheating Events Error:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

module.exports = {
    logAntiCheatingEvent,
    getAntiCheatingState,
    getAntiCheatingEvents
};
