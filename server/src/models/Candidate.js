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
    },
    otp: {
        type: String,
    },
    otpExpires: {
        type: Date,
    }
}, {
    timestamps: true,
    collection: 'candidates'
});

candidateSchema.methods.matchPassword = async function (enteredPassword) {
    if (!this.password) return false;
    return await bcrypt.compare(enteredPassword, this.password);
};

candidateSchema.pre('save', async function () {
    if (!this.isModified('password')) {
        return;
    }
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
});

const Candidate = mongoose.model('Candidate', candidateSchema);

module.exports = Candidate;
