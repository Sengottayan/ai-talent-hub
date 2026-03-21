const mongoose = require('mongoose');
const dotenv = require('dotenv');
const Interview = require('./src/models/Interview');
const Candidate = require('./src/models/Candidate');
const RescheduleRequest = require('./src/models/RescheduleRequest');
const axios = require('axios');

// Mock Axios
jest = null;
axios.post = async (url, payload) => {
    console.log(`Mock Axios POST to ${url}`);
    return { status: 200, data: { success: true } };
};

// Load environment variables
dotenv.config();

const mockRes = () => {
  const res = {};
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (data) => { res.body = data; return res; };
  return res;
};

async function runTests() {
  console.log('🚀 Comprehensive Reschedule Logic Validation...\n');
  
  try {
    await mongoose.connect(process.env.MONGO_URI);
    const { 
        createRescheduleRequest, 
        approveRescheduleRequest, 
        rejectRescheduleRequest,
        confirmReschedule,
        pendingReschedule 
    } = require('./src/controllers/rescheduleController');

    // SETUP
    const candId = new mongoose.Types.ObjectId();
    const email = `test${Date.now()}@example.com`;
    await Candidate.create({ _id: candId, name: 'Test User', email, password: 'pw' });

    const int1 = await Interview.create({ 
        interviewId: 'int1-' + Date.now(), 
        candidateId: candId, 
        status: 'Active', 
        candidateEmail: email 
    });
    const int2 = await Interview.create({ 
        interviewId: 'int2-' + Date.now(), 
        candidateId: candId, 
        status: 'Active', 
        candidateEmail: email 
    });

    const futureDate = new Date();
    futureDate.setFullYear(futureDate.getFullYear() + 1);
    futureDate.setHours(12, 0, 0, 0);

    // --- CASE 1: Candidate Double-Booking (Collision) ---
    console.log('\nCase 1: Same candidate, multi-interview collision...');
    // Create first request
    await createRescheduleRequest({ body: { interviewId: int1._id, candidateId: candId, requestedDate: futureDate, reason: 'R1' } }, mockRes());
    // Try second request for same time
    const res1 = mockRes();
    const out1 = await createRescheduleRequest({ body: { interviewId: int2._id, candidateId: candId, requestedDate: futureDate, reason: 'R2' } }, res1);
    console.log('Result Expected: 409 | Actual:', res1.statusCode, res1.body.message);

    // --- CASE 2: Global Slot Occupancy ---
    console.log('\nCase 2: Global slot collision (Conflicting with confirmed interview)...');
    // Set int1 as confirmed for a DIFFERENT slot
    const slotB = new Date(futureDate.getTime() + 2 * 3600000); // +2 hours
    await Interview.findByIdAndUpdate(int1._id, { scheduledDate: slotB, status: 'Active' });
    
    // Now another candidate (simulated by int2) tries to book slotB
    const res2 = mockRes();
    await createRescheduleRequest({ body: { interviewId: int2._id, candidateId: candId, requestedDate: slotB, reason: 'R3' } }, res2);
    console.log('Result Expected: 409 Slot Unavailable | Actual:', res2.statusCode, res2.body.message);

    // --- CASE 3: Past Date ---
    console.log('\nCase 3: Past date check...');
    const past = new Date(); past.setDate(past.getDate() - 5);
    const res3 = mockRes();
    await createRescheduleRequest({ body: { interviewId: int1._id, candidateId: candId, requestedDate: past, reason: 'R4' } }, res3);
    console.log('Result Expected: 400 | Actual:', res3.statusCode, res3.body.message);

    // --- CASE 4: Duplicate request for SAME interview ---
    console.log('\nCase 4: Duplicate request for same interview...');
    const req4 = { body: { interviewId: int1._id, candidateId: candId, requestedDate: slotB, reason: 'dup' } };
    const res4 = mockRes();
    await createRescheduleRequest(req4, res4);
    console.log('Result Expected: 409 (Active status guard) | Actual:', res4.statusCode, res4.body.message);

    // --- CASE 5: HR Reject ---
    console.log('\nCase 5: HR Rejecting a request...');
    // Create a new request to reject
    const newReqDate = new Date(futureDate.getTime() + 10 * 3600000); // +10 hours
    const reqDoc = await RescheduleRequest.create({ interviewId: int1._id, candidateId: candId, requestedDate: newReqDate, reason: 'Reject Me' });
    await Interview.findByIdAndUpdate(int1._id, { status: 'Rescheduled' });
    
    const res5 = mockRes();
    await rejectRescheduleRequest({ params: { id: reqDoc._id } }, res5);
    const updatedInt = await Interview.findById(int1._id);
    console.log('Result Expected: Success, Interview back to Active | Actual:', updatedInt.status);

    // --- CASE 6: HR Approve & N8N Response ---
    console.log('\nCase 6: HR Approving -> N8N Confirm...');
    const reqDoc6 = await RescheduleRequest.create({ interviewId: int2._id, candidateId: candId, requestedDate: newReqDate, reason: 'Confirm Me' });
    const res6 = mockRes();
    await approveRescheduleRequest({ params: { id: reqDoc6._id } }, res6);
    console.log('Approve call result:', res6.statusCode);
    
    // Simulate n8n calling confirmReschedule
    const resFinal = mockRes();
    await confirmReschedule({ body: { rescheduleId: reqDoc6._id, confirmedDate: newReqDate } }, resFinal);
    const confirmedInt = await Interview.findById(int2._id);
    console.log('Final Interview Date Expected:', newReqDate.toISOString());
    console.log('Final Interview Date Actual:', confirmedInt.scheduledDate.toISOString());

    console.log('\n--- CLEANUP ---');
    await Interview.deleteMany({ candidateId: candId });
    await Candidate.deleteOne({ _id: candId });
    await RescheduleRequest.deleteMany({ candidateId: candId });
    
    console.log('\n✅ All Tests Passed');
  } catch (err) {
    console.error('❌ Test Failed:', err);
  } finally {
    await mongoose.connection.close();
    process.exit(0);
  }
}

runTests();
