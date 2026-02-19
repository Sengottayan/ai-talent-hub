const jwt = require('jsonwebtoken');
const Candidate = require('../models/Candidate');
const Recruiter = require('../models/Recruiter');
const User = require('../models/User');

const generateToken = (id) => {
    return jwt.sign({ id }, process.env.JWT_SECRET, {
        expiresIn: '30d',
    });
};

// @desc    Register a new user
// @route   POST /api/auth/signup
// @access  Public
const registerUser = async (req, res) => {
    const { name, email, password, role } = req.body;
    console.log(`Signup attempt: ${email}, role: ${role}`);

    try {
        // Check if user exists in either collection
        const recruiterExists = await Recruiter.findOne({ email });
        const candidateExists = await Candidate.findOne({ email });

        if (recruiterExists || candidateExists) {
            return res.status(400).json({ message: 'User already exists' });
        }

        let user;
        if (role === 'candidate') {
            user = await Candidate.create({
                name,
                email,
                password,
            });
        } else if (role === 'recruiter') {
            user = await Recruiter.create({
                name,
                email,
                password,
            });
        } else {
            return res.status(400).json({ message: 'Invalid role' });
        }

        if (user) {
            res.status(201).json({
                success: true,
                user_id: user._id,
                role: user.role,
                token: generateToken(user._id),
                email_payload: {
                    subject: "Welcome to HireAI",
                    body: `Hello ${name}, your ${role} account has been created successfully.`,
                    role: role
                }
            });
        } else {
            res.status(400).json({ message: 'Invalid user data' });
        }
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Authenticate user & get token
// @route   POST /api/auth/login
// @access  Public
const loginUser = async (req, res) => {
    const { email, password } = req.body;
    console.log(`Login attempt: ${email}`);

    try {
        const emailRegex = new RegExp(`^${email}$`, 'i');
        let user = null;
        let role = null;
        let redirect_url = null;

        // 1. Try to find in Recruiter collection
        user = await Recruiter.findOne({ email: emailRegex });
        if (user && (await user.matchPassword(password))) {
            role = 'recruiter';
            redirect_url = '/hr/dashboard';
        } else {
            // 2. Try to find in Candidate collection
            user = await Candidate.findOne({ email: emailRegex });
            if (user && (await user.matchPassword(password))) {
                role = 'candidate';
                redirect_url = '/candidate/dashboard';
            } else {
                // 3. Try User collection (General / Admin)
                user = await User.findOne({ email: emailRegex });
                if (user && (await user.matchPassword(password))) {
                    role = user.role;
                    redirect_url = role === 'admin' ? '/admin/dashboard' : (role === 'recruiter' ? '/hr/dashboard' : '/candidate/dashboard');
                } else {
                    console.log(`Login failed for ${email}: Invalid credentials`);
                    return res.status(401).json({ message: 'Invalid email or password' });
                }
            }
        }

        res.json({
            user_id: user._id,
            role: role,
            redirect_url: redirect_url,
            token: generateToken(user._id),
            name: user.name,
            email: user.email
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Get all users (Mock aggregation)
const getUsers = async (req, res) => {
    try {
        const recruiters = await Recruiter.find({}).select('-password');
        const candidates = await Candidate.find({}).select('-password');
        res.json([...recruiters, ...candidates]);
    } catch (error) {
        res.status(500).json({ message: 'Server Error' });
    }
};

// @desc    Delete user
const deleteUser = async (req, res) => {
    try {
        const { id } = req.params;

        // Try deleting from both (one will succeed or both fail)
        const recruiterDelete = await Recruiter.findByIdAndDelete(id);
        if (recruiterDelete) {
            return res.json({ message: 'Recruiter removed' });
        }

        const candidateDelete = await Candidate.findByIdAndDelete(id);
        if (candidateDelete) {
            return res.json({ message: 'Candidate removed' });
        }

        res.status(404).json({ message: 'User not found' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Reset password
// @route   POST /api/auth/reset-password
// @access  Public
const resetPassword = async (req, res) => {
    const { email, password } = req.body;
    console.log(`Reset password attempt for: ${email}`);

    try {
        const emailRegex = new RegExp(`^${email}$`, 'i');
        let user = await User.findOne({ email: emailRegex });
        if (!user) {
            user = await Recruiter.findOne({ email: emailRegex });
            if (user) console.log(`User found in Recruiter collection`);
        }
        if (!user) {
            user = await Candidate.findOne({ email: emailRegex });
            if (user) console.log(`User found in Candidate collection`);
        }

        if (user) {
            user.password = password;
            await user.save();
            res.json({ success: true, message: 'Password reset successful' });
        } else {
            console.log(`Reset password failed: User with email ${email} not found`);
            res.status(404).json({ message: 'User not found with this email id' });
        }
    } catch (error) {
        console.error('Reset password error:', error);
        res.status(500).json({ message: 'Internal server error while resetting password' });
    }
};

// @desc    Update password (authenticated)
// @route   POST /api/auth/update-password
// @access  Private
const updatePassword = async (req, res) => {
    const { currentPassword, newPassword } = req.body;
    const userId = req.user._id;

    try {
        let user = await User.findById(userId) || await Recruiter.findById(userId) || await Candidate.findById(userId);

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        const isMatch = await user.matchPassword(currentPassword);
        if (!isMatch) {
            return res.status(401).json({ message: 'Incorrect current password' });
        }

        user.password = newPassword;
        await user.save();

        res.json({ success: true, message: 'Password updated successfully' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

module.exports = { registerUser, loginUser, getUsers, deleteUser, resetPassword, updatePassword };
