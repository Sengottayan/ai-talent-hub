const mongoose = require('mongoose');

const questionSchema = new mongoose.Schema({
    interviewId: {
        type: String,
        required: true,
        index: true,
        unique: true
    },
    role: {
        type: String,
        required: true,
        index: true
    },
    questions: [{
        question: {
            type: String,
            required: true
        },
        type: {
            type: String,
            default: 'Technical'
        },
        order: {
            type: Number,
            default: 0
        }
    }],
    isActive: {
        type: Boolean,
        default: true
    }
}, {
    timestamps: true,
    collection: 'questions'
});

module.exports = mongoose.model('Question', questionSchema);
