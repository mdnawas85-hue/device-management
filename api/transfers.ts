import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectDB } from './lib/mongodb.js';
import { randomUUID } from 'crypto';

// Allow up to 5 MB request bodies for file uploads
export const config = {
  api: { bodyParser: { sizeLimit: '5mb' } },
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const db  = await connectDB();
  const col = db.collection('file_transfers');

  // ── GET ?device_id=xxx  →  list transfers (no binary data field) ──────────
  if (req.method === 'GET') {
    const { device_id } = req.query;
    if (!device_id) return res.status(400).json({ error: 'device_id required' });

    const rows = await col
      .find({ device_id: String(device_id) }, { projection: { data: 0 } })
      .sort({ created_at: -1 })
      .limit(30)
      .toArray();

    return res.json(rows);
  }

  // ── POST { device_id, filename, data }  →  create transfer ───────────────
  if (req.method === 'POST') {
    const body = req.body as Record<string, string>;
    const { device_id, filename, data } = body;
    if (!device_id || !filename || !data) {
      return res.status(400).json({ error: 'device_id, filename and data are required' });
    }

    // Approximate decoded byte size from base64 length
    const b64 = data.includes(',') ? data.split(',')[1] : data;
    const size = Math.round(b64.length * 0.75);

    if (size > 4.5 * 1024 * 1024) {
      return res.status(413).json({ error: 'File too large. Maximum size is 4.5 MB.' });
    }

    const now = new Date().toISOString();
    const id  = randomUUID();
    const doc = {
      _id:          id,
      id,
      device_id,
      filename:     filename.replace(/[^a-zA-Z0-9._\-() ]/g, '_'), // sanitize
      data,         // base64 data URL stored in MongoDB
      size,
      status:       'pending',
      created_at:   now,
      delivered_at: null,
    };

    await col.insertOne(doc as any);

    // Return without data field
    const { data: _d, ...rest } = doc;
    return res.status(201).json(rest);
  }

  // ── DELETE { id }  →  cancel / remove transfer ────────────────────────────
  if (req.method === 'DELETE') {
    const { id } = req.body as Record<string, string>;
    if (!id) return res.status(400).json({ error: 'id required' });
    await col.deleteOne({ id });
    return res.json({ ok: true });
  }

  return res.status(405).end();
}
