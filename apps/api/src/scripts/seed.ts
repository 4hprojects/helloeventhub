import mongoose from 'mongoose';
import { loadConfig } from '../config.js';
import { connectDb, ensureIndexes } from '../db/connect.js';
import { seedPrimaryEvent } from '../services/seedData.js';

const config = loadConfig();
await connectDb(config.MONGODB_URI);
await ensureIndexes();
const { event, createdEvent, createdCategories } = await seedPrimaryEvent();
console.log(`Event "${event.title}" (${event.slug}, id ${event.publicId}) ${createdEvent ? 'created' : 'already existed'}; ${createdCategories} branch(es) added.`);
await mongoose.disconnect();
