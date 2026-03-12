const mongoose = require('mongoose');

const resumeAnalysisSchema = new mongoose.Schema({
    candidateId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    atsScore: { type: Number, required: true },
    keyStrengths: [{ type: String }],
    areasForImprovement: [{ type: String }],
    kpiSuggestions: [{ type: String }],
    suggestedKeywords: [{ type: String }],
    overallFeedback: { type: String },
    bulletPointRewrites: [{
        original: { type: String },
        rewrite: { type: String }
    }]
}, { timestamps: true });

module.exports = mongoose.model('ResumeAnalysis', resumeAnalysisSchema);
