const mongoose = require('mongoose');

const skillGapSchema = new mongoose.Schema({
    candidateId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Candidate',
        required: true
    },
    targetRole: {
        type: String,
        required: true
    },
    jobDescription: String,
    matchPercentage: Number,
    skillsAnalysis: [{
        skill: String,
        proficiency: Number,
        status: String
    }],
    criticalGaps: [String],
    learningRoadmap: [String],
    careerInsight: String,
    createdAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.models.SkillGap || mongoose.model('SkillGap', skillGapSchema);
