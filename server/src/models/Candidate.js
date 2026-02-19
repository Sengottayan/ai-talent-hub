const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const candidateSchema = mongoose.Schema({
    name: {
        type: String,
        required: true,
    },
    email: {
        type: String,
        required: true,
        unique: true,
    },
    password: {
        type: String,
        required: true,
    },
    role: {
        type: String,
        default: "candidate",
    }
}, {
    timestamps: true,
    collection: 'candidates'
});

candidateSchema.methods.matchPassword = async function (enteredPassword) {
    if (!this.password) return false;
    return await bcrypt.compare(enteredPassword, this.password);
};

candidateSchema.pre('save', async function (next) {
    if (!this.isModified('password')) {
        next();
    }
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
});

const Candidate = mongoose.model('Candidate', candidateSchema);

module.exports = Candidate;
