// services/pdfMerge.js
// -----------------------------------------------------------------------------
// Combines multiple PDF files (by Drive ID) into a single PDF via external merge service.
// -----------------------------------------------------------------------------

import axios from 'axios';
import { google } from 'googleapis';
import { GoogleAuth } from 'google-auth-library';
import { Readable } from 'stream';

const MERGE_SERVICE_URL = 'https://pdf-merge-service.onrender.com/merge';

// 🔧 Authenticated Drive client
async function getDriveClient() {
  const creds = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);
  const auth = new GoogleAuth({
    credentials: creds,
    scopes: ['https://www.googleapis.com/auth/drive.readonly', 'https://www.googleapis.com/auth/drive.file'],
  });
  return google.drive({ version: 'v3', auth });
}

// -----------------------------------------------------------------------------
// MAIN
// -----------------------------------------------------------------------------
export async function mergeAndUpload({ fileIds, outputName, outputFolderId }) {
  if (!Array.isArray(fileIds) || fileIds.length === 0)
    return { ok: false, error: 'No file IDs provided for merge.' };

  try {
    console.log('🧩 Starting mergeAndUpload');
    console.log('➡️ File IDs:', fileIds);

    const drive = await getDriveClient();

    // 1️⃣ Download PDFs as base64
    const pdfBuffers = await Promise.all(
      fileIds.map(async (id) => {
        const res = await drive.files.get(
          { fileId: id, alt: 'media', supportsAllDrives: true },
          { responseType: 'arraybuffer' }
        );
        console.log(`📥 Downloaded file ${id} (${res.data.byteLength} bytes)`);
        return Buffer.from(res.data).toString('base64');
      })
    );

    // 2️⃣ Merge via external service
    console.log('📡 Sending to merge service...');
    const mergeRes = await axios.post(
      MERGE_SERVICE_URL,
      { files: pdfBuffers },
      { responseType: 'arraybuffer' }
    );

    console.log('✅ Merge completed:', mergeRes.status, '–', mergeRes.data.byteLength, 'bytes');

    // 3️⃣ Upload merged PDF back to Drive
    const pdfStream = Readable.from(Buffer.from(mergeRes.data));
    const driveUpload = await drive.files.create({
      requestBody: {
        name: outputName,
        mimeType: 'application/pdf',
        parents: [outputFolderId],
        driveId: '0AJz8fOdNJhtRUk9PVA',
      },
      media: { mimeType: 'application/pdf', body: pdfStream },
      supportsAllDrives: true,
      fields: 'id, webViewLink, webContentLink',
    });

    console.log('✅ Merged file uploaded:', driveUpload.data);

    // 4️⃣ Clean up originals
    for (const id of fileIds) {
      try {
        await drive.files.delete({ fileId: id, supportsAllDrives: true });
        console.log(`🗑️ Deleted temp file ${id}`);
      } catch (err) {
        console.warn(`⚠️ Could not delete ${id}: ${err.message}`);
      }
    }

    return {
      ok: true,
      fileId: driveUpload.data.id,
      url: driveUpload.data.webViewLink || driveUpload.data.webContentLink,
    };
  } catch (err) {
    console.error('❌ mergeAndUpload failed:', err.message);
    return { ok: false, error: err.message };
  }
}