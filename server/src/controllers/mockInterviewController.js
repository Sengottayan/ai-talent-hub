const Interview = require('../models/Interview');
const InterviewSession = require('../models/InterviewSession');
const InterviewResult = require('../models/InterviewResult');
const { v4: uuidv4 } = require('uuid');

// @desc    Create a mock interview session for practice
// @route   POST /api/mock-interviews/create
// @access  Public (Candidate)
const createMockInterviewController = async (req, res) => {
    try {
        const { candidateEmail, jobRole, jobDescription, interviewType, duration } = req.body;

        if (!candidateEmail) {
            return res.status(400).json({ message: "Candidate email is required." });
        }

        // Generate unique interview ID
        const interviewId = `mock-${uuidv4()}`;
        const interviewLink = `${process.env.FRONTEND_URL || 'http://localhost:8080'}/interview/${interviewId}/start`;

        // Create mock interview
        const mockInterview = await Interview.create({
            interviewId,
            jobRole: jobRole || 'General Practice',
            jobDescription: jobDescription || 'Standard industry questions for common roles.',
            duration: duration || 30,
            interviewType: interviewType || 'Mock',
            candidateEmails: [candidateEmail],
            interviewLink,
            status: 'Active',
            questions: [] // Will be generated dynamically during the interview
        });

        res.status(201).json({
            success: true,
            message: "Mock interview created successfully.",
            data: {
                interviewId: mockInterview.interviewId,
                interviewLink: mockInterview.interviewLink,
                jobRole: mockInterview.jobRole,
                duration: mockInterview.duration
            }
        });

    } catch (error) {
        console.error("Create Mock Interview Error:", error);
        res.status(500).json({ message: error.message });
    }
};

// @desc    Get candidate's interview history (both real and mock)
// @route   GET /api/mock-interviews/history/:email
// @access  Public (Candidate)
const getCandidateInterviewHistoryController = async (req, res) => {
    try {
        const { email } = req.params;

        if (!email) {
            return res.status(400).json({ message: "Email is required." });
        }

        // Find all sessions for this candidate
        const sessions = await InterviewSession.find({
            candidateEmail: email,
            status: { $in: ['Completed', 'Terminated'] }
        })
            .sort({ completedAt: -1 })
            .limit(10);

        // Get interview details and results for each session
        const history = await Promise.all(sessions.map(async (session) => {
            const interview = await Interview.findOne({ interviewId: session.interviewId }).lean();
            const result = await InterviewResult.findOne({ interview_id: session.interviewId }).lean();

            return {
                sessionId: session._id,
                interviewId: session.interviewId,
                jobRole: interview?.jobRole || 'Unknown Role',
                status: session.status,
                startedAt: session.startedAt,
                completedAt: session.completedAt,
                duration: session.completedAt
                    ? Math.floor((new Date(session.completedAt) - new Date(session.startedAt)) / 60000)
                    : 0,
                score: result?.scores?.Total || result?.scores?.overall || 0,
                violations: session.violations?.length || 0,
                isMock: session.interviewId.startsWith('mock-')
            };
        }));

        res.status(200).json({
            success: true,
            data: history
        });

    } catch (error) {
        console.error("Get Interview History Error:", error);
        res.status(500).json({ message: error.message });
    }
};

// @desc    Get mock interview statistics for a candidate
// @route   GET /api/mock-interviews/stats/:email
// @access  Public (Candidate)
const getMockInterviewStatsController = async (req, res) => {
    try {
        const { email } = req.params;

        const sessions = await InterviewSession.find({
            candidateEmail: email,
            status: 'Completed'
        });

        const mockSessions = sessions.filter(s => s.interviewId.startsWith('mock-'));

        const totalSessions = mockSessions.length;
        const avgViolations = totalSessions > 0
            ? mockSessions.reduce((sum, s) => sum + (s.violations?.length || 0), 0) / totalSessions
            : 0;

        // Get average scores
        const results = await InterviewResult.find({
            interview_id: { $in: mockSessions.map(s => s.interviewId) }
        }).lean();

        const avgScore = results.length > 0
            ? results.reduce((sum, r) => sum + (r.scores?.Total || r.scores?.overall || 0), 0) / results.length
            : 0;

        res.status(200).json({
            success: true,
            data: {
                totalSessions,
                avgScore: avgScore.toFixed(1),
                avgViolations: avgViolations.toFixed(1)
            }
        });

    } catch (error) {
        console.error("Get Mock Stats Error:", error);
        res.status(500).json({ message: error.message });
    }
};

module.exports = {
    createMockInterviewController,
    getCandidateInterviewHistoryController,
    getMockInterviewStatsController
};
