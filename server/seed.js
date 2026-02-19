const mongoose = require('mongoose');
const dotenv = require('dotenv');
const User = require('./src/models/User');
const connectDB = require('./src/config/db');

dotenv.config();

connectDB();

const seedUser = async () => {
    try {
        const email = 'sengosaminathan@gmail.com';
        const password = 'Sengo@2003';
        const name = 'Sengo Saminathan';

        const userExists = await User.findOne({ email });

        if (userExists) {
            console.log('User already exists');
            process.exit();
        }

        await User.create({
            name,
            email,
            password
        });
        // The password will be hashed by the pre-save hook in the User model

        console.log('User created successfully');
        process.exit();
    } catch (error) {
        console.error(`${error}`);
        process.exit(1);
    }
};

seedUser();
