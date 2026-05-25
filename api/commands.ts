import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectDB } from './lib/mongodb.js';
import { randomUUID } from 'crypto';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const db  = await connectDB();
  const col = db.collection('commands');

  // ── GET — list commands for a device (dashboard) ──────────────────────────
  if (req.method === 'GET') {
    const { device_id } = req.query;
    if (!device_id) return res.status(400).json({ error: 'device_id required' });
    const commands = await col
      .find({ device_id: String(device_id) })
      .sort({ created_at: -1 })
      .limit(50)
      .toArray();
    return res.json(commands);
  }

  // ── POST — dashboard creates a command ────────────────────────────────────
  if (req.method === 'POST') {
    const body = req.body as Record<string, unknown>;
    const { device_id, action, software_name } = body;
    if (!device_id || !action) return res.status(400).json({ error: 'device_id and action required' });
    const now = new Date().toISOString();
    const command = {
      id:            randomUUID(),
      device_id:     String(device_id),
      action:        String(action),
      software_name: software_name ? String(software_name) : null,
      status:        'pending',
      error:         null,
      created_at:    now,
      completed_at:  null,
    };
    await col.insertOne(command as any);
    return res.status(201).json(command);
  }

  // ── PATCH — agent reports result ──────────────────────────────────────────
  if (req.method === 'PATCH') {
    const body  = req.body as Record<string, unknown>;
    const { id, token, status, error } = body;
    if (!id || !status) return res.status(400).json({ error: 'id and status required' });

    // Verify the command belongs to the device that owns this token
    const devCol = db.collection('devices');
    const device = token ? await devCol.findOne({ agent_token: String(token) }) : null;
    const query  = device
      ? { id: String(id), device_id: String(device.id) }
      : { id: String(id) };

    const now    = new Date().toISOString();
    const result = await col.findOneAndUpdate(
      query,
      { $set: { status: String(status), error: error ? String(error) : null, completed_at: now } },
      { returnDocument: 'after' },
    );
    if (!result) return res.status(404).json({ error: 'Command not found' });
    return res.json(result);
  }

  return res.status(405).end();
}
