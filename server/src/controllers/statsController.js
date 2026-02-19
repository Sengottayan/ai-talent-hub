const Candidate = require('../models/Candidate');
const Interview = require('../models/Interview');
const InterviewResult = require('../models/InterviewResult');

// @desc    Get dashboard stats
// @route   GET /api/stats/dashboard
// @access  Private
const getDashboardStats = async (req, res) => {
    try {
        const totalCandidates = await Candidate.countDocuments();
        const shortlistedCandidates = await Candidate.countDocuments({ role: 'candidate' }); // Adjust if needed
        const interviewsScheduled = await Interview.countDocuments({
            status: 'Active',
            interviewType: { $ne: 'Mock' }
        });
        const interviewsCompleted = await InterviewResult.countDocuments({
            interview_id: { $not: /^mock-/ }
        }); // Assuming completed means result exists
        const selectedCandidates = await InterviewResult.countDocuments({
            decision: 'selected',
            interview_id: { $not: /^mock-/ }
        });

        // Mock trends (as real historical data might not be available easily without more complex logging)
        const stats = [
            {
                title: "Total Candidates",
                value: totalCandidates,
                icon: "FileText",
                trend: { value: 12, isPositive: true },
            },
            {
                title: "In Pipeline",
                value: shortlistedCandidates,
                icon: "Users",
                trend: { value: 8, isPositive: true },
            },
            {
                title: "Active Interviews",
                value: interviewsScheduled,
                icon: "Calendar",
                trend: { value: 5, isPositive: true },
            },
            {
                title: "Completed",
                value: interviewsCompleted,
                icon: "CheckCircle",
                trend: { value: 23, isPositive: true },
            },
            {
                title: "Selected",
                value: selectedCandidates,
                icon: "UserCheck",
                trend: { value: 18, isPositive: true },
            },
        ];

        // Recent candidates
        const recentCandidates = await Candidate.find({}).sort({ createdAt: -1 }).limit(5);
        const mappedRecent = recentCandidates.map(c => ({
            name: c.name,
            role: "Candidate", // Assuming role info is in Candidate model or somewhere else
            status: "pending",
            score: 0 // Will be updated if result exists
        }));

        // Upcoming interviews
        const upcomingInterviews = await Interview.find({
            status: 'Active',
            interviewType: { $ne: 'Mock' }
        }).sort({ createdAt: -1 }).limit(5);
        const mappedUpcoming = upcomingInterviews.map(i => ({
            candidate: i.jobRole || "General",
            role: i.jobDescription?.substring(0, 30) || "Interview",
            time: new Date(i.createdAt).toLocaleDateString(),
            type: i.interviewType || "Technical"
        }));

        res.json({ stats, recentCandidates: mappedRecent, upcomingInterviews: mappedUpcoming });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

module.exports = { getDashboardStats };
