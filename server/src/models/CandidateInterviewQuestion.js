const mongoose = require('mongoose');

const candidateInterviewQuestionSchema = new mongoose.Schema({
    interviewId: {
        type: String,
        required: true,
        index: true
    },
    candidateEmail: {
        type: String,
        required: true,
        lowercase: true,
        trim: true,
        index: true
    },
    questionMode: {
        type: String,
        enum: ['JD_ONLY', 'CV_ONLY', 'HYBRID'],
        required: true
    },
    questions: [{
        question: String,
        type: { type: String, default: 'text' },
        difficulty: String,
        testCases: [{
            input: String,
            output: String
        }]
    }],
    questionHash: {
        type: String, // hash(cvText + jobDescription) for caching
        index: true
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
}, {
    collection: 'candidate_interview_questions'
});

// Ensure uniqueness per candidate per interview
candidateInterviewQuestionSchema.index({ interviewId: 1, candidateEmail: 1 }, { unique: true });

module.exports = mongoose.model('CandidateInterviewQuestion', candidateInterviewQuestionSchema);
