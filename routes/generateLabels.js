// routes/generateLabels.js
// -----------------------------------------------------------------------------
// API endpoint: POST /generate-labels
// Generates individual bag labels → merges them via Render service → uploads merged PDF.
// Fully compatible with Shared Drive + Cloud Run Secret (Option B).
// -----------------------------------------------------------------------------

import fs from 'fs';
import express from 'express';
import { google } from 'googleapis';
import { GoogleAuth } from 'google-auth-library';
import { generateAndUploadLabel } from '../services/pdf.js';
import { mergeAndUpload } from '../services/pdfMerge.js';

const router = express.Router();

// ──────────────────────────────────────────────
// CONFIG
// ──────────────────────────────────────────────
const OUTPUT_FOLDER_ID = '1LslhtWlSpmp-zQgqlpafaHVt7JsYTFdH'; // Pantry Labels folder
const DRIVE_ID = '0AJz8fOdNJhtRUk9PVA'; // Shared Drive ID

// Timestamped logger
function logStep(label, data = null) {
  const now = new Date().toISOString();
  if (data) console.log(`🕓 [${now}] ${label}`, data);
  else console.log(`🕓 [${now}] ${label}`);
}

// Helper: load credentials (works for both secret file + inline JSON)
function loadCreds(scopeLabel) {
  try {
    let creds;
    if (process.env.GOOGLE_SERVICE_ACCOUNT?.startsWith?.('/')) {
      const path = process.env.GOOGLE_SERVICE_ACCOUNT;
      logStep(`🔑 Reading creds from file (${scopeLabel})`, path);
      creds = JSON.parse(fs.readFileSync(path, 'utf8'));
    } else {
      logStep(`🔑 Reading creds from env var (${scopeLabel})`);
      creds = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);
    }
    return creds;
  } catch (err) {
    throw new Error(`Failed to load service account credentials: ${err.message}`);
  }
}

// ──────────────────────────────────────────────
// POST /generate-labels
// Body: { formId, firstName, lastName, pickupWindow, count }
// ──────────────────────────────────────────────
router.post('/', async (req, res) => {
  try {
    logStep('▶️ /generate-labels request received', req.body);
    const { formId, firstName, lastName, pickupWindow, count } = req.body || {};
    const n = Number(count || 0);

    // --- Validation ---
    if (!formId || !/^\d{12}$/.test(formId)) {
      logStep('❌ Validation failed: invalid or missing Form ID');
      return res.status(400).json({ ok: false, error: 'Invalid or missing Form ID (must be 12 digits).' });
    }
    if (!(n >= 1 && n <= 5)) {
      logStep('❌ Validation failed: invalid label count', { count });
      return res.status(400).json({ ok: false, error: 'Label count must be between 1 and 5.' });
    }

    // --- Generate labels individually ---
    const dateText = new Date().toLocaleDateString('en-US');
    const labelFiles = [];
    logStep(`⚙️ Generating ${n} label(s) for ${firstName} ${lastName}`);

    for (let i = 1; i <= n; i++) {
      logStep(`🧾 Starting label ${i} of ${n}`);
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
        logStep(`✅ Label ${i} uploaded successfully`, label);
      } else {
        logStep(`⚠️ Label ${i} failed`, label);
      }
    }

    if (labelFiles.length === 0) {
      logStep('❌ No labels were generated');
      return res.status(500).json({ ok: false, error: 'No labels generated.' });
    }

    // --- Merge via Render service ---
    const mergedName = `BagLabels_${lastName || 'Last'}_${formId}_${Date.now()}.pdf`;
    logStep('📦 Merging labels via Render service', { mergedName, labelFiles });

    const merged = await mergeAndUpload({
      fileIds: labelFiles,
      outputName: mergedName,
      outputFolderId: OUTPUT_FOLDER_ID,
    });

    if (!merged.ok) {
      logStep('❌ Merge service returned error', merged);
      return res.status(500).json({ ok: false, error: merged.error || 'Merge failed.' });
    }

    // --- Placeholder for Sheet update ---
    try {
      const creds = loadCreds('Sheets');
      const auth = new GoogleAuth({
        credentials: creds,
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
      });
      const sheets = google.sheets({ version: 'v4', auth });
      logStep('🧾 Sheets client initialized (no update performed yet)');
    } catch (err) {
      logStep('⚠️ Sheet update skipped', err.message);
    }

    // --- Respond ---
    logStep('✅ All labels processed successfully', {
      count: labelFiles.length,
      merged: merged.fileId,
      driveId: DRIVE_ID,
    });

    res.json({
      ok: true,
      count: labelFiles.length,
      merged: {
        id: merged.fileId,
        url: merged.url,
      },
    });
  } catch (err) {
    console.error('🚨 /generate-labels failed:', err);
    res.status(500).json({ ok: false, error: err.message, stack: err.stack });
  }
});

export default router;