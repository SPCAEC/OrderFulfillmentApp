import express from 'express';
import { google } from 'googleapis';
import { GoogleAuth } from 'google-auth-library';

const router = express.Router();

// ─────────── CONFIG ───────────
const SPREADSHEET_ID = '1JrfUHDAPMCIvOSknKoN3vVR6KQZTKUaNLpsRru7cekU';
const SHEET_GID = 2089414052;

// Utility: resolve tab name from GID
async function getSheetTitleByGid(sheetsClient, spreadsheetId, gid) {
  const meta = await sheetsClient.spreadsheets.get({
    spreadsheetId,
    fields: 'sheets(properties(sheetId,title))',
  });
  const sheet = (meta.data.sheets || [])
    .map(s => s.properties)
    .find(p => p.sheetId === gid);
  if (!sheet) throw new Error(`No sheet/tab found for gid ${gid}`);
  return sheet.title;
}

function idx(headers, name) {
  return headers.findIndex(h => String(h).trim().toLowerCase() === String(name).trim().toLowerCase());
}

// ─────────── ROUTE ───────────
// POST /update-after-generate
// Body: {
//   formId: '123456789012',
//   pdfId: 'abc123xyz',
//   pdfUrl: 'https://...',
//   fleaProvided: true
// }
router.post('/', async (req, res) => {
  try {
    const { formId, pdfId, pdfUrl, fleaProvided } = req.body || {};
    if (!formId) throw new Error('Missing formId');
    if (!pdfId && !pdfUrl) throw new Error('Missing PDF data');

    // Auth
    const creds = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);
    const auth = new GoogleAuth({
      credentials: creds,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    const sheets = google.sheets({ version: 'v4', auth });

    // Resolve title
    const title = await getSheetTitleByGid(sheets, SPREADSHEET_ID, SHEET_GID);

    // Pull rows to find the right one
    const resp = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${title}!A:Z`,
    });

    const rows = resp.data.values || [];
    const headers = rows[0] || [];
    const data = rows.slice(1);

    const colFormId = idx(headers, 'FormID');
    if (colFormId === -1) throw new Error('No FormID column found.');

    // Find row number (add 2 since rows[0] is header, and Sheets rows are 1-indexed)
    const rowIndex = data.findIndex(r => String(r[colFormId] || '').trim() === String(formId));
    if (rowIndex === -1) throw new Error(`FormID ${formId} not found.`);
    const targetRow = rowIndex + 2;

    // Columns to update (find them dynamically by name)
    const colPdfId = idx(headers, 'Generated PDF Id');
    const colPdfUrl = idx(headers, 'Generated PDF URL');
    const colGeneratedAt = idx(headers, 'Generated At');
    const colFleaProvided = idx(headers, 'Flea Medication Provided');

    // Build update range/value pairs
    const updates = [];
    const now = new Date().toISOString();

    if (colPdfId !== -1) updates.push({ range: `${title}!${columnLetter(colPdfId)}${targetRow}`, value: pdfId });
    if (colPdfUrl !== -1) updates.push({ range: `${title}!${columnLetter(colPdfUrl)}${targetRow}`, value: pdfUrl });
    if (colGeneratedAt !== -1) updates.push({ range: `${title}!${columnLetter(colGeneratedAt)}${targetRow}`, value: now });
    if (colFleaProvided !== -1) updates.push({ range: `${title}!${columnLetter(colFleaProvided)}${targetRow}`, value: fleaProvided ? 'TRUE' : 'FALSE' });

    if (updates.length === 0) {
      return res.status(400).json({ ok: false, error: 'No matching columns found to update.' });
    }

    // Execute batch update
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: {
        valueInputOption: 'USER_ENTERED',
        data: updates.map(u => ({ range: u.range, values: [[u.value]] })),
      },
    });

    console.log(`✅ Updated row ${targetRow} for FormID ${formId}`);
    res.json({ ok: true, updatedRow: targetRow, columns: updates.length });
  } catch (err) {
    console.error('❌ update-after-generate failed:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Helper: convert zero-based column index to letter
function columnLetter(idx) {
  let s = '';
  let n = idx + 1;
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - m) / 26);
  }
  return s;
}

export default router;