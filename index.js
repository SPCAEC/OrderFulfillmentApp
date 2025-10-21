import express from 'express';
import { google } from 'googleapis';
import { GoogleAuth } from 'google-auth-library';
import lookupRoute from './routes/lookup.js';
import generateLabelsRoute from './routes/generateLabels.js';

const app = express();

// Middleware
app.use(express.json()); // enables JSON parsing for POST bodies

// ──────────────────────────────────────────────
//  Base health route
// ──────────────────────────────────────────────
app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    service: 'order-fulfillment',
    version: '1.0.0'
  });
});

// ──────────────────────────────────────────────
//  Google Sheets Test Route
// ──────────────────────────────────────────────
app.get('/test-sheets', async (req, res) => {
  try {
    const creds = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);
    const auth = new GoogleAuth({
      credentials: creds,
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly']
    });
    const sheets = google.sheets({ version: 'v4', auth });

    const testSheetId = '1JrfUHDAPMCIvOSknKoN3vVR6KQZTKUaNLpsRru7cekU'; // Pantry Sheet
    const sheet = await sheets.spreadsheets.values.get({
      spreadsheetId: testSheetId,
      range: 'A1:D5'
    });

    res.json(sheet.data);
  } catch (err) {
    console.error('❌ Error in /test-sheets:', err);
    res.status(500).json({ error: err.message });
  }
});

// ──────────────────────────────────────────────
//  Routes
// ──────────────────────────────────────────────
app.use('/lookup', lookupRoute);
app.use('/generate-labels', generateLabelsRoute);

// ──────────────────────────────────────────────
//  Start server (required for Cloud Run)
// ──────────────────────────────────────────────
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`✅ Server listening on port ${PORT}`);
});