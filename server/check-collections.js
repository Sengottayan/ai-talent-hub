const mongoose = require('mongoose');
const dotenv = require('dotenv');
dotenv.config();

async function check() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        const collections = await mongoose.connection.db.listCollections().toArray();
        console.log("Collections:", collections.map(c => c.name));

        for (const col of collections) {
            const count = await mongoose.connection.db.collection(col.name).countDocuments();
            console.log(`- ${col.name}: ${count} documents`);
            if (count > 0) {
                const sample = await mongoose.connection.db.collection(col.name).findOne();
                console.log(`  Sample IDs:`, Object.keys(sample).filter(k => k.includes('Id') || k.includes('ID') || k === '_id'));
                if (col.name === 'interviews') {
                    console.log(`  Sample Interview status: ${sample.status}`);
                    console.log(`  Sample Interview interviewId: ${sample.interviewId}`);
                }
            }
        }
        process.exit(0);
    } catch (error) {
        console.error(error);
        process.exit(1);
    }
}
check();
