import express from 'express';
import { google } from 'googleapis';
import { GoogleAuth } from 'google-auth-library';

const app = express();

// Optional basic route
app.get('/', (req, res) => {
  res.json({ status: 'ok', service: 'order-fulfillment' });
});

// Google Sheets test route
app.get('/test-sheets', async (req, res) => {
  try {
    const creds = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);
    const auth = new GoogleAuth({
      credentials: creds,
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly']
    });
    const sheets = google.sheets({ version: 'v4', auth });

    // Replace this with your real Pantry sheet ID
    const testSheetId = '1JrfUHDAPMCIvOSknKoN3vVR6KQZTKUaNLpsRru7cekU';
    const sheet = await sheets.spreadsheets.values.get({
      spreadsheetId: testSheetId,
      range: 'A1:D5'
    });

    res.json(sheet.data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Cloud Run requires listening on process.env.PORT
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`✅ Server listening on port ${PORT}`);
});