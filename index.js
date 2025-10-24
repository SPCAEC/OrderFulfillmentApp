// ──────────────────────────────────────────────
// SPCA Order Fulfillment — Cloud Run Backend
// v1.1.0 (CORS + Health + Sheets Test + Routes)
// ──────────────────────────────────────────────

import express from 'express';
import cors from 'cors';
import { google } from 'googleapis';
import { GoogleAuth } from 'google-auth-library';

import lookupRoute from './routes/lookup.js';
import generateLabelsRoute from './routes/generateLabels.js';

const app = express();

// ──────────────────────────────────────────────
//  CORS Configuration
// ──────────────────────────────────────────────
//
// Allow requests from your Firebase-hosted frontend.
// During development, you can temporarily set origin: '*'.
//
const allowedOrigins = [
  'https://spcaec-food-pantry.web.app',
  'https://spcaec-food-pantry.firebaseapp.com'
];

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like curl, server-to-server)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error(`CORS blocked for origin: ${origin}`));
  },
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Explicitly handle OPTIONS preflight requests for all routes
app.options('*', cors());

// ──────────────────────────────────────────────
//  Global Middleware
// ──────────────────────────────────────────────
app.use(express.json({ limit: '10mb' })); // allow larger payloads if needed

// Simple request logger (optional)
app.use((req, res, next) => {
  console.log(`📩 [${req.method}] ${req.originalUrl}`);
  next();
});

// ──────────────────────────────────────────────
//  Base Health Route
// ──────────────────────────────────────────────
app.get('/', (req, res) => {
  res.json({
    ok: true,
    service: 'order-fulfillment',
    status: 'healthy',
    version: '1.1.0',
    time: new Date().toISOString(),
  });
});

// ──────────────────────────────────────────────
//  Google Sheets Connectivity Test
// ──────────────────────────────────────────────
app.get('/test-sheets', async (req, res) => {
  try {
    const creds = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);
    const auth = new GoogleAuth({
      credentials: creds,
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    });
    const sheets = google.sheets({ version: 'v4', auth });

    const testSheetId = '1JrfUHDAPMCIvOSknKoN3vVR6KQZTKUaNLpsRru7cekU'; // Pantry Sheet
    const sheet = await sheets.spreadsheets.values.get({
      spreadsheetId: testSheetId,
      range: 'A1:D5',
    });

    res.json({ ok: true, rows: sheet.data.values });
  } catch (err) {
    console.error('❌ Error in /test-sheets:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ──────────────────────────────────────────────
//  Main API Routes
// ──────────────────────────────────────────────
app.use('/lookup', lookupRoute);
app.use('/generate-labels', generateLabelsRoute);

// ──────────────────────────────────────────────
//  404 Fallback
// ──────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ ok: false, error: 'Route not found' });
});

// ──────────────────────────────────────────────
//  Global Error Handler
// ──────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('🔥 Uncaught error:', err);
  res.status(500).json({ ok: false, error: err.message || 'Server error' });
});

// ──────────────────────────────────────────────
//  Start Server (Cloud Run entry point)
// ──────────────────────────────────────────────
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`✅ Server listening on port ${PORT}`);
});