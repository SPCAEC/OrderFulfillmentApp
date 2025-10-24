import express from 'express';
import { google } from 'googleapis';
import { GoogleAuth } from 'google-auth-library';

const router = express.Router();

// ---- CONFIG: your sheet + the tab GID you gave ----
const SPREADSHEET_ID = '1JrfUHDAPMCIvOSknKoN3vVR6KQZTKUaNLpsRru7cekU';
const SHEET_GID = 2089414052; // "FormID" lives on this tab

// Resolve tab title from GID
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

function toBool(v) {
  if (typeof v === 'boolean') return v;
  const s = String(v || '').trim().toLowerCase();
  return ['y','yes','true','1'].includes(s);
}

function parseServices(csv) {
  return String(csv || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
}

router.post('/', async (req, res) => {
  try {
    const { formId } = req.body || {};
    if (!formId || !/^\d{12}$/.test(String(formId))) {
      return res.status(400).json({ ok: false, error: 'Missing or invalid formId (12 digits).' });
    }

    // Auth
    const creds = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);
    const auth = new GoogleAuth({
      credentials: creds,
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    });
    const sheets = google.sheets({ version: 'v4', auth });

    // Tab title from GID
    const title = await getSheetTitleByGid(sheets, SPREADSHEET_ID, SHEET_GID);

    // Pull values
    const resp = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: title,
      valueRenderOption: 'UNFORMATTED_VALUE',
      dateTimeRenderOption: 'FORMATTED_STRING',
    });

    const rows = resp.data.values || [];
    if (rows.length < 2) return res.status(404).json({ ok: false, error: 'No data rows.' });

    const headers = rows[0].map(h => String(h || '').trim());
    const dataRows = rows.slice(1);

    // Required columns
    const colFormId = idx(headers, 'FormID');
    if (colFormId === -1) {
      return res.status(500).json({
        ok: false,
        error: `FormID column not found. Headers seen: ${headers.join(', ')}`,
      });
    }

    // Helpful optional columns (use fallbacks)
    const colFirst = idx(headers, 'First Name');
    const colLast = idx(headers, 'Last Name');
    const colTimestamp = idx(headers, 'Timestamp');
    const colPickup =
      idx(headers, 'Pickup Window') !== -1 ? idx(headers, 'Pickup Window')
      : idx(headers, 'Pick-up Window') !== -1 ? idx(headers, 'Pick-up Window')
      : idx(headers, 'Preferred Pickup Window');
    const colServices = idx(headers, 'Additional Services');
    const colPups = idx(headers, 'CountPuppies');
    const colKits = idx(headers, 'CountKittens');

    // Find row by exact FormID match
    const row = dataRows.find(r => String(r[colFormId] || '').trim() === String(formId));
    if (!row) return res.status(404).json({ ok: false, error: 'Order not found for that Form ID.' });

    // Build a header->value object for convenience
    const rowObj = {};
    headers.forEach((h, i) => { rowObj[h] = row[i] ?? ''; });

    // Normalize fields for UI
    const timestampRaw = colTimestamp !== -1 ? row[colTimestamp] : '';
    // Sheets can return formatted string or serial; try both
    let dateRequested = '';
    if (timestampRaw instanceof Date) {
      dateRequested = timestampRaw.toISOString().slice(0, 10);
    } else {
      // Try to parse string
      const d = new Date(String(timestampRaw));
      if (!isNaN(d.valueOf())) dateRequested = d.toISOString().slice(0, 10);
      else dateRequested = String(timestampRaw).split(' ')[0] || '';
    }

    const additionalServices = parseServices(colServices !== -1 ? row[colServices] : '');
    const fleaRequested = additionalServices.some(s => /flea/i.test(s));

    const countPuppies = Number(colPups !== -1 ? row[colPups] : 0) || 0;
    const countKittens = Number(colKits !== -1 ? row[colKits] : 0) || 0;
    const hasPuppyKitten = countPuppies > 0 || countKittens > 0;

    const result = {
      formId: String(row[colFormId]),
      firstName: colFirst !== -1 ? String(row[colFirst] || '') : '',
      lastName: colLast !== -1 ? String(row[colLast] || '') : '',
      pickupWindow: colPickup !== -1 ? String(row[colPickup] || '') : '',
      dateRequested,
      additionalServices,
      fleaRequested,
      countPuppies,
      countKittens,
      alerts: hasPuppyKitten
        ? ['PUPPY/KITTEN ALERT! Did you check for Puppy/Kitten food?']
        : [],
    };

    return res.json({ ok: true, data: result });
  } catch (err) {
    console.error('❌ /lookup failed:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

export default router;