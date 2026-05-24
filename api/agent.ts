import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectDB } from './lib/mongodb.js';
import { randomUUID } from 'crypto';

// ── Bump this every time you build and deploy a new agent .exe ────────────────
// Agents with a lower version will automatically download and replace themselves.
const LATEST_AGENT_VERSION = 2;

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

    const firstIP = Array.isArray(hw.ip_addresses) && hw.ip_addresses.length
      ? String(hw.ip_addresses[0]) : null;
    const serial = hw.serial_number ? String(hw.serial_number) : null;

    // Check if a device with this hostname already has an agent
    const existing = await col.findOne({ hostname, agent_token: { $exists: true } });
    if (existing) {
      await col.updateOne(
        { id: existing.id },
        { $set: {
            agent_token: token, hardware: hw, last_seen: now, updated_at: now,
            status: 'Online',
            ...(firstIP ? { ip_address: firstIP } : {}),
            ...(serial  ? { serial_number: serial } : {}),
        }},
      );
      return res.json({ ok: true, token, device_id: existing.id });
    }

    // Check if device exists without agent (matched by hostname)
    const byHostname = await col.findOne({ device_name: hostname });
    if (byHostname) {
      await col.updateOne(
        { id: byHostname.id },
        { $set: {
            agent_token: token, hardware: hw, last_seen: now, updated_at: now,
            hostname, status: 'Online',
            ip_address:    firstIP ?? byHostname.ip_address,
            mac_address:   hw.mac_address ? String(hw.mac_address) : byHostname.mac_address,
            serial_number: serial ?? byHostname.serial_number,
            os:            hw.platform   ? String(hw.platform)   : byHostname.os,
            os_version:    hw.os_version ? String(hw.os_version) : byHostname.os_version,
        }},
      );
      return res.json({ ok: true, token, device_id: byHostname.id });
    }

    // Brand-new device — create record from agent data
    const id = randomUUID();
    const device = {
      _id:         id,
      id,
      device_name:   hostname,
      device_type:   'Desktop',
      brand:         hw.cpu_brand ? extractBrand(String(hw.cpu_brand)) : null,
      model:         null,
      serial_number: serial,
      mac_address:   hw.mac_address ? String(hw.mac_address) : null,
      ip_address:    firstIP,
      os:            hw.platform   ? String(hw.platform)   : null,
      os_version:    hw.os_version ? String(hw.os_version) : null,
      status:        'Online',
      assigned_to:   hw.logged_user ? String(hw.logged_user) : null,
      department:    null,
      location:      null,
      purchase_date: null,
      warranty_end:  null,
      notes:         null,
      hostname,
      agent_token:   token,
      hardware:      hw,
      last_seen:     now,
      created_at:    now,
      updated_at:    now,
    };
    await col.insertOne(device as any);
    return res.status(201).json({ ok: true, token, device_id: id });
  }

  // ── HEARTBEAT — called every 5 minutes ───────────────────────────────────
  if (action === 'heartbeat') {
    const token        = body.token   as string;
    const hw           = body.hardware as Record<string, unknown>;
    const agentVersion = (body.version as number) ?? 0;
    if (!token) return res.status(400).json({ error: 'token is required' });

    const now = new Date().toISOString();
    const firstIP = Array.isArray(hw?.ip_addresses) && hw.ip_addresses.length
      ? String(hw.ip_addresses[0]) : null;
    const serial = hw?.serial_number ? String(hw.serial_number) : null;

    const result = await col.findOneAndUpdate(
      { agent_token: token },
      { $set: {
          hardware:      hw,
          last_seen:     now,
          updated_at:    now,
          status:        'Online',
          agent_version: agentVersion,
          ...(firstIP ? { ip_address: firstIP } : {}),
          ...(serial  ? { serial_number: serial } : {}),
      }},
      { returnDocument: 'after' },
    );
    if (!result) return res.status(404).json({ error: 'Device not found. Re-run agent installer.' });

    // Tell the agent whether it needs to update itself
    const updateAvailable = agentVersion < LATEST_AGENT_VERSION;
    const proto  = (req.headers['x-forwarded-proto'] as string) ?? 'https';
    const host   = req.headers.host as string;
    const downloadUrl = `${proto}://${host}/DeviceManager-Setup.exe`;

    return res.json({
      ok: true,
      update_available: updateAvailable,
      download_url:     updateAvailable ? downloadUrl : null,
    });
  }

  // ── POLL TRANSFERS — agent checks for pending files to download ───────────
  if (action === 'poll-transfers') {
    const token = body.token as string;
    if (!token) return res.status(400).json({ error: 'token is required' });

    const device = await col.findOne({ agent_token: token });
    if (!device) return res.status(404).json({ error: 'Device not found' });

    const transfers = await db.collection('file_transfers')
      .find({ device_id: device.id, status: 'pending' })
      .toArray();

    return res.json({
      transfers: transfers.map(t => ({ id: t.id, filename: t.filename, data: t.data })),
    });
  }

  // ── ACK TRANSFER — agent confirms file was saved ──────────────────────────
  if (action === 'ack-transfer') {
    const token      = body.token      as string;
    const transferId = body.transfer_id as string;
    if (!token || !transferId) return res.status(400).json({ error: 'token and transfer_id required' });

    const device = await col.findOne({ agent_token: token });
    if (!device) return res.status(404).json({ error: 'Device not found' });

    await db.collection('file_transfers').updateOne(
      { id: transferId, device_id: device.id },
      { $set: { status: 'delivered', delivered_at: new Date().toISOString() } },
    );
    return res.json({ ok: true });
  }

  return res.status(400).json({ error: 'Unknown action' });
}

function extractBrand(cpu: string): string {
  if (cpu.toLowerCase().includes('intel')) return 'Intel';
  if (cpu.toLowerCase().includes('amd'))   return 'AMD';
  if (cpu.toLowerCase().includes('apple')) return 'Apple';
  return cpu.split(' ')[0];
}
