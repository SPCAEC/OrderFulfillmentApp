// services/pdfMerge.js
// -----------------------------------------------------------------------------
// Combines multiple PDF files (by Drive ID) into a single PDF via external merge service.
// -----------------------------------------------------------------------------

import axios from 'axios';
import { google } from 'googleapis';
import { GoogleAuth } from 'google-auth-library';

const MERGE_SERVICE_URL = 'https://pdf-merge-service.onrender.com/merge';

// 🔧 Helper: Authenticated Drive client
async function getDriveClient() {
  const creds = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);
  const auth = new GoogleAuth({
    credentials: creds,
    scopes: ['https://www.googleapis.com/auth/drive.readonly', 'https://www.googleapis.com/auth/drive.file'],
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

    console.log(`📦 Fetching ${fileIds.length} PDFs for merge...`);

    // 1️⃣ Download each file as base64
    const files = [];
    for (const id of fileIds) {
      try {
        const res = await drive.files.get(
          { fileId: id, alt: 'media' },
          { responseType: 'arraybuffer' }
        );
        const base64Content = Buffer.from(res.data).toString('base64');
        files.push({ name: `${id}.pdf`, content: base64Content });
      } catch (err) {
        console.error(`⚠️ Failed to fetch file ${id}:`, err.message);
      }
    }

    console.log(`🧾 Prepared ${files.length}/${fileIds.length} files for merge`);

    if (files.length === 0)
      throw new Error('No valid base64 PDFs fetched for merge.');

    // 2️⃣ Send to Render merge service
    console.log(`🚀 Sending ${files.length} files to merge service...`);
    const mergeRes = await axios.post(MERGE_SERVICE_URL, { files }, { responseType: 'arraybuffer' });

    // 3️⃣ Upload merged file back to Drive
    const fileRes = await drive.files.create({
      requestBody: {
        name: outputName,
        mimeType: 'application/pdf',
        parents: [outputFolderId],
      },
      media: {
        mimeType: 'application/pdf',
        body: Buffer.from(mergeRes.data),
      },
      fields: 'id, webViewLink, webContentLink',
    });

    // 4️⃣ Optional cleanup
    for (const id of fileIds) {
      try {
        await drive.files.delete({ fileId: id });
      } catch (err) {
        console.warn(`⚠️ Could not delete temp file ${id}: ${err.message}`);
      }
    }

    console.log(`✅ Merged PDF uploaded: ${fileRes.data.id}`);

    return {
      ok: true,
      fileId: fileRes.data.id,
      url: fileRes.data.webViewLink || fileRes.data.webContentLink,
      count: files.length,
    };
  } catch (err) {
    console.error('❌ mergeAndUpload failed:', err);
    return { ok: false, error: err.message };
  }
}