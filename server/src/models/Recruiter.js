const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const recruiterSchema = mongoose.Schema({
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
        default: "recruiter",
    }
}, {
    timestamps: true,
    collection: 'recruiter'
});

recruiterSchema.methods.matchPassword = async function (enteredPassword) {
    if (!this.password) return false;
    return await bcrypt.compare(enteredPassword, this.password);
};

recruiterSchema.pre('save', async function (next) {
    if (!this.isModified('password')) {
        next();
    }
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
});

const Recruiter = mongoose.model('Recruiter', recruiterSchema);

module.exports = Recruiter;
