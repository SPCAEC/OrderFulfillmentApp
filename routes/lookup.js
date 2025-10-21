import express from 'express';
import { google } from 'googleapis';
import { GoogleAuth } from 'google-auth-library';

const router = express.Router();

// POST /lookup
router.post('/', async (req, res) => {
  try {
    const creds = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);
    const auth = new GoogleAuth({
      credentials: creds,
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly']
    });
    const sheets = google.sheets({ version: 'v4', auth });

    // Expect body: { formId: 'ABC123' }
    const { formId } = req.body || {};
    if (!formId) throw new Error('Missing formId');

    const sheetId = '1XK2ENcMEi-MYeRY6gzGf1aRR8v9mEDuHZx6s_slm8ZE';
    const range = 'FormResponses!A:Z'; // adjust to your real tab name

    const resp = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range
    });

    const rows = resp.data.values || [];
    const header = rows[0];
    const data = rows.slice(1);

    // Find row by Form ID
    const idx = header.indexOf('Form ID');
    if (idx === -1) throw new Error('No Form ID column');

    const match = data.find(r => r[idx] === formId);
    if (!match) return res.status(404).json({ found: false });

    const rowObj = {};
    header.forEach((h, i) => (rowObj[h] = match[i] || ''));

    res.json({ found: true, row: rowObj });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

export default router;