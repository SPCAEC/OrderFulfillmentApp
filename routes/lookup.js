import express from 'express';
import { google } from 'googleapis';
import { GoogleAuth } from 'google-auth-library';

const router = express.Router();

// ──────────────────────────────────────────────
// POST /lookup
// Body: { formId: '123456789012' }
// ──────────────────────────────────────────────
router.post('/', async (req, res) => {
  try {
    const { formId } = req.body || {};
    if (!formId) throw new Error('Missing formId');

    console.log(`🔍 Lookup request for formId: ${formId}`);

    // Google Sheets auth
    const creds = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);
    const auth = new GoogleAuth({
      credentials: creds,
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly']
    });
    const sheets = google.sheets({ version: 'v4', auth });

    // Config — update sheet/tab name if needed
    const sheetId = '1XK2ENcMEi-MYeRY6gzGf1aRR8v9mEDuHZx6s_slm8ZE';
    const range = 'Form Responses 1!A:Z';

    const resp = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range
    });

    const rows = resp.data.values || [];
    if (rows.length === 0) throw new Error('Sheet is empty');

    const headers = rows[0];
    const data = rows.slice(1);

    // Locate the FormID column (case-insensitive)
    const formIdCol = headers.findIndex(h => /^form\s*id$/i.test(h.trim()));
    if (formIdCol === -1) throw new Error(`No FormID column found. Headers: ${headers.join(', ')}`);

    // Find matching row
    const match = data.find(r => (r[formIdCol] || '').trim() === formId.trim());
    if (!match) return res.status(404).json({ ok: false, error: 'No matching record found.' });

    // Build row object
    const row = {};
    headers.forEach((h, i) => (row[h] = match[i] || ''));

    // Normalize key fields for frontend
    const result = {
      formId: row['FormID'],
      firstName: row['First Name'] || row['Client First Name'] || '',
      lastName: row['Last Name'] || row['Client Last Name'] || '',
      pickupWindow: row['Pickup Window'] || row['Pickup Time'] || '',
      additionalServices: (row['Additional Services'] || '').split(/,\s*/).filter(Boolean),
      alerts: (row['Alerts'] || '').split(/,\s*/).filter(Boolean)
    };

    console.log(`✅ Lookup success for FormID: ${formId}`);

    res.json({ ok: true, data: result });
  } catch (err) {
    console.error('❌ Lookup failed:', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

export default router;