import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectDB } from './lib/mongodb.js';
import { randomUUID } from 'crypto';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const db  = await connectDB();
  const col = db.collection('devices');

  // ── GET — list all devices (or fetch software for one device) ────────────
  if (req.method === 'GET') {
    // GET ?id=xxx&software=1 → return just the software list for one device
    if (req.query.id && req.query.software) {
      const doc = await col.findOne(
        { id: String(req.query.id) },
        { projection: { installed_software: 1, software_updated_at: 1 } },
      );
      if (!doc) return res.status(404).json({ error: 'Device not found' });
      return res.json({
        installed_software:  doc.installed_software  ?? [],
        software_updated_at: doc.software_updated_at ?? null,
      });
    }

    // Normal list — exclude the large installed_software array so the page loads fast
    const devices = await col
      .find({}, { projection: { installed_software: 0 } })
      .sort({ created_at: -1 })
      .toArray();
    return res.json(devices);
  }

  // ── POST — create new device ──────────────────────────────────────────────
  if (req.method === 'POST') {
    const body = req.body as Record<string, unknown>;
    if (!body.device_name) return res.status(400).json({ error: 'device_name is required' });
    const now    = new Date().toISOString();
    const device = {
      _id:           randomUUID(),
      id:            randomUUID(),
      device_name:   String(body.device_name),
      device_type:   String(body.device_type  ?? 'Other'),
      brand:         body.brand         ? String(body.brand)         : null,
      model:         body.model         ? String(body.model)         : null,
      serial_number: body.serial_number ? String(body.serial_number) : null,
      mac_address:   body.mac_address   ? String(body.mac_address)   : null,
      ip_address:    body.ip_address    ? String(body.ip_address)    : null,
      os:            body.os            ? String(body.os)            : null,
      os_version:    body.os_version    ? String(body.os_version)    : null,
      status:        String(body.status ?? 'Offline'),
      assigned_to:   body.assigned_to   ? String(body.assigned_to)   : null,
      department:    body.department    ? String(body.department)    : null,
      location:      body.location      ? String(body.location)      : null,
      purchase_date: body.purchase_date ? String(body.purchase_date) : null,
      warranty_end:  body.warranty_end  ? String(body.warranty_end)  : null,
      notes:         body.notes         ? String(body.notes)         : null,
      created_at:    now,
      updated_at:    now,
    };
    await col.insertOne(device as any);
    return res.status(201).json(device);
  }

  // ── PATCH — update a device ───────────────────────────────────────────────
  if (req.method === 'PATCH') {
    const body = req.body as Record<string, unknown>;
    const { id } = body;
    if (!id) return res.status(400).json({ error: 'id is required' });
    const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
    const fields = ['device_name','device_type','brand','model','serial_number','mac_address',
                    'ip_address','os','os_version','status','assigned_to','department',
                    'location','purchase_date','warranty_end','notes'] as const;
    for (const f of fields) {
      if (f in body) update[f] = body[f] ? String(body[f]) : null;
    }
    const result = await col.findOneAndUpdate(
      { id },
      { $set: update },
      { returnDocument: 'after' },
    );
    if (!result) return res.status(404).json({ error: 'Device not found' });
    return res.json(result);
  }

  // ── DELETE — remove a device ──────────────────────────────────────────────
  if (req.method === 'DELETE') {
    const { id } = req.body as { id: string };
    if (!id) return res.status(400).json({ error: 'id is required' });
    const result = await col.deleteOne({ id });
    if (!result.deletedCount) return res.status(404).json({ error: 'Device not found' });
    return res.json({ ok: true });
  }

  return res.status(405).end();
}
