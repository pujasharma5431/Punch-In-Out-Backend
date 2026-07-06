// ────────────────────────────────────────────────────
//  volunteers.js  —  All volunteer data operations
//  Storage: /backend/data/records.json  (flat-file DB)
// ────────────────────────────────────────────────────
const express = require('express');
const fs      = require('fs');
const path    = require('path');
const { v4: uuidv4 } = require('uuid');

const router   = express.Router();
const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_PATH  = path.join(DATA_DIR, 'records.json');

// ── File helpers ─────────────────────────────────────

/** Ensure the data directory and file exist */
function ensureDB() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DB_PATH))  fs.writeFileSync(DB_PATH, JSON.stringify([], null, 2));
}

/** Read all records from disk */
function readRecords() {
  ensureDB();
  try {
    return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
  } catch {
    return [];
  }
}

/** Write records array to disk */
function writeRecords(records) {
  ensureDB();
  fs.writeFileSync(DB_PATH, JSON.stringify(records, null, 2));
}

// ── Utility ──────────────────────────────────────────

/** Calculate duration string from two timestamps */
function calcDuration(inTs, outTs) {
  if (!outTs) return null;
  const ms       = outTs - inTs;
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

// ── Routes ───────────────────────────────────────────

/**
 * GET /api/volunteers
 * Returns all records, newest first.
 * Query: ?status=active|completed  (optional filter)
 */
router.get('/', (req, res) => {
  let records = readRecords();

  if (req.query.status === 'active')    records = records.filter(r => !r.punchOut);
  if (req.query.status === 'completed') records = records.filter(r =>  r.punchOut);

  // Sort newest first
  records.sort((a, b) => b.punchIn - a.punchIn);

  res.json({
    total:  records.length,
    records
  });
});

/**
 * GET /api/volunteers/stats
 * Summary stats for the admin dashboard.
 */
router.get('/stats', (_req, res) => {
  const records  = readRecords();
  const today    = new Date().toLocaleDateString();
  const active   = records.filter(r => !r.punchOut);
  const todayRec = records.filter(r => r.date === today);

  // Average duration for completed sessions (ms)
  const completed = records.filter(r => r.punchOut);
  const avgMs = completed.length
    ? completed.reduce((sum, r) => sum + (r.punchOut - r.punchIn), 0) / completed.length
    : 0;

  res.json({
    total:       records.length,
    active:      active.length,
    today:       todayRec.length,
    completed:   completed.length,
    averageDuration: calcDuration(0, avgMs) || '0s'
  });
});

/**
 * GET /api/volunteers/:id
 * Fetch a single volunteer record by ID.
 */
router.get('/:id', (req, res) => {
  const records = readRecords();
  const record  = records.find(r => r.id === req.params.id);
  if (!record) return res.status(404).json({ error: 'Record not found' });
  res.json(record);
});

/**
 * POST /api/volunteers/punchin
 * Body: { fullName, email, phone }
 * Creates a new check-in record.
 */
router.post('/punchin', (req, res) => {
  const { fullName, email, phone } = req.body;

  // Validate required fields
  const missing = [];
  if (!fullName || fullName.trim().length < 2) missing.push('fullName');
  if (!email    || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) missing.push('email');
  if (!phone    || phone.replace(/\D/g, '').length < 7) missing.push('phone');

  if (missing.length) {
    return res.status(400).json({ error: 'Validation failed', missing });
  }

  const now    = Date.now();
  const record = {
    id:        uuidv4(),
    fullName:  fullName.trim(),
    email:     email.trim().toLowerCase(),
    phone:     phone.trim(),
    punchIn:   now,
    punchOut:  null,
    date:      new Date(now).toLocaleDateString(),
    createdAt: new Date(now).toISOString()
  };

  const records = readRecords();
  records.push(record);
  writeRecords(records);

  console.log(`  ✅ PUNCH IN  — ${record.fullName} (${record.id})`);
  res.status(201).json({ message: 'Punched in successfully', record });
});

/**
 * PUT /api/volunteers/:id/punchout
 * Marks the volunteer as punched out.
 * Returns 400 if already punched out.
 */
router.put('/:id/punchout', (req, res) => {
  const records = readRecords();
  const index   = records.findIndex(r => r.id === req.params.id);

  if (index === -1) {
    return res.status(404).json({ error: 'Record not found' });
  }

  const record = records[index];

  if (record.punchOut) {
    return res.status(400).json({
      error: 'Already punched out',
      punchOut: record.punchOut
    });
  }

  record.punchOut  = Date.now();
  record.duration  = calcDuration(record.punchIn, record.punchOut);
  records[index]   = record;
  writeRecords(records);

  console.log(`  🚪 PUNCH OUT — ${record.fullName} (${record.id}) — ${record.duration}`);
  res.json({ message: 'Punched out successfully', record });
});

/**
 * DELETE /api/volunteers
 * Clears ALL records (admin only — requires confirmation header).
 */
router.delete('/', (req, res) => {
  if (req.headers['x-confirm-delete'] !== 'yes') {
    return res.status(403).json({
      error: 'Missing confirmation header',
      hint: 'Send header: x-confirm-delete: yes'
    });
  }
  writeRecords([]);
  console.log('  🗑️  ALL RECORDS CLEARED');
  res.json({ message: 'All records cleared' });
});

/**
 * DELETE /api/volunteers/:id
 * Delete a single record by ID.
 */
router.delete('/:id', (req, res) => {
  const records = readRecords();
  const index   = records.findIndex(r => r.id === req.params.id);

  if (index === -1) return res.status(404).json({ error: 'Record not found' });

  const [deleted] = records.splice(index, 1);
  writeRecords(records);
  res.json({ message: 'Record deleted', deleted });
});

module.exports = router;
