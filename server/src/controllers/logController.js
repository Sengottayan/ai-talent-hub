const Candidate = require('../models/Candidate');
const Incident = require('../models/Incident');

// @desc    Get all evaluation logs (from Candidate model)
// @route   GET /api/logs/evaluations
// @access  Private
const getEvaluationLogs = async (req, res) => {
    try {
        const candidates = await Candidate.find({}).sort({ createdAt: -1 });
        const logs = candidates.map(c => ({
            id: c._id,
            timestamp: c.createdAt,
            candidateName: c.name,
            role: "Candidate",
            action: (c.score && c.score >= 80) ? "Resume Evaluated" : "Profile Created",
            score: c.score || null,
            status: (c.score && c.score < 50) ? "warning" : "success",
            details: c.score ? `Resume matched ${c.score}% of required skills.` : "Candidate profile registered."
        }));
        res.json(logs);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Get all violation incidents
// @route   GET /api/logs/incidents
// @access  Private
const getIncidents = async (req, res) => {
    try {
        const incidents = await Incident.find({}).sort({ timestamp: -1 });
        res.json(incidents);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

module.exports = {
    getEvaluationLogs,
    getIncidents
};
