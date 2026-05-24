import { MongoClient, Db } from 'mongodb';

let client: MongoClient | null = null;
let db: Db | null = null;

export async function connectDB(): Promise<Db> {
  if (db && client) {
    try { await client.db().command({ ping: 1 }); return db; }
    catch { client = null; db = null; }
  }
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI environment variable is not set');
  client = new MongoClient(uri, { serverSelectionTimeoutMS: 5000, connectTimeoutMS: 10000 });
  await client.connect();
  db = client.db();
  return db;
}
