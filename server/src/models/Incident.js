const mongoose = require('mongoose');

const incidentSchema = mongoose.Schema({
    interviewId: {
        type: String, // String ID from Retell or custom
        required: true,
    },
    candidateName: {
        type: String,
        required: true,
    },
    violationType: {
        type: String,
        required: true,
    },
    severity: {
        type: String,
        enum: ['low', 'medium', 'high'],
        default: 'low',
    },
    description: String,
    actionTaken: String,
    timestamp: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true,
    collection: 'incidents'
});

const Incident = mongoose.model('Incident', incidentSchema);

module.exports = Incident;
