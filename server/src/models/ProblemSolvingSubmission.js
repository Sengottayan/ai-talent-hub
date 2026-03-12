const mongoose = require('mongoose');

const testCaseResultSchema = new mongoose.Schema({
    input: String,
    expectedOutput: String,
    actualOutput: String,
    passed: Boolean
});

const submissionSchema = new mongoose.Schema({
    interviewId: {
        type: String,
        required: true,
        ref: 'Interview',
        index: true
    },
    candidateEmail: {
        type: String,
        required: true,
        lowercase: true,
        trim: true,
        index: true
    },
    questionIndex: {
        type: Number,
        required: true
    },
    question: {
        type: String,
        required: true
    },
    code: {
        type: String,
        required: true
    },
    language: {
        type: String,
        default: 'javascript'
    },
    results: [testCaseResultSchema],
    allPassed: {
        type: Boolean,
        default: false
    },
    submittedAt: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true,
    collection: 'problem_solving_submissions'
});

// Compound index for quick lookups of a candidate's submissions for a specific interview
submissionSchema.index({ interviewId: 1, candidateEmail: 1, questionIndex: 1 }, { unique: true });

module.exports = mongoose.model('ProblemSolvingSubmission', submissionSchema);
