import mongoose from 'mongoose';
import { config } from './config.js';

export async function connectDB(): Promise<void> {
  mongoose.set('strictQuery', true);
  await mongoose.connect(config.mongoUri, { autoIndex: config.env !== 'production' });
  console.log('[db] connected to', mongoose.connection.name);
}

export async function disconnectDB(): Promise<void> {
  await mongoose.disconnect();
}
