// routes/generateLabels.js
// -----------------------------------------------------------------------------
// API endpoint: POST /generate-labels
// Generates individual bag labels → merges them via Render service → uploads merged PDF.
// -----------------------------------------------------------------------------

import express from 'express';
import { generateAndUploadLabel } from '../services/pdf.js';
import { mergeAndUpload } from '../services/pdfMerge.js';
import { google } from 'googleapis';
import { GoogleAuth } from 'google-auth-library';

const router = express.Router();

// ---- Config ----
const OUTPUT_FOLDER_ID = '1wGhhU3XulZVW8JzO1AUlq0L3XHNVGG-b'; // Pantry Labels folder

// -----------------------------------------------------------------------------
// POST /generate-labels
// Body: { formId, firstName, lastName, pickupWindow, count }
// -----------------------------------------------------------------------------
router.post('/', async (req, res) => {
  try {
    const { formId, firstName, lastName, pickupWindow, count } = req.body || {};
    const n = Number(count || 0);
    if (!formId || !/^\d{12}$/.test(formId))
      return res.status(400).json({ ok: false, error: 'Invalid or missing Form ID (must be 12 digits).' });
    if (!(n >= 1 && n <= 5))
      return res.status(400).json({ ok: false, error: 'Label count must be between 1 and 5.' });

    const dateText = new Date().toLocaleDateString('en-US');
    const labelFiles = [];

    // 1️⃣  Generate labels one-by-one
    for (let i = 1; i <= n; i++) {
      const label = await generateAndUploadLabel({
        firstName,
        lastName,
        pickupWindow,
        dateText,
        index: i,
        total: n,
        formId,
      });
      if (label.ok) {
        labelFiles.push(label.fileId);
      } else {
        console.warn(`⚠️ Label ${i} failed: ${label.error}`);
      }
    }

    if (labelFiles.length === 0)
      return res.status(500).json({ ok: false, error: 'No labels generated.' });

    // 2️⃣  Merge via Render service
    const mergedName = `BagLabels_${lastName || 'Last'}_${formId}_${Date.now()}.pdf`;
    const merged = await mergeAndUpload({
      fileIds: labelFiles,
      outputName: mergedName,
      outputFolderId: OUTPUT_FOLDER_ID,
    });

    if (!merged.ok)
      return res.status(500).json({ ok: false, error: merged.error || 'Merge failed.' });

    // 3️⃣  Update spreadsheet (optional — placeholder for next phase)
    try {
      const creds = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);
      const auth = new GoogleAuth({
        credentials: creds,
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
      });
      const sheets = google.sheets({ version: 'v4', auth });
      // Example update call will be added in next step
    } catch (err) {
      console.warn('⚠️ Sheet update skipped:', err.message);
    }

    // 4️⃣  Respond
    res.json({
      ok: true,
      count: labelFiles.length,
      merged: {
        id: merged.fileId,
        url: merged.url,
      },
    });
  } catch (err) {
    console.error('❌ /generate-labels failed:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

export default router;