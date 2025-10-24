// services/pdfMerge.js
// -----------------------------------------------------------------------------
// Combines multiple Drive PDF files (by fileId) into a single PDF via the Render
// merge service that expects base64 PDF data, then uploads the merged file back
// into a designated Drive folder.
// -----------------------------------------------------------------------------

import axios from "axios";
import { google } from "googleapis";
import { GoogleAuth } from "google-auth-library";

// ──────────────────────────────────────────────
// CONFIG
// ──────────────────────────────────────────────
const MERGE_SERVICE_URL = "https://pdf-merge-service.onrender.com/merge";
const MERGED_FOLDER_ID = "11KEmLmCPEuJNArjkXSD-hYcYPG6Do5s7"; // ✅ merged PDFs go here

// Simple timestamped log (Cloud Run compatible)
function logStep(label, data = null) {
  const now = new Date().toISOString();
  if (data) console.log(`🕓 [${now}] ${label}`, data);
  else console.log(`🕓 [${now}] ${label}`);
}

// ──────────────────────────────────────────────
// HELPER: Authenticated Drive client
// ──────────────────────────────────────────────
async function getDriveClient() {
  const creds = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);
  const auth = new GoogleAuth({
    credentials: creds,
    scopes: ["https://www.googleapis.com/auth/drive.file"],
  });
  return google.drive({ version: "v3", auth });
}

// ──────────────────────────────────────────────
// MAIN: mergeAndUpload()
// -----------------------------------------------------------------------------
export async function mergeAndUpload({ fileIds, outputName, outputFolderId }) {
  if (!Array.isArray(fileIds) || fileIds.length === 0) {
    return { ok: false, error: "No file IDs provided for merge." };
  }

  try {
    const drive = await getDriveClient();
    logStep("▶️ mergeAndUpload started", { count: fileIds.length });

    // 1️⃣  Download each Drive file as arrayBuffer → convert to base64
    const files = await Promise.all(
      fileIds.map(async (id, i) => {
        try {
          const res = await drive.files.get(
            { fileId: id, alt: "media" },
            { responseType: "arraybuffer" }
          );
          const base64 = Buffer.from(res.data).toString("base64");
          logStep(`📄 Downloaded file ${i + 1}/${fileIds.length}`, {
            id,
            bytes: base64.length,
          });
          return { name: `${id}.pdf`, data: base64 };
        } catch (err) {
          logStep(`❌ Failed to download file ${id}`, err.message);
          throw err;
        }
      })
    );

    logStep("✅ All files downloaded", { total: files.length });

    // 2️⃣  Send to Render merge service
    logStep("📤 Sending merge request to Render", {
      url: MERGE_SERVICE_URL,
      fileCount: files.length,
      sample: files[0]?.name,
    });

    const mergeRes = await axios.post(
      MERGE_SERVICE_URL,
      { files },
      { responseType: "arraybuffer" }
    );

    const mergedBytes = mergeRes.data;
    logStep("✅ Merge service returned PDF", {
      bytes: mergedBytes.byteLength,
      status: mergeRes.status,
    });

    // 3️⃣  Upload merged PDF back to Drive
    const driveTarget = outputFolderId || MERGED_FOLDER_ID;
    const mergedFileName = outputName || `Merged_${Date.now()}.pdf`;

    const fileRes = await drive.files.create({
      requestBody: {
        name: mergedFileName,
        mimeType: "application/pdf",
        parents: [driveTarget],
        driveId: "0AJz8fOdNJhtRUk9PVA",
      },
      media: { mimeType: "application/pdf", body: Buffer.from(mergedBytes) },
      supportsAllDrives: true,
      fields: "id, name, webViewLink, webContentLink",
    });

    logStep("✅ Merged file uploaded to Drive", fileRes.data);

    // 4️⃣  Cleanup temp files
    for (const id of fileIds) {
      try {
        await drive.files.delete({ fileId: id, supportsAllDrives: true });
        logStep(`🧹 Deleted temp file ${id}`);
      } catch (err) {
        logStep(`⚠️ Could not delete temp file ${id}:`, err.message);
      }
    }

    return {
      ok: true,
      fileId: fileRes.data.id,
      url: fileRes.data.webViewLink || fileRes.data.webContentLink,
      count: fileIds.length,
    };
  } catch (err) {
    console.error("❌ mergeAndUpload failed:", err);
    return { ok: false, error: err.message, stack: err.stack };
  }
}