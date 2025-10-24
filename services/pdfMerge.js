// services/pdfMerge.js
// -----------------------------------------------------------------------------
// Combines multiple PDF files (by Drive ID) into a single PDF via external merge service.
// Uses base64 payloads (no public links) and uploads final merged file
// to a separate "Merged Labels" folder.
// -----------------------------------------------------------------------------

import axios from 'axios';
import { google } from 'googleapis';
import { GoogleAuth } from 'google-auth-library';

const MERGE_SERVICE_URL = 'https://pdf-merge-service.onrender.com/merge';
const DRIVE_ID = '0AJz8fOdNJhtRUk9PVA'; // Shared Drive ID
const MERGED_FOLDER_ID = '11KEmLmCPEuJNArjkXSD-hYcYPG6Do5s7'; // ✅ Final merged PDF folder

// ──────────────────────────────────────────────
// Helper: Authenticated Drive client
// ──────────────────────────────────────────────
async function getDriveClient() {
  const creds = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);
  const auth = new GoogleAuth({
    credentials: creds,
    scopes: ['https://www.googleapis.com/auth/drive.file'],
  });
  return google.drive({ version: 'v3', auth });
}

// ──────────────────────────────────────────────
// Helper: Download a Drive file as Base64
// ──────────────────────────────────────────────
async function downloadFileAsBase64(drive, fileId) {
  const res = await drive.files.get(
    { fileId, alt: 'media', supportsAllDrives: true },
    { responseType: 'arraybuffer' }
  );
  const buffer = Buffer.from(res.data);
  return buffer.toString('base64');
}

// ──────────────────────────────────────────────
// MAIN: mergeAndUpload
// -----------------------------------------------------------------------------
export async function mergeAndUpload({ fileIds, outputName }) {
  if (!Array.isArray(fileIds) || fileIds.length === 0)
    return { ok: false, error: 'No file IDs provided for merge.' };

  console.log(`📦 mergeAndUpload: starting merge for ${fileIds.length} files`);

  try {
    const drive = await getDriveClient();

    // 1️⃣  Download each file as base64
    const pdfs = await Promise.all(
      fileIds.map(async id => {
        const res = await drive.files.get(
          { fileId: id, alt: 'media' },
          { responseType: 'arraybuffer' }
        );
        const base64 = Buffer.from(res.data).toString('base64');
        return base64;
      })
    );

    // 2️⃣  Call external merge service (now sending base64 PDFs)
    const mergeRes = await axios.post(
      MERGE_SERVICE_URL,
      { pdfs },
      { responseType: 'arraybuffer' }
    );

    // 3️⃣  Upload merged result to the Merged Labels folder
    const fileRes = await drive.files.create({
      requestBody: {
        name: outputName,
        mimeType: 'application/pdf',
        parents: [outputFolderId],
        driveId: '0AJz8fOdNJhtRUk9PVA'
      },
      media: {
        mimeType: 'application/pdf',
        body: Buffer.from(mergeRes.data)
      },
      supportsAllDrives: true,
      fields: 'id, webViewLink, webContentLink'
    });

    // 4️⃣  Clean up (optional)
    for (const id of fileIds) {
      try {
        await drive.files.delete({ fileId: id, supportsAllDrives: true });
      } catch (err) {
        console.warn(`⚠️ Could not delete temp file ${id}: ${err.message}`);
      }
    }

    return {
      ok: true,
      fileId: fileRes.data.id,
      url: fileRes.data.webViewLink || fileRes.data.webContentLink,
      count: fileIds.length
    };
  } catch (err) {
    console.error('❌ mergeAndUpload failed:', err);
    return { ok: false, error: err.message };
  }
}