// services/pdfMerge.js
// -----------------------------------------------------------------------------
// Combines multiple PDF files (by Drive ID) into a single PDF via external merge service.
// -----------------------------------------------------------------------------

import axios from 'axios';
import { google } from 'googleapis';
import { GoogleAuth } from 'google-auth-library';
import { Readable } from 'stream';

const MERGE_SERVICE_URL = 'https://pdf-merge-service.onrender.com/merge';

// 🔧 Helper: Authenticated Drive client
async function getDriveClient() {
  const creds = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);
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

    console.log('🧩 mergeAndUpload started');
    console.log('➡️ File IDs:', fileIds);
    console.log('➡️ Output name:', outputName);
    console.log('➡️ Output folder:', outputFolderId);

    // 1️⃣ Get downloadable URLs for each file
    const urls = await Promise.all(
      fileIds.map(async id => {
        const res = await drive.files.get({
          fileId: id,
          fields: 'webContentLink',
          supportsAllDrives: true,
        });
        const url = res.data.webContentLink;
        if (!url) throw new Error(`No webContentLink for ${id}`);
        return url;
      })
    );

    console.log('✅ Got Drive file URLs:', urls);

    // 2️⃣ Call external merge service
    console.log('📡 Sending to merge service:', MERGE_SERVICE_URL);
    const mergeRes = await axios.post(MERGE_SERVICE_URL, { urls }, { responseType: 'arraybuffer' });
    console.log('✅ Merge service returned', mergeRes.status, mergeRes.headers['content-length'], 'bytes');

    // 3️⃣ Upload merged result to Drive
    console.log('📤 Uploading merged file to Drive...');
    const pdfStream = Readable.from(Buffer.from(mergeRes.data));

    const fileRes = await drive.files.create({
      requestBody: {
        name: outputName,
        mimeType: 'application/pdf',
        parents: [outputFolderId],
        driveId: '0AJz8fOdNJhtRUk9PVA',
      },
      media: {
        mimeType: 'application/pdf',
        body: pdfStream,
      },
      supportsAllDrives: true,
      fields: 'id, webViewLink, webContentLink',
    });

    console.log('✅ Merged PDF uploaded:', fileRes.data);

    // 4️⃣ Clean up individual label PDFs
    for (const id of fileIds) {
      try {
        await drive.files.delete({ fileId: id, supportsAllDrives: true });
        console.log(`🗑️ Deleted temp file ${id}`);
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
    return { ok: false, error: err.message };
  }
}