const InterviewSession = require('../models/InterviewSession');
const Interview = require('../models/Interview');

// @desc    Save or Update Interview Session
// @route   POST /api/interviews/session/save
// @access  Public (Candidate)
const saveInterviewSessionController = async (req, res) => {
    try {
        const {
            interviewId,
            candidateEmail,
            clientId, // NEW: Enforce client identity
            transcript,
            violations,
            currentTranscript,
            timerStartTimestamp,
            timerEndTimestamp,
            status,
            feedback,
            tab_switch_count,
            back_navigation_attempts,
            warnings
        } = req.body;

        if (!interviewId || !candidateEmail) {
            return res.status(400).json({ message: "Interview ID and Email are required." });
        }

        // Find existing session
        let session = await InterviewSession.findOne({ interviewId, candidateEmail });

        if (session) {
            // SECURITY CHECK: Verify clientId if provided to prevent "zombie tab" overwrites
            if (clientId && session.activeSessionId && session.activeSessionId !== clientId) {
                const lastUpdate = session.updatedAt ? new Date(session.updatedAt).getTime() : 0;
                const diff = (Date.now() - lastUpdate) / 1000;

                // If the active session is fresh (< 30s), reject the save from this client
                if (diff < 30) {
                    console.warn(`🛑 Blocked save attempt from inactive client ${clientId}. Active client: ${session.activeSessionId}`);
                    return res.status(409).json({
                        success: false,
                        conflict: true,
                        message: "Session is active on another device/tab."
                    });
                }
                // If it's stale, we let this client take over (or just log it)
                console.log(`📡 Client ${clientId} taking over stale session from ${session.activeSessionId}`);
                session.activeSessionId = clientId;
            }

            // Update existing fields if provided
            if (transcript) session.transcript = transcript;
            if (currentTranscript) session.currentTranscript = currentTranscript;
            if (timerStartTimestamp) session.timerStartTimestamp = timerStartTimestamp;
            if (timerEndTimestamp) session.timerEndTimestamp = timerEndTimestamp;
            if (violations) session.violations = violations;
            if (status) session.status = status;
            if (feedback) session.feedback = feedback;
            if (tab_switch_count !== undefined) session.tab_switch_count = tab_switch_count;
            if (back_navigation_attempts !== undefined) session.back_navigation_attempts = back_navigation_attempts;
            if (warnings) session.warnings = warnings;

            if (status === 'Completed' || status === 'Terminated' || status === 'Completed') {
                session.completedAt = new Date();
                session.sessionStatus = (status.toLowerCase().includes('completed')) ? 'completed' : 'terminated';
            }

            await session.save();
        } else {
            // Create new
            session = await InterviewSession.create({
                interviewId,
                candidateEmail,
                activeSessionId: clientId, // Set initial lock
                transcript,
                currentTranscript,
                timerStartTimestamp: timerStartTimestamp || Date.now(),
                violations,
                tab_switch_count: tab_switch_count || 0,
                back_navigation_attempts: back_navigation_attempts || 0,
                warnings: warnings || [],
                status: status || 'Started',
                sessionStatus: 'active'
            });
        }

        res.status(200).json({
            success: true,
            message: "Session saved successfully.",
            data: session
        });

    } catch (error) {
        console.error("❌ Save Session Error Details:", {
            message: error.message,
            stack: error.stack,
            body: req.body
        });

        // Return more specific validation errors if they occur
        if (error.name === 'ValidationError') {
            return res.status(400).json({
                success: false,
                message: "Validation Error",
                details: Object.keys(error.errors).map(k => `${k}: ${error.errors[k].message}`)
            });
        }

        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Terminate Interview Session
// @route   POST /api/interviews/session/terminate
const terminateInterviewSessionController = async (req, res) => {
    try {
        const { interviewId, candidateEmail, reason } = req.body;
        let session = await InterviewSession.findOne({ interviewId, candidateEmail });

        if (session) {
            session.status = 'Terminated';
            session.completedAt = new Date();
            session.violations.push({ type: 'termination', description: reason, timestamp: new Date() });
            await session.save();

            res.status(200).json({ success: true, message: "Interview terminated." });
        } else {
            res.status(404).json({ message: "Session not found." });
        }
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Get Session (for recovery)
// @route   GET /api/interviews/session/:interviewId/:email
const getInterviewSessionController = async (req, res) => {
    try {
        const { interviewId, email } = req.params;
        const session = await InterviewSession.findOne({ interviewId, candidateEmail: email });

        if (!session) {
            return res.status(404).json({ message: "Session not found" });
        }

        res.status(200).json({
            success: true,
            data: session
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Claim Interview Session (Multi-device locking)
// @route   POST /api/interviews/session/claim
// @access  Public (Candidate)
const claimSessionController = async (req, res) => {
    try {
        const { interviewId, candidateEmail, clientId } = req.body;

        if (!interviewId || !candidateEmail || !clientId) {
            return res.status(400).json({
                success: false,
                message: 'Missing required fields: interviewId, candidateEmail, clientId',
            });
        }

        // Check if session exists and is locked by another client
        const session = await InterviewSession.findOne({
            interviewId,
            candidateEmail,
        });

        console.log(`🔍 Claiming session for ${candidateEmail}. Provided clientId: ${clientId}, Stored activeSessionId: ${session?.activeSessionId}`);

        if (session && session.activeSessionId && session.activeSessionId !== clientId) {
            // Check if the session is actually stale (no update for > 10 seconds)
            const lastUpdate = session.updatedAt ? new Date(session.updatedAt).getTime() : 0;
            const now = Date.now();
            const diffSeconds = (now - lastUpdate) / 1000;

            // Allow reclaim if idle for more than 5 seconds (snappier for refreshes)
            if (diffSeconds > 5) {
                console.log(`📡 Session for ${candidateEmail} was idle for ${Math.round(diffSeconds)}s. Allowing reclaim with new clientId: ${clientId}`);
            } else {
                console.warn(`⚠️ Active session conflict: Stored ID ${session.activeSessionId} is still fresh (${Math.round(diffSeconds)}s old). Denying ${clientId}`);
                return res.status(200).json({
                    success: false,
                    conflict: true,
                    message: 'Interview is active on another device',
                    idleSeconds: Math.round(diffSeconds)
                });
            }
        }

        // Prevent joining if already finished
        if (session && (['completed', 'auto_completed', 'terminated'].includes(session.sessionStatus) || ['Completed', 'Terminated'].includes(session.status))) {
            return res.status(200).json({
                success: false,
                finished: true,
                message: 'This interview has already been submitted or terminated.',
            });
        }

        // Claim or update session
        await InterviewSession.findOneAndUpdate(
            { interviewId, candidateEmail },
            {
                activeSessionId: clientId,
                sessionStatus: 'active',
                status: 'In_Progress',
            },
            { upsert: true, new: true }
        );

        // Update main Interview status to Active if it was Created
        await Interview.findOneAndUpdate(
            { interviewId, status: 'Created' },
            { status: 'Active' }
        );

        console.log(`✅ Session claimed: ${interviewId} by client ${clientId}`);

        res.status(200).json({
            success: true,
            message: 'Session claimed successfully',
        });
    } catch (error) {
        console.error('Session claim error:', error);
        res.status(500).json({
            success: false,
            message: error.message,
        });
    }
};

module.exports = {
    saveInterviewSessionController,
    getInterviewSessionController,
    terminateInterviewSessionController,
    claimSessionController,
};
