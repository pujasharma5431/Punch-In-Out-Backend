// ─────────────────────────────────────────────
//  Volunteer Check-In System — Express Server
// ─────────────────────────────────────────────
const express = require('express');
const cors    = require('cors');
const path    = require('path');

const volunteersRouter = require('./routes/volunteers');

const app  = express();
const PORT = process.env.PORT || 3001;

// ── Middleware ──────────────────────────────
app.use(cors({
  origin: '*',          // allow the frontend (file:// or localhost:8080)
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type']
}));
app.use(express.json());

// ── Request logger ──────────────────────────
app.use((req, _res, next) => {
  const ts = new Date().toISOString();
  console.log(`[${ts}]  ${req.method.padEnd(6)} ${req.url}`);
  next();
});

// ── API Routes ──────────────────────────────
app.use('/api/volunteers', volunteersRouter);

// ── Health check ────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ── 404 fallback ────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// ── Global error handler ────────────────────
app.use((err, _req, res, _next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error', message: err.message });
});

// ── Start ───────────────────────────────────
app.listen(PORT, () => {
  console.log('');
  console.log('  ✅  Volunteer Backend Running');
  console.log(`  🌐  http://localhost:${PORT}`);
  console.log(`  📋  API Docs: http://localhost:${PORT}/api/volunteers`);
  console.log('');
});
