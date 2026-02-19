const mongoose = require('mongoose');

const rescheduleRequestSchema = mongoose.Schema({
    interviewId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Interview',
        required: true,
    },
    candidateId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Candidate',
        required: true,
    },
    requestedDate: {
        type: Date,
        required: true,
    },
    reason: {
        type: String,
        required: true,
    },
    status: {
        type: String,
        enum: ['Pending', 'Processing', 'Confirmed', 'Action Required', 'Approved', 'Rejected'],
        default: 'Pending',
    },
    n8nStatus: {
        type: String,
    },
    confirmedDate: {
        type: Date,
    },
    availableDates: {
        type: [String],
    }
}, {
    timestamps: true,
});

const RescheduleRequest = mongoose.model('RescheduleRequest', rescheduleRequestSchema);

module.exports = RescheduleRequest;
