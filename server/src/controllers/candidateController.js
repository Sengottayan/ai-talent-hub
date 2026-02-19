const Candidate = require('../models/Candidate');
const Job = require('../models/Job');
const axios = require('axios');

// @desc    Create Job / Set Criteria
// @route   POST /api/candidates/job
// @access  Private
const createJob = async (req, res) => {
    const { jobRole, skills, experience } = req.body;

    try {
        const job = await Job.create({
            role: jobRole,
            skills,
            experience,
            createdBy: req.user._id
        });

        // Trigger the resume shortlisting process
        // This downloads from Drive, parses, and sends shortlisted candidates to n8n
        // We run this in the background to avoid timing out the client response, 
        // or we can await it if the user expects immediate feedback. 
        // Given the volume of files, background is safer, but for this specific flow 
        // where the user asks "Backend triggers shortlistResumes()", we'll initiate it.

        // Import the service dynamically or at top level (doing dynamic here to avoid circular dep issues if any, though top level is better)
        const { shortlistResumes } = require('../services/shortlistService');

        console.log("Triggering shortlisting process...");
        shortlistResumes().then(result => {
            console.log("Shortlisting complete:", result);
        }).catch(err => {
            console.error("Shortlisting failed:", err.message);
        });

        res.status(201).json({
            message: "Job criteria saved and shortlisting process started.",
            job
        });
    } catch (error) {
        console.error("Error creating job:", error);
        res.status(500).json({ message: error.message });
    }
};

// @desc    Get shortlisted candidates
// @route   GET /api/candidates/shortlisted
// @access  Private
const getShortlistedCandidates = async (req, res) => {
    try {
        const candidates = await Candidate.find({ status: { $in: ['Shortlisted', 'Interview Scheduled', 'Interview Completed', 'Selected'] } });
        res.json(candidates);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Get all candidates
// @route   GET /api/candidates
// @access  Private
const getCandidates = async (req, res) => {
    try {
        const candidates = await Candidate.find({});
        res.json(candidates);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

module.exports = {
    createJob,
    getShortlistedCandidates,
    getCandidates
};
