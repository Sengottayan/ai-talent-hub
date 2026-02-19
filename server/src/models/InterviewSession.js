const mongoose = require('mongoose');

const interviewSessionSchema = new mongoose.Schema({
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
    // Legacy transcript field (kept for backward compatibility)
    transcript: [{
        role: { type: String, enum: ['agent', 'user', 'system', 'assistant'] },
        content: String,
        timestamp: { type: Date, default: Date.now }
    }],
    // NEW: Real-time transcript backup for VAPI interviews
    currentTranscript: [{
        role: { type: String, enum: ['user', 'assistant', 'system', 'agent'] },
        content: String,
        timestamp: { type: Date, default: Date.now }
    }],
    // NEW: Multi-device session locking
    activeSessionId: {
        type: String, // Client UUID to prevent concurrent sessions
        default: null
    },
    // NEW: Timer persistence
    timerStartTimestamp: {
        type: Number, // Unix timestamp in milliseconds
        default: null
    },
    timerEndTimestamp: {
        type: Number, // Unix timestamp in milliseconds
        default: null
    },
    // NEW: Enhanced session status
    sessionStatus: {
        type: String,
        enum: ['active', 'completed', 'auto_completed', 'terminated'],
        default: 'active'
    },
    feedback: {
        type: Map,
        of: mongoose.Schema.Types.Mixed
    },
    violations: [{
        type: { type: String }, // 'tab_switch', 'face_missing', 'window_blur', etc.
        timestamp: { type: Date, default: Date.now },
        duration: Number, // ms
        reason: String
    }],
    tab_switch_count: {
        type: Number,
        default: 0
    },
    back_navigation_attempts: {
        type: Number,
        default: 0
    },
    warnings: [{
        type: { type: String }, // 'tab_switch', 'back_nav'
        timestamp: { type: Date, default: Date.now }
    }],
    // Legacy status field (kept for backward compatibility)
    status: {
        type: String,
        enum: ['Started', 'In_Progress', 'Completed', 'Abandoned', 'Terminated'],
        default: 'Started'
    },
    startedAt: {
        type: Date,
        default: Date.now
    },
    completedAt: Date
}, {
    timestamps: true
});

module.exports = mongoose.model('InterviewSession', interviewSessionSchema);
