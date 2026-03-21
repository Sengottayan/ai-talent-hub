const mongoose = require('mongoose');

const candidateInterviewHistorySchema = new mongoose.Schema({
    candidateEmail: {
        type: String,
        required: true,
        lowercase: true,
        trim: true,
        index: true
    },
    candidateId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Candidate'
    },
    jobRole: {
        type: String,
        required: true
    },
    companyName: {
        type: String,
        required: true
    },
    interviewId: {
        type: String,
        required: true
    },
    interviewCompletedAt: {
        type: Date,
        default: Date.now
    },
    cooldownUntil: {
        type: Date,
        required: true
    }
}, {
    timestamps: true,
    collection: 'candidate_interview_history'
});

// Compound index for fast lookup of candidate + role + company
candidateInterviewHistorySchema.index({ candidateEmail: 1, jobRole: 1, companyName: 1 });

module.exports = mongoose.model('CandidateInterviewHistory', candidateInterviewHistorySchema);
