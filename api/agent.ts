import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectDB } from './lib/mongodb.js';
import { randomUUID } from 'crypto';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const db  = await connectDB();
  const col = db.collection('devices');
  const body = req.body as Record<string, unknown>;
  const action = body.action as string;

  // ── REGISTER — agent runs for the first time ─────────────────────────────
  if (action === 'register') {
    const hw = body.hardware as Record<string, unknown>;
    if (!hw) return res.status(400).json({ error: 'hardware is required' });

    const hostname = String(hw.hostname ?? 'Unknown');
    const now      = new Date().toISOString();
    const token    = randomUUID();

    // Check if a device with this hostname already has an agent
    const existing = await col.findOne({ hostname, agent_token: { $exists: true } });
    if (existing) {
      // Re-register: update token + hardware
      await col.updateOne(
        { id: existing.id },
        { $set: { agent_token: token, hardware: hw, last_seen: now, updated_at: now, status: 'Online' } },
      );
      return res.json({ ok: true, token, device_id: existing.id });
    }

    // Check if device exists without agent (matched by hostname)
    const byHostname = await col.findOne({ device_name: hostname });
    if (byHostname) {
      await col.updateOne(
        { id: byHostname.id },
        { $set: { agent_token: token, hardware: hw, last_seen: now, updated_at: now,
                  hostname, status: 'Online',
                  ip_address: Array.isArray(hw.ip_addresses) && hw.ip_addresses.length
                    ? String(hw.ip_addresses[0]) : byHostname.ip_address,
                  mac_address: hw.mac_address ? String(hw.mac_address) : byHostname.mac_address,
                  os: hw.platform ? String(hw.platform) : byHostname.os,
                  os_version: hw.os_version ? String(hw.os_version) : byHostname.os_version,
        } },
      );
      return res.json({ ok: true, token, device_id: byHostname.id });
    }

    // Brand-new device — create record from agent data
    const id = randomUUID();
    const device = {
      _id:         id,
      id,
      device_name: hostname,
      device_type: 'Desktop',    // default; user can edit later
      brand:       hw.cpu_brand  ? extractBrand(String(hw.cpu_brand)) : null,
      model:       null,
      serial_number: null,
      mac_address: hw.mac_address ? String(hw.mac_address) : null,
      ip_address:  Array.isArray(hw.ip_addresses) && hw.ip_addresses.length
                    ? String(hw.ip_addresses[0]) : null,
      os:          hw.platform   ? String(hw.platform) : null,
      os_version:  hw.os_version ? String(hw.os_version) : null,
      status:      'Online',
      assigned_to: hw.logged_user ? String(hw.logged_user) : null,
      department:  null,
      location:    null,
      purchase_date: null,
      warranty_end:  null,
      notes:       null,
      hostname,
      agent_token: token,
      hardware:    hw,
      last_seen:   now,
      created_at:  now,
      updated_at:  now,
    };
    await col.insertOne(device as any);
    return res.status(201).json({ ok: true, token, device_id: id });
  }

  // ── HEARTBEAT — called every 5 minutes by the scheduled task ─────────────
  if (action === 'heartbeat') {
    const token = body.token as string;
    const hw    = body.hardware as Record<string, unknown>;
    if (!token) return res.status(400).json({ error: 'token is required' });

    const now = new Date().toISOString();
    const result = await col.findOneAndUpdate(
      { agent_token: token },
      {
        $set: {
          hardware:   hw,
          last_seen:  now,
          updated_at: now,
          status:     'Online',
          // Update network info if changed
          ...(Array.isArray(hw?.ip_addresses) && hw.ip_addresses.length
            ? { ip_address: String(hw.ip_addresses[0]) }
            : {}),
        },
      },
      { returnDocument: 'after' },
    );
    if (!result) return res.status(404).json({ error: 'Device not found. Re-run agent installer.' });
    return res.json({ ok: true });
  }

  return res.status(400).json({ error: 'Unknown action' });
}

// Extract brand name from CPU string e.g. "Intel Core i7..." → "Intel"
function extractBrand(cpu: string): string {
  if (cpu.toLowerCase().includes('intel')) return 'Intel';
  if (cpu.toLowerCase().includes('amd'))   return 'AMD';
  if (cpu.toLowerCase().includes('apple')) return 'Apple';
  return cpu.split(' ')[0];
}
