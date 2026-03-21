const mongoose = require('mongoose');

const interviewResultSchema = mongoose.Schema({
    interview_id: {
        type: String,
        required: true,
        ref: 'Interview',
        index: true
    },
    // NEW: Email field for direct lookup (not just candidate_id)
    email: {
        type: String,
        required: true,
        lowercase: true,
        trim: true,
        index: true
    },
    // NEW: Full name for display purposes
    fullname: {
        type: String,
        default: 'Candidate'
    },
    candidate_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Candidate'
    },
    candidate_name: {
        type: String,
        required: true
    },
    interviewer_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    // Legacy scores field
    scores: {
        type: Map,
        of: Number
    },
    // NEW: AI-generated rating breakdown
    rating: {
        technical: { type: Number, min: 0, max: 10 },
        communication: { type: Number, min: 0, max: 10 },
        problemSolving: { type: Number, min: 0, max: 10 },
        clarity: { type: Number, min: 0, max: 10 },
        confidence: { type: Number, min: 0, max: 10 }
    },
    // NEW: VAPI conversation transcript
    conversationTranscript: [{
        role: { type: String, enum: ['user', 'assistant', 'system', 'agent'] },
        content: String,
        timestamp: Date
    }],
    // NEW: AI-generated recommendations
    recommendations: {
        type: String,
        default: ''
    },
    // NEW: AI-generated summary
    summary: {
        type: String,
        default: ''
    },
    evaluation_summary: {
        type: String
    },
    decision: {
        type: String,
        enum: ['selected', 'rejected', 'on-hold', 'pending'],
        default: 'pending'
    },
    feedback: {
        type: String
    },
    strengths: [String],
    improvements: [String],
    // NEW: Anti-cheating tracking
    antiCheatingState: {
        type: mongoose.Schema.Types.Mixed,
        default: null
    },
    violationCount: {
        type: Number,
        default: 0,
        min: 0
    },
    // NEW: Completion tracking
    isCompleted: {
        type: Boolean,
        default: false
    },
    startedAt: {
        type: Date,
        default: null
    },
    completedAt: {
        type: Date,
        default: null
    },
    // NEW: Structured Q&A responses
    responses: [{
        question: String,
        answer: String,
        timestamp: { type: Date, default: Date.now }
    }],
    // NEW: Coding round submission
    codingSubmission: {
        type: mongoose.Schema.Types.Mixed,
        default: null
    },
    // NEW: External n8n Expert Evaluation
    n8n_evaluation: {
        type: mongoose.Schema.Types.Mixed,
        default: null
    },
    isCooldownViolation: {
        type: Boolean,
        default: false
    }
}, {
    timestamps: true,
    collection: 'interview_results'
});

const InterviewResult = mongoose.model('InterviewResult', interviewResultSchema);

module.exports = InterviewResult;
