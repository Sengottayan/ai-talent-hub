const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Recruiter = require('../models/Recruiter');
const Candidate = require('../models/Candidate');

const protect = async (req, res, next) => {
    let token;

    if (
        req.headers.authorization &&
        req.headers.authorization.startsWith('Bearer')
    ) {
        try {
            token = req.headers.authorization.split(' ')[1];

            // Verify token
            const decoded = jwt.verify(token, process.env.JWT_SECRET);

            // Fetch user from DB
            let user = await User.findById(decoded.id).select('-password');
            if (!user) {
                user = await Recruiter.findById(decoded.id).select('-password');
            }
            if (!user) {
                user = await Candidate.findById(decoded.id).select('-password');
            }

            if (!user) {
                return res.status(401).json({ message: 'Not authorized, user not found' });
            }

            req.user = user;
            next();
        } catch (error) {
            console.error(error);
            res.status(401).json({ message: 'Not authorized, token failed' });
        }
    }

    if (!token) {
        res.status(401).json({ message: 'Not authorized, no token' });
    }
};

const admin = (req, res, next) => {
    if (req.user && req.user.role === 'admin') {
        next();
    } else {
        res.status(401).json({ message: 'Not authorized as an admin' });
    }
};

const authorizeRole = (...roles) => {
    return (req, res, next) => {
        if (!req.user || !roles.includes(req.user.role)) {
            return res.status(403).json({
                message: `User role ${req.user ? req.user.role : 'unknown'} is not authorized to access this route`
            });
        }
        next();
    };
};

// New Middleware for Server-to-Server Authentication (n8n -> Backend)
const protectServer = (req, res, next) => {
    let token;

    if (
        req.headers.authorization &&
        req.headers.authorization.startsWith('Bearer')
    ) {
        token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
        return res.status(401).json({ message: 'Not authorized, no token provided' });
    }

    // Check against a specific server secret
    if (token === process.env.N8N_WEBHOOK_SECRET) {
        next();
    } else {
        return res.status(401).json({ message: 'Not authorized, invalid token' });
    }
};

module.exports = { protect, admin, authorizeRole, protectServer };
