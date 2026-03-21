const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

// Load env from the server directory
const envPath = path.join(__dirname, '.env');
dotenv.config({ path: envPath });

const Recruiter = require('./src/models/Recruiter');
const connectDB = require('./src/config/db');

async function fixRecruiter() {
    await connectDB();
    const email = 'sengosaminathan@gmail.com';
    const company = 'ROR';
    
    console.log(`Fixing recruiter: ${email} -> Company: ${company}`);
    
    const result = await Recruiter.findOneAndUpdate(
        { email: new RegExp('^' + email + '$', 'i') },
        { $set: { company: company } },
        { new: true }
    );
    
    if (result) {
        console.log('✅ Successfully updated recruiter record!');
        console.log(JSON.stringify(result, null, 2));
    } else {
        console.log('❌ Recruiter not found!');
    }
    
    process.exit();
}

fixRecruiter();
