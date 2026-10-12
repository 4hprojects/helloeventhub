import mongoose from 'mongoose';
import { loadConfig } from '../config.js';
import { connectDb, ensureIndexes } from '../db/connect.js';

const config = loadConfig();
await connectDb(config.MONGODB_URI);
await ensureIndexes({ sync: true });
console.log('Indexes synchronized (undeclared indexes removed).');
await mongoose.disconnect();
