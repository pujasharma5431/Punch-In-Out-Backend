// ─────────────────────────────────────────────────────────────
//  Volunteer Check-In System — Express + MongoDB Server
// ─────────────────────────────────────────────────────────────
require('dotenv').config();

const express  = require('express');
const cors     = require('cors');
const mongoose = require('mongoose');

const volunteersRouter = require('./routes/volunteers');

const app  = express();
const PORT = process.env.PORT || 3001;

// ── Middleware ────────────────────────────────────────────────
app.use(cors({ origin: '*', methods: ['GET', 'POST', 'PUT', 'DELETE'], allowedHeaders: ['Content-Type'] }));
app.use(express.json());

// Request logger
app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}]  ${req.method.padEnd(6)} ${req.url}`);
  next();
});

// ── MongoDB Connection ─────────────────────────────────────────
const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) {
  console.error('❌  MONGO_URI is not set. Add it to your .env file or Render env vars.');
  process.exit(1);
}

mongoose
  .connect(MONGO_URI)
  .then(() => {
    console.log('');
    console.log('  🍃  MongoDB Connected — volunteer_db');
    console.log('');
  })
  .catch(err => {
    console.error('❌  MongoDB connection failed:', err.message);
    process.exit(1);
  });

mongoose.connection.on('disconnected', () => console.warn('⚠️  MongoDB disconnected'));
mongoose.connection.on('reconnected',  () => console.log('✅  MongoDB reconnected'));

// ── API Routes ─────────────────────────────────────────────────
app.use('/api/volunteers', volunteersRouter);

// Health check
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    db: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    timestamp: new Date().toISOString()
  });
});

// 404
app.use((_req, res) => res.status(404).json({ error: 'Route not found' }));

// Global error handler
app.use((err, _req, res, _next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error', message: err.message });
});

// ── Start ──────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log('');
  console.log('  ✅  Volunteer Backend Running');
  console.log(`  🌐  http://localhost:${PORT}`);
  console.log(`  📋  API:  http://localhost:${PORT}/api/volunteers`);
  console.log(`  💚  Health: http://localhost:${PORT}/health`);
  console.log('');
});
