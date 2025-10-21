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

    // 1️⃣  Get downloadable URLs for each file
    const urls = await Promise.all(
      fileIds.map(async id => {
        const res = await drive.files.get({
          fileId: id,
          fields: 'webContentLink',
        });
        const url = res.data.webContentLink;
        if (!url) throw new Error(`No webContentLink for ${id}`);
        return url;
      })
    );

    // 2️⃣  Call external merge service
    const mergeRes = await axios.post(MERGE_SERVICE_URL, { urls }, { responseType: 'arraybuffer' });

    // 3️⃣  Upload merged result to Drive
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

    // 4️⃣  Clean up (optional)
    for (const id of fileIds) {
      try {
        await drive.files.delete({ fileId: id });
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