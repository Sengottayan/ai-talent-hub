const mongoose = require('mongoose');

const jobSchema = mongoose.Schema({
    role: {
        type: String,
        required: true,
    },
    skills: {
        type: [String],
        required: true,
    },
    experience: {
        type: Number,
        default: 0,
        required: true,
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
    }
}, {
    timestamps: true,
});

const Job = mongoose.model('Job', jobSchema);

module.exports = Job;
