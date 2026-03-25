const Candidate = require('../models/Candidate');
const Interview = require('../models/Interview');
const InterviewResult = require('../models/InterviewResult');

// @desc    Get dashboard stats (Filtered by company for multi-tenancy)
// @route   GET /api/stats/dashboard
// @access  Private
const getDashboardStats = async (req, res) => {
    try {
        const companyName = req.user?.company;

        if (!companyName && req.user.role === 'recruiter') {
            return res.status(400).json({ message: "Company profile not found." });
        }

        // --- 1. Base Multi-Tenancy Filters ---
        const baseQuery = {};
        if (req.user.role === 'recruiter') {
            baseQuery.companyName = companyName;
        }

        // Filter Candidate collection if candidates are tied to specific companies (assuming they aren't, but filter interviews/results)
        const totalCandidates = await Candidate.countDocuments();
        const shortlistedCandidates = await Candidate.countDocuments({ role: 'candidate' });

        // Filter Interviews
        const interviewQuery = {
            ...baseQuery,
            status: 'Active',
            interviewType: { $ne: 'Mock' }
        };

        const interviewsScheduled = await Interview.countDocuments(interviewQuery);

        // Filter Results (Logic: only results for this company's interviews)
        const resultQuery = {
            interview_id: { $not: /^mock-/ }
        };

        // If recruiter, we need to find all interviewIds for their company first
        if (req.user.role === 'recruiter') {
            const companyInterviews = await Interview.find({ companyName }).select('interviewId');
            const interviewIds = companyInterviews.map(i => i.interviewId);
            resultQuery.interview_id = { $in: interviewIds };
        }

        const interviewsCompleted = await InterviewResult.countDocuments(resultQuery);
        const selectedCandidates = await InterviewResult.countDocuments({
            ...resultQuery,
            decision: 'selected'
        });

        // Dashboard Stats Array
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

        // Upcoming meetings (Filtered by company)
        const upcomingInterviews = await Interview.find(interviewQuery)
            .sort({ createdAt: -1 })
            .limit(5);

        const mappedUpcoming = upcomingInterviews.map(i => ({
            candidate: i.jobRole || "General",
            role: i.jobDescription?.substring(0, 30) || "Interview",
            time: new Date(i.createdAt).toLocaleDateString(),
            type: i.interviewType || "Technical"
        }));

        // Analytics Data (Filtered)
        const analytics = {
            statusDistribution: [
                { name: 'Pending', value: interviewsScheduled },
                { name: 'Completed', value: interviewsCompleted },
                { name: 'Selected', value: selectedCandidates },
                { name: 'Rejected', value: Math.max(0, interviewsCompleted - selectedCandidates) }
            ],
            scoreDistribution: [
                { name: '90-100', candidates: 5 },
                { name: '80-89', candidates: 12 },
                { name: '70-79', candidates: 8 },
                { name: '60-69', candidates: 3 },
                { name: '<60', candidates: 2 }
            ]
        };

        res.json({ stats, upcomingInterviews: mappedUpcoming, analytics });
    } catch (error) {
        console.error("Dashboard Stats Error:", error);
        res.status(500).json({ message: error.message });
    }
};

module.exports = { getDashboardStats };
