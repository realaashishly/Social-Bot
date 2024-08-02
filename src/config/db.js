import mongoose from 'mongoose';

const connectDB = async () => {
    try {
        await mongoose.connect(process.env.MONGO_CONNECT_STRING);
        console.log("Connection established");
    } catch (error) {
        console.log('Error occurred while connecting to the database: ' + error);
        process.kill(process.pid, 'SIGTERM');
    }
};

export default connectDB;
