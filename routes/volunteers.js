// ────────────────────────────────────────────────────────────────
//  volunteers.js  —  All volunteer API routes (MongoDB version)
// ────────────────────────────────────────────────────────────────
const express   = require('express');
const Volunteer = require('../models/Volunteer');

const router = express.Router();

// ── Utility ──────────────────────────────────────────────────────

function calcDuration(inDate, outDate) {
  if (!outDate) return null;
  const totalSec = Math.floor((new Date(outDate) - new Date(inDate)) / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

// ── Routes ────────────────────────────────────────────────────────

/**
 * GET /api/volunteers
 * All records, newest first.
 * ?status=active | completed
 */
router.get('/', async (req, res) => {
  try {
    const filter = {};
    if (req.query.status === 'trash') {
      filter.isDeleted = true;
    } else {
      filter.isDeleted = { $ne: true };
      if (req.query.status === 'active')    filter.punchOut = null;
      if (req.query.status === 'completed') filter.punchOut = { $ne: null };
    }

    const records = await Volunteer.find(filter).sort({ punchIn: -1 });
    res.json({ total: records.length, records });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/volunteers/stats
 * Summary counts for the admin dashboard.
 */
router.get('/stats', async (req, res) => {
  try {
    const today = new Date().toLocaleDateString();

    const [total, active, todayCount, completed] = await Promise.all([
      Volunteer.countDocuments({ isDeleted: { $ne: true } }),
      Volunteer.countDocuments({ punchOut: null, isDeleted: { $ne: true } }),
      Volunteer.countDocuments({ date: today, isDeleted: { $ne: true } }),
      Volunteer.countDocuments({ punchOut: { $ne: null }, isDeleted: { $ne: true } })
    ]);

    // Average duration of completed sessions
    const done = await Volunteer.find({ punchOut: { $ne: null }, isDeleted: { $ne: true } }, 'punchIn punchOut');
    const avgMs = done.length
      ? done.reduce((sum, r) => sum + (new Date(r.punchOut) - new Date(r.punchIn)), 0) / done.length
      : 0;

    res.json({
      total, active, today: todayCount, completed,
      averageDuration: calcDuration(0, new Date(avgMs)) || '0s'
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/volunteers/:id
 * Single record by MongoDB _id.
 */
router.get('/:id', async (req, res) => {
  try {
    const record = await Volunteer.findById(req.params.id);
    if (!record) return res.status(404).json({ error: 'Record not found' });
    res.json(record);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/volunteers/punchin
 * Body: { fullName, email, phone }
 */
router.post('/punchin', async (req, res) => {
  try {
    const { fullName, email, phone } = req.body;

    // Validate
    const missing = [];
    if (!fullName || fullName.trim().length < 2)                      missing.push('fullName');
    if (!email    || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) missing.push('email');
    if (!phone    || phone.replace(/\D/g, '').length < 7)             missing.push('phone');
    if (missing.length) return res.status(400).json({ error: 'Validation failed', missing });

    const now = new Date();
    const record = await Volunteer.create({
      fullName: fullName.trim(),
      email:    email.trim().toLowerCase(),
      phone:    phone.trim(),
      punchIn:  now,
      punchOut: null,
      date:     now.toLocaleDateString()
    });

    console.log(`  ✅ PUNCH IN  — ${record.fullName} (${record._id})`);
    res.status(201).json({ message: 'Punched in successfully', record });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * PUT /api/volunteers/:id/punchout
 */
router.put('/:id/punchout', async (req, res) => {
  try {
    const record = await Volunteer.findById(req.params.id);
    if (!record) return res.status(404).json({ error: 'Record not found' });
    if (record.punchOut) return res.status(400).json({ error: 'Already punched out', punchOut: record.punchOut });

    record.punchOut = new Date();
    record.duration = calcDuration(record.punchIn, record.punchOut);
    await record.save();

    console.log(`  🚪 PUNCH OUT — ${record.fullName} (${record._id}) — ${record.duration}`);
    res.json({ message: 'Punched out successfully', record });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * PUT /api/volunteers/:id/trash
 * Move a record to the trash bin.
 */
router.put('/:id/trash', async (req, res) => {
  try {
    const record = await Volunteer.findByIdAndUpdate(req.params.id, { isDeleted: true, deletedAt: new Date() }, { new: true });
    if (!record) return res.status(404).json({ error: 'Record not found' });
    console.log(`  🗑️  MOVED TO TRASH — ${record.fullName} (${record._id})`);
    res.json({ message: 'Record moved to trash', record });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * PUT /api/volunteers/:id/restore
 * Restore a record from the trash bin.
 */
router.put('/:id/restore', async (req, res) => {
  try {
    const record = await Volunteer.findByIdAndUpdate(req.params.id, { isDeleted: false, deletedAt: null }, { new: true });
    if (!record) return res.status(404).json({ error: 'Record not found' });
    console.log(`  ♻️  RESTORED — ${record.fullName} (${record._id})`);
    res.json({ message: 'Record restored', record });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE /api/volunteers
 * Clear ALL records (requires confirmation header).
 */
router.delete('/', async (req, res) => {
  if (req.headers['x-confirm-delete'] !== 'yes') {
    return res.status(403).json({ error: 'Send header: x-confirm-delete: yes' });
  }
  try {
    await Volunteer.deleteMany({});
    console.log('  🗑️  ALL RECORDS CLEARED');
    res.json({ message: 'All records cleared' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE /api/volunteers/:id
 */
router.delete('/:id', async (req, res) => {
  try {
    const deleted = await Volunteer.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Record not found' });
    res.json({ message: 'Record deleted', deleted });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
