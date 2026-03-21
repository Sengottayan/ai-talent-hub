const mongoose = require('mongoose');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();

const API_URL = 'http://localhost:5000/api';
const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://sengottayan:Sengo123@cluster0.pvnke.mongodb.net/ai-talent-hub?retryWrites=true&w=majority';

async function testCooldown() {
    console.log('--- START TEST ---');

    try {
        await mongoose.connect(MONGO_URI);
        
        const Interview = require('./src/models/Interview');
        const CandidateInterviewHistory = require('./src/models/CandidateInterviewHistory');
        const Recruiter = require('./src/models/Recruiter');

        const testEmail = `candidate-${Date.now()}@test.com`;
        const testRole = 'Test Runner';
        const testCompany = 'Test Corp';

        // 1. Setup Recruiter
        const recruiterEmail = `test-hr-${Date.now()}@test.com`;
        let recruiter = await Recruiter.create({
            name: 'Test Company Alpha',
            email: recruiterEmail,
            password: 'password123'
        });
        console.log('RECRUITER_CREATED');

        const loginRes = await axios.post(`${API_URL}/auth/login`, {
            email: recruiterEmail,
            password: 'password123'
        });
        const token = loginRes.data.token;
        const config = { headers: { Authorization: `Bearer ${token}` } };

        // 2. Pre-record History
        const cooldownUntil = new Date();
        cooldownUntil.setDate(cooldownUntil.getDate() + 90);

        await CandidateInterviewHistory.create({
            candidateEmail: testEmail,
            jobRole: testRole,
            companyName: recruiter.name,
            interviewId: 'prev-id',
            interviewCompletedAt: new Date(),
            cooldownUntil: cooldownUntil
        });
        console.log('HISTORY_CREATED');

        // 3. Draft Test
        console.log(`DRAFTING_CHECK_EMAIL: ${testEmail}`);
        const draftRes = await axios.post(`${API_URL}/interviews/draft`, {
            jobRole: testRole,
            jobDescription: 'Test',
            duration: '30',
            interviewType: 'Technical',
            candidateEmails: JSON.stringify([testEmail])
        }, config);

        console.log('DRAFT_RESPONSE_INF:', JSON.stringify(draftRes.data.data.cooldownInfo));

        if (draftRes.data.data.cooldownInfo?.length > 0) {
            console.log('DRAFT_DETECTED_COOLDOWN');
        } else {
            console.log('DRAFT_FAILED_TO_DETECT');
        }

        // 4. Finalize Test
        const finalizeRes = await axios.post(`${API_URL}/interviews/finalize`, {
            jobRole: testRole,
            jobDescription: 'Test',
            duration: '30',
            interviewType: 'Technical',
            candidateEmails: [testEmail],
            questions: [{ question: 'Test?', type: 'text' }]
        }, config);

        const newId = finalizeRes.data.data[0].interviewId;
        const saved = await Interview.findOne({ interviewId: newId });
        if (saved.isCooldownViolation) {
            console.log('FLAG_SET_SUCCESS');
        }

        // 5. Access Test
        try {
            await axios.post(`${API_URL}/interviews/initialize/${newId}`, {
                email: testEmail
            });
            console.log('ACCESS_NOT_BLOCKED_ERROR');
        } catch (error) {
            if (error.response?.status === 403) {
                console.log('ACCESS_BLOCKED_SUCCESS');
            } else {
                console.log('ACCESS_ERROR_' + error.response?.status);
            }
        }

        // Cleanup
        await Interview.deleteMany({ candidateEmail: testEmail });
        await CandidateInterviewHistory.deleteOne({ candidateEmail: testEmail });
        console.log('CLEANUP_DONE');

    } catch (e) {
        console.log('ERROR: ' + (e.response?.data?.message || e.message));
        if (e.response?.data) console.log('DATA: ' + JSON.stringify(e.response.data));
    } finally {
        await mongoose.disconnect();
        console.log('--- END TEST ---');
    }
}

testCooldown();
