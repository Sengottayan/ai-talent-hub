const mongoose = require('mongoose');

let isConnected = false;

const connectDB = async () => {
    if (isConnected) {
        return;
    }

    try {
        const db = await mongoose.connect(process.env.MONGO_URI);
        isConnected = db.connections[0].readyState;
        console.log(`MongoDB Connected: ${db.connection.host}`);
    } catch (error) {
        console.error(`Error: ${error.message}`);
        throw error; // Let the caller handle it or let serverless environment report it.
    }
};

module.exports = connectDB;
