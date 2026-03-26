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
            status: { $in: ['Created', 'Scheduled', 'Active', 'Rescheduled'] },
            interviewType: { $ne: 'Mock' }
        };

        const interviewsScheduled = await Interview.countDocuments(interviewQuery);

        // Filter Results (Logic: results for this company's interviews)
        const resultQuery = {
            interview_id: { $not: /^mock-/ }
        };

        if (req.user.role === 'recruiter') {
            const companyInterviews = await Interview.find({ companyName }).select('interviewId _id');
            const interviewIds = companyInterviews.map(i => i.interviewId); // UUIDs
            const mongoIds = companyInterviews.map(i => i._id.toString()); // Mongo IDs
            
            resultQuery.interview_id = { $in: [...interviewIds, ...mongoIds] };
        }

        const interviewsCompleted = await InterviewResult.countDocuments({
            ...resultQuery,
            isCompleted: true // Ensure we only count finished ones
        });
        
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
        const upcomingInterviewsRaw = await Interview.find(interviewQuery)
            .sort({ createdAt: -1 })
            .limit(5);

        const mappedUpcoming = upcomingInterviewsRaw.map(i => ({
            candidate: i.candidateEmail?.split('@')[0] || "Candidate",
            email: i.candidateEmail,
            role: i.jobRole || "Interview",
            time: new Date(i.createdAt).toLocaleDateString(),
            type: i.interviewType || "Technical",
            status: i.status
        }));

        // Fetch Recent Candidates from Interviews (Actual people being interviewed by this company)
        const recentInterviews = await Interview.find(baseQuery)
            .sort({ createdAt: -1 })
            .limit(5);
            
        const mappedRecent = recentInterviews.map(i => ({
            name: i.candidateEmail?.split('@')[0] || "Candidate",
            email: i.candidateEmail,
            role: i.jobRole || "Candidate",
            status: i.status === 'Created' ? 'invited' : (i.status === 'Active' ? 'in-progress' : i.status.toLowerCase()),
            score: 0 
        }));

        // Fetch Actual Score Distribution
        const scoreResults = await InterviewResult.find(resultQuery).select('scores');
        const scoreDist = { '90-100': 0, '80-89': 0, '70-79': 0, '60-69': 0, '<60': 0 };
        
        scoreResults.forEach(r => {
            // Find the highest score if multiple exist in the Map
            let maxScore = 0;
            if (r.scores) {
               r.scores.forEach(val => { if (val > maxScore) maxScore = val; });
            }
            
            if (maxScore >= 90) scoreDist['90-100']++;
            else if (maxScore >= 80) scoreDist['80-89']++;
            else if (maxScore >= 70) scoreDist['70-79']++;
            else if (maxScore >= 60) scoreDist['60-69']++;
            else if (maxScore > 0) scoreDist['<60']++;
        });

        const rejectedCandidates = await InterviewResult.countDocuments({
            ...resultQuery,
            decision: 'rejected'
        });

        const onHoldCandidates = await InterviewResult.countDocuments({
            ...resultQuery,
            decision: 'on-hold'
        });

        const pendingDecisionCandidates = await InterviewResult.countDocuments({
            ...resultQuery,
            isCompleted: true,
            decision: 'pending'
        });

        // Analytics Data (Filtered)
        const analytics = {
            statusDistribution: [
                { name: 'In Pipeline', value: interviewsScheduled },
                { name: 'Under Review', value: pendingDecisionCandidates },
                { name: 'Selected', value: selectedCandidates },
                { name: 'Rejected', value: rejectedCandidates },
                { name: 'On Hold', value: onHoldCandidates }
            ],
            scoreDistribution: Object.keys(scoreDist).map(key => ({
                name: key,
                candidates: scoreDist[key]
            }))
        };

        res.json({
            stats: stats || [],
            recentCandidates: mappedRecent || [],
            upcomingInterviews: mappedUpcoming || [],
            analytics: analytics || null
        });
    } catch (error) {
        console.error("Dashboard Stats Error:", error);
        res.status(500).json({ message: error.message });
    }
};

module.exports = { getDashboardStats };
