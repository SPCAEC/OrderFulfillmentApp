import { google } from "googleapis";
import { log } from "../utils/log.js";

let auth;

export function getAuth() {
  if (auth) return auth;
  try {
    const creds = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);
    auth = new google.auth.GoogleAuth({
      credentials: creds,
      scopes: [
        "https://www.googleapis.com/auth/drive",
        "https://www.googleapis.com/auth/spreadsheets",
        "https://www.googleapis.com/auth/presentations"
      ]
    });
    log("🔐 Google service account loaded successfully.");
    return auth;
  } catch (err) {
    log("❌ Failed to parse GOOGLE_SERVICE_ACCOUNT secret:", err);
    throw err;
  }
}