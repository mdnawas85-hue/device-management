import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectDB } from './lib/mongodb.js';
import { randomUUID } from 'crypto';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const db  = await connectDB();
  const col = db.collection('file_uploads');

  // ── GET ?device_id=xxx  → list requests (no binary data) ─────────────────
  if (req.method === 'GET') {
    const { device_id, id, action } = req.query;

    // Download a ready file: GET ?id=xxx&action=download
    if (id && action === 'download') {
      const row = await col.findOne({ id: String(id) });
      if (!row || row.status !== 'ready') return res.status(404).json({ error: 'File not ready' });
      const b64 = (row.data as string).includes(',')
        ? (row.data as string).split(',')[1]
        : (row.data as string);
      const buf = Buffer.from(b64, 'base64');
      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename="${row.filename}"`);
      res.setHeader('Content-Length', buf.length);
      return res.send(buf);
    }

    if (!device_id) return res.status(400).json({ error: 'device_id required' });
    const rows = await col
      .find({ device_id: String(device_id) }, { projection: { data: 0 } })
      .sort({ created_at: -1 })
      .limit(30)
      .toArray();
    return res.json(rows);
  }

  // ── POST { device_id, file_path }  → create upload request ───────────────
  if (req.method === 'POST') {
    const { device_id, file_path } = req.body as Record<string, string>;
    if (!device_id || !file_path) return res.status(400).json({ error: 'device_id and file_path required' });

    const now = new Date().toISOString();
    const id  = randomUUID();
    const doc = {
      _id: id, id,
      device_id,
      file_path: file_path.trim(),
      filename:     null,
      size:         null,
      data:         null,
      status:       'pending',
      error:        null,
      created_at:   now,
      completed_at: null,
    };
    await col.insertOne(doc as any);
    const { data: _d, ...rest } = doc;
    return res.status(201).json(rest);
  }

  // ── DELETE { id }  → cancel / remove ─────────────────────────────────────
  if (req.method === 'DELETE') {
    const { id } = req.body as Record<string, string>;
    if (!id) return res.status(400).json({ error: 'id required' });
    await col.deleteOne({ id });
    return res.json({ ok: true });
  }

  return res.status(405).end();
}
