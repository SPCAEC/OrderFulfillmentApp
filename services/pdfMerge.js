// services/pdfMerge.js
// -----------------------------------------------------------------------------
// Combines multiple PDF files (by Drive ID) into a single PDF via external merge service.
// Fully Shared Drive compatible and supports Cloud Run secret or inline JSON credentials.
// -----------------------------------------------------------------------------

import fs from 'fs';
import axios from 'axios';
import { google } from 'googleapis';
import { GoogleAuth } from 'google-auth-library';

const MERGE_SERVICE_URL = 'https://pdf-merge-service.onrender.com/merge';
const DRIVE_ID = '0AJz8fOdNJhtRUk9PVA'; // ✅ Shared Drive ID

// Simple timestamped logger
function logStep(label, data = null) {
  const now = new Date().toISOString();
  if (data) console.log(`🕓 [${now}] ${label}`, data);
  else console.log(`🕓 [${now}] ${label}`);
}

// 🔧 Helper: Authenticated Drive client (supports secret file path)
async function getDriveClient() {
  let creds;
  if (process.env.GOOGLE_SERVICE_ACCOUNT?.startsWith?.('/')) {
    const path = process.env.GOOGLE_SERVICE_ACCOUNT;
    logStep('🔑 Reading creds from file', path);
    creds = JSON.parse(fs.readFileSync(path, 'utf8'));
  } else {
    logStep('🔑 Reading creds from env var');
    creds = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);
  }

  const auth = new GoogleAuth({
    credentials: creds,
    scopes: ['https://www.googleapis.com/auth/drive.file'],
  });
  return google.drive({ version: 'v3', auth });
}

// -----------------------------------------------------------------------------
// MAIN: mergeAndUpload
// -----------------------------------------------------------------------------
export async function mergeAndUpload({ fileIds, outputName, outputFolderId }) {
  if (!Array.isArray(fileIds) || fileIds.length === 0)
    return { ok: false, error: 'No file IDs provided for merge.' };

  try {
    const drive = await getDriveClient();
    logStep('📂 Starting mergeAndUpload', { count: fileIds.length, outputName });

    // 1️⃣  Get downloadable URLs for each file
    const urls = [];
    for (const id of fileIds) {
      try {
        const res = await drive.files.get({
          fileId: id,
          fields: 'id, name, webContentLink',
          supportsAllDrives: true,
        });
        if (res.data.webContentLink) {
          urls.push(res.data.webContentLink);
          logStep(`✅ Got webContentLink for ${res.data.name}`, res.data.id);
        } else {
          throw new Error(`No webContentLink for file ${id}`);
        }
      } catch (err) {
        console.error(`⚠️ Failed to get webContentLink for ${id}:`, err.message);
      }
    }

    if (urls.length === 0)
      return { ok: false, error: 'No valid file URLs retrieved from Drive.' };

    logStep('🔗 File URLs ready', urls);

    // 2️⃣  Call external merge service
    logStep('🌀 Sending files to merge service...');
    const mergeRes = await axios.post(MERGE_SERVICE_URL, { urls }, { responseType: 'arraybuffer' });
    logStep('✅ Merge service returned data', { bytes: mergeRes.data?.byteLength });

    // 3️⃣  Upload merged result to Drive (shared drive)
    logStep('📤 Uploading merged PDF...');
    const fileRes = await drive.files.create({
      requestBody: {
        name: outputName,
        mimeType: 'application/pdf',
        parents: [outputFolderId],
        driveId: DRIVE_ID,
      },
      media: {
        mimeType: 'application/pdf',
        body: Buffer.from(mergeRes.data),
      },
      supportsAllDrives: true,
      fields: 'id, name, webViewLink, webContentLink',
    });

    logStep('✅ Merged PDF uploaded', fileRes.data);

    // 4️⃣  Clean up temp files
    for (const id of fileIds) {
      try {
        await drive.files.delete({ fileId: id, supportsAllDrives: true });
        logStep(`🗑️ Deleted temp file ${id}`);
      } catch (err) {
        console.warn(`⚠️ Could not delete temp file ${id}: ${err.message}`);
      }
    }

    return {
      ok: true,
      fileId: fileRes.data.id,
      url: fileRes.data.webViewLink || fileRes.data.webContentLink,
      count: fileIds.length,
    };
  } catch (err) {
    console.error('❌ mergeAndUpload failed:', err);
    return { ok: false, error: err.message, stack: err.stack };
  }
}