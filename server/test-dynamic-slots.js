const mongoose = require('mongoose');
const dotenv = require('dotenv');
const Interview = require('./src/models/Interview');
const Candidate = require('./src/models/Candidate');
const RescheduleRequest = require('./src/models/RescheduleRequest');

// Load env
dotenv.config();

/**
 * MOCK req/res
 */
const mockRes = () => {
  const res = {};
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (data) => { res.body = data; return res; };
  return res;
};

async function runTest() {
  console.log('🧪 Testing Dynamic Slot Suggester Logic...\n');

  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB');

    const { pendingReschedule } = require('./src/controllers/rescheduleController');

    // SETUP TEST DATA
    const candId = new mongoose.Types.ObjectId();
    const otherCandId = new mongoose.Types.ObjectId();
    const email = `test-dynamic-${Date.now()}@example.com`;
    await Candidate.create({ _id: candId, name: 'Main User', email, password: 'pw' });

    // 1. Create a requested interview
    const int1 = await Interview.create({ 
        interviewId: 'int-dyn-1-' + Date.now(), 
        candidateId: candId, 
        status: 'Rescheduled', 
        candidateEmail: email
    });

    // 2. Create a "Reschedule Request" doc
    const originalRequestDate = new Date();
    originalRequestDate.setDate(originalRequestDate.getDate() + 5);
    originalRequestDate.setHours(10, 0, 0, 0); // e.g., 5 days from now 10AM
    
    const requestDoc = await RescheduleRequest.create({
        interviewId: int1._id,
        candidateId: candId,
        requestedDate: originalRequestDate,
        reason: 'Collision',
        status: 'Processing'
    });

    // 3. OCCUPY SOME SLOTS to test collision detection
    // Let's occupy 10:00 AM and 11:00 AM on the DAY AFTER originalRequestDate
    const nextDay = new Date(originalRequestDate);
    nextDay.setDate(nextDay.getDate() + 1);
    
    const occupiedSlot1 = new Date(nextDay); occupiedSlot1.setHours(10, 0, 0, 0);
    const occupiedSlot2 = new Date(nextDay); occupiedSlot2.setHours(11, 0, 0, 0);
    
    console.log(`🔒 Occupying ${occupiedSlot1.toISOString()} and ${occupiedSlot2.toISOString()} in DB...`);
    await Interview.create({ 
        interviewId: 'int-busy-1-' + Date.now(), 
        candidateId: otherCandId, 
        status: 'Active', 
        scheduledDate: occupiedSlot1,
        candidateEmail: 'busy1@example.com'
    });
    await Interview.create({ 
        interviewId: 'int-busy-2-' + Date.now(), 
        candidateId: otherCandId, 
        status: 'Scheduled', 
        scheduledDate: occupiedSlot2,
        candidateEmail: 'busy2@example.com'
    });

    // 4. TRIGGER pendingReschedule
    console.log(`🚀 Triggering dynamic slot generation for Request: ${requestDoc._id}...`);
    const res = mockRes();
    await pendingReschedule({ body: { rescheduleId: requestDoc._id, availableDates: [] } }, res);
    
    // 5. VERIFY GENERATED SLOTS
    const updatedRequest = await RescheduleRequest.findById(requestDoc._id);
    const generated = updatedRequest.availableDates;
    
    console.log('\n--- Results ---');
    console.log(`Original Date: ${originalRequestDate.toISOString()}`);
    console.log('Occupied slots (should be skipped):', occupiedSlot1.toISOString(), occupiedSlot2.toISOString());
    console.log('Generated alternative slots:', generated);

    // Assert that the generated slots don't contain the occupied ones
    const hasCollision = generated.some(d => d === occupiedSlot1.toISOString() || d === occupiedSlot2.toISOString());
    
    if (hasCollision) {
        console.error('❌ FAILED: Found a collision in generated slots!');
    } else {
        console.log('✅ PASSED: Dynamic slots successfully avoided booked times.');
    }

    // CLEANUP
    console.log('\n--- CLEANUP ---');
    await Interview.deleteMany({ candidateId: { $in: [candId, otherCandId] } });
    await Candidate.deleteMany({ _id: { $in: [candId, otherCandId] } });
    await RescheduleRequest.deleteMany({ candidateId: candId });

  } catch (err) {
    console.error('❌ Test execution failed:', err);
  } finally {
    await mongoose.connection.close();
    process.exit(0);
  }
}

runTest();
