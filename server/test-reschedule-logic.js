const mongoose = require('mongoose');
const dotenv = require('dotenv');
const Interview = require('./src/models/Interview');
const Candidate = require('./src/models/Candidate');
const RescheduleRequest = require('./src/models/RescheduleRequest');
const { v4: uuidv4 } = require('uuid');

// Load environment variables
dotenv.config();

/**
 * MOCK req/res for testing the controller logic
 */
const mockRes = () => {
  const res = {};
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (data) => { res.body = data; return res; };
  return res;
};

async function runTests() {
  console.log('🚀 Starting Reschedule Logic Validation Tests...\n');
  
  try {
    if (!process.env.MONGO_URI) {
        throw new Error('MONGO_URI not found in .env');
    }
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB');

    // IMPORT CONTROLLER
    const { createRescheduleRequest } = require('./src/controllers/rescheduleController');

    console.log('--- Setting up mock records ---');
    
    // Create Mock Candidate
    const candidateData = { 
      name: 'Test Candidate', 
      email: 'test' + Date.now() + '@example.com', 
      password: 'password123' 
    };
    const otherCandidateData = { 
      name: 'Other Candidate', 
      email: 'other' + Date.now() + '@example.com', 
      password: 'password123' 
    };
    
    const cand1 = await Candidate.create(candidateData);
    const cand2 = await Candidate.create(otherCandidateData);
    
    const testCandidateId = cand1._id;
    const otherCandidateId = cand2._id;

    // Create Mock Interviews
    const int1 = await Interview.create({ 
      interviewId: 'test-int-1-' + Date.now(), 
      candidateId: testCandidateId, 
      status: 'Active', 
      jobRole: 'Fullstack Developer',
      candidateEmail: candidateData.email
    });
    const int2 = await Interview.create({ 
      interviewId: 'test-int-2-' + Date.now(), 
      candidateId: testCandidateId, 
      status: 'Active', 
      jobRole: 'Backend Engineer',
      candidateEmail: candidateData.email
    });
    const int3 = await Interview.create({ 
      interviewId: 'test-int-3-' + Date.now(), 
      candidateId: otherCandidateId, 
      status: 'Active',
      candidateEmail: otherCandidateData.email,
      jobRole: 'Data Scientist'
    });
    
    const interview1Id = int1._id;
    const interview2Id = int2._id;
    const interview3Id = int3._id;
    
    const futureDate = new Date();
    futureDate.setFullYear(futureDate.getFullYear() + 1);
    futureDate.setHours(11, 0, 0, 0); // 11:00 AM

    // --- CASE 0: SUCCESSFUL FIRST REQUEST ---
    console.log('\nCase 0: Submitting valid request...');
    const req0 = {
      body: {
        interviewId: interview1Id.toString(),
        candidateId: testCandidateId.toString(),
        requestedDate: futureDate.toISOString(),
        reason: 'Valid Reason'
      }
    };
    const res0 = mockRes();
    await createRescheduleRequest(req0, res0);
    console.log('Result:', res0.statusCode, res0.body.message);

    // --- CASE 1: CANDIDATE COLLISION (SAME TIME, DIFFERENT INTERVIEW) ---
    console.log('\nCase 1: Testing Candidate Collision (same candidate, different interview, same time)...');
    const req1 = {
      body: {
        interviewId: interview2Id.toString(),
        candidateId: testCandidateId.toString(),
        requestedDate: futureDate.toISOString(),
        reason: 'Collision Reason'
      }
    };
    const res1 = mockRes();
    await createRescheduleRequest(req1, res1);
    console.log('Result Expected: 409 Collision');
    console.log('Actual Status:', res1.statusCode);
    console.log('Actual Message:', res1.body.message);

    // --- CASE 2: GLOBAL SLOT OCCUPANCY ---
    console.log('\nCase 2: Testing Global Slot Occupancy (different candidate, same time)...');
    
    // First, let's "Confirm" the first one to simulate it being "booked" in the database
    // In our app, a confirmed interview has status 'Active' or 'Scheduled' and a 'scheduledDate'
    await Interview.findByIdAndUpdate(interview1Id, { scheduledDate: futureDate, status: 'Active' });

    const req2 = {
      body: {
        interviewId: interview3Id.toString(),
        candidateId: otherCandidateId.toString(),
        requestedDate: futureDate.toISOString(),
        reason: 'Slot Stealing Reason'
      }
    };
    const res2 = mockRes();

    await createRescheduleRequest(req2, res2);
    console.log('Result Expected: 409 Slot Unavailable');
    console.log('Actual Status:', res2.statusCode);
    console.log('Actual Message:', res2.body.message);

    // --- CASE 3: PAST DATE ---
    console.log('\nCase 3: Testing Past Date...');
    const pastDate = new Date();
    pastDate.setDate(pastDate.getDate() - 1);
    const req3 = {
      body: {
        interviewId: interview1Id.toString(),
        candidateId: testCandidateId.toString(),
        requestedDate: pastDate.toISOString(),
        reason: 'Old Reason'
      }
    };
    const res3 = mockRes();
    await createRescheduleRequest(req3, res3);
    console.log('Result Expected: 400 (Past date)');
    console.log('Actual Status:', res3.statusCode);
    console.log('Actual Message:', res3.body.message);

    console.log('\n--- CLEANUP ---');
    await Interview.deleteMany({ _id: { $in: [interview1Id, interview2Id, interview3Id] } });
    await Candidate.deleteMany({ _id: { $in: [testCandidateId, otherCandidateId] } });
    await RescheduleRequest.deleteMany({ candidateId: { $in: [testCandidateId, otherCandidateId] } });
    
    console.log('\n✅ Tests Completed Successfully');
  } catch (err) {
    console.error('❌ Test Execution Failed:', err);
  } finally {
    await mongoose.connection.close();
    process.exit(0);
  }
}

runTests();
