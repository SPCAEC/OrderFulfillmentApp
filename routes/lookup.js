import express from "express";
import { getAuth } from "../config/googleAuth.js";
import { log } from "../utils/log.js";
import { google } from "googleapis";

const router = express.Router();

router.post("/", async (req, res) => {
  try {
    const { formId } = req.body;
    if (!formId) return res.status(400).json({ error: "Missing formId" });

    const auth = getAuth();
    const sheets = google.sheets({ version: "v4", auth });
    const sheetId = process.env.SHEET_ID;

    const data = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: "FormResponses!A:Z"
    });

    // Placeholder lookup
    const match = data.data.values.find(r => r[0] === formId);
    if (!match) return res.json({ status: "not_found" });

    res.json({ status: "found", row: match });
  } catch (err) {
    log("❌ Lookup error:", err);
    res.status(500).json({ error: err.message });
  }
});

export default router;