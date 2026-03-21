const mongoose = require('mongoose');

const interviewSchema = new mongoose.Schema({
    interviewId: {
        type: String,
        required: true,
        unique: true
    },
    candidateEmail: {
        type: String,
        lowercase: true,
        trim: true,
        index: true
    },
    candidateName: {
        type: String
    },
    companyName: {
        type: String,
        default: 'AI Talent Hub'
    },
    role: {
        type: String // Position/Role
    },
    status: {
        type: String,
        enum: ['Created', 'Active', 'Completed', 'Terminated', 'pending', 'in_progress', 'expired', 'Rescheduled', 'Scheduled'],
        default: 'Created',
        index: true
    },
    expiresAt: {
        type: Date,
        index: true
    },
    startedAt: {
        type: Date
    },
    submittedAt: {
        type: Date
    },
    completedBy: {
        type: String // Email of submitter
    },
    currentQuestionIndex: {
        type: Number,
        default: 0
    },
    responses: [{
        question: String,
        answer: String,
        timestamp: { type: Date, default: Date.now }
    }],
    duration: {
        type: Number // in seconds
    },
    aiSessionData: {
        type: mongoose.Schema.Types.Mixed
    },
    // Keep existing fields for compatibility
    jobRole: String,
    jobDescription: String,
    interviewType: {
        type: String,
        default: 'Technical'
    },
    candidateId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Candidate'
    },
    interviewLink: {
        type: String
    },
    candidateEmails: [{
        type: String
    }],
    questions: [{
        question: String,
        type: { type: String, default: 'text' },
        difficulty: String,
        testCases: [{
            input: String,
            output: String
        }]
    }],
    scheduledDate: {
        type: Date
    },
    email_sent: {
        type: Boolean,
        default: false
    },
    email_sent_at: {
        type: Date
    },
    otp: {
        type: String
    },
    otpExpires: {
        type: Date
    },
    isCooldownViolation: {
        type: Boolean,
        default: false
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
}, {
    collection: 'interviews'
});

interviewSchema.index({ interviewId: 1, candidateEmail: 1 }, { unique: true });

module.exports = mongoose.model('Interview', interviewSchema);
