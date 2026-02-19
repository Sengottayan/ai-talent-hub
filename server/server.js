const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
dotenv.config();
console.log("RETELL_API_KEY present:", !!process.env.RETELL_API_KEY);
console.log("RETELL_AGENT_ID:", process.env.RETELL_AGENT_ID);

const connectDB = require('./src/config/db');

const authRoutes = require('./src/routes/authRoutes');
// const candidateRoutes = require('./src/routes/candidateRoutes');
const interviewRoutes = require('./src/routes/interviewRoutes');
const supportRoutes = require('./src/routes/supportRoutes');
const retellRoutes = require('./src/routes/retellRoutes');
const statsRoutes = require('./src/routes/statsRoutes');
const rescheduleRoutes = require('./src/routes/rescheduleRoutes');
const logRoutes = require('./src/routes/logRoutes');
const resumeRoutes = require('./src/routes/resumeRoutes');
const mockInterviewRoutes = require('./src/routes/mockInterviewRoutes');
const aiRoutes = require('./src/routes/aiRoutes');

// Routes

connectDB();

const app = express();

app.use(cors());
app.use(express.json());

app.use('/api/auth', authRoutes);
console.log('Auth routes registered at /api/auth');
// app.use('/api/candidates', candidateRoutes);
app.use('/api/interviews', interviewRoutes);
console.log('Interview routes registered at /api/interviews');
app.use('/api/support', supportRoutes);
console.log('Support routes registered at /api/support');
app.use('/api/retell', retellRoutes);
console.log('Retell routes registered at /api/retell');
app.use('/api/stats', statsRoutes);
console.log('Stats routes registered at /api/stats');
app.use('/api/reschedule', rescheduleRoutes);
console.log('Reschedule routes registered at /api/reschedule');
app.use('/api/logs', logRoutes);
console.log('Log routes registered at /api/logs');
app.use('/api/resume', resumeRoutes);
console.log('Resume routes registered at /api/resume');
app.use('/api/mock-interviews', mockInterviewRoutes);
console.log('Mock Interview routes registered at /api/mock-interviews');
app.use('/api/ai', aiRoutes);
console.log('AI routes registered at /api/ai');

app.get('/', (req, res) => {
    res.send('API is running...');
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
