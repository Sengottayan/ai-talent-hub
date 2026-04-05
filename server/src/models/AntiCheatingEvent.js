const mongoose = require('mongoose');

const antiCheatingEventSchema = new mongoose.Schema({
    interview_id: {
        type: String,
        required: true,
        ref: 'Interview',
        index: true
    },
    email: {
        type: String,
        required: true,
        lowercase: true,
        trim: true,
        index: true
    },
    candidate_name: {
        type: String,
        required: true
    },
    event_type: {
        type: String,
        enum: [
            'window_blur',
            'window_focus',
            'visibility_hidden',
            'mouse_leave',
            'mouse_enter',
            'tab_switch',
            'multi_face_detected',
            'no_face_detected',
            'termination'
        ],
        required: true
    },
    timestamp: {
        type: Date,
        default: Date.now
    },
    timestamp_str: {
        type: String, // Relative time from interview start (e.g., "05:23")
        default: '00:00'
    },
    duration_ms: {
        type: Number, // Duration of focus loss in milliseconds
        default: 0
    },
    suspicious_score: {
        type: Number,
        default: 0,
        min: 0
    },
    max_allowed_score: {
        type: Number,
        default: 5,
        min: 1
    },
    interview_status: {
        type: String,
        enum: ['active', 'auto_completed'],
        default: 'active'
    },
    metadata: {
        type: mongoose.Schema.Types.Mixed, // Additional event data (e.g., mouse coordinates)
        default: {}
    }
}, {
    timestamps: true,
    collection: 'anti_cheating_events'
});

// Compound index for efficient queries
antiCheatingEventSchema.index({ interview_id: 1, email: 1 });
antiCheatingEventSchema.index({ interview_id: 1, email: 1, event_type: 1 });

// Virtual for total violations
antiCheatingEventSchema.virtual('isViolationLimitReached').get(function () {
    return this.suspicious_score >= this.max_allowed_score;
});

const AntiCheatingEvent = mongoose.model('AntiCheatingEvent', antiCheatingEventSchema);

module.exports = AntiCheatingEvent;
