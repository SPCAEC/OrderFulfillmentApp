import express from "express";
import { log } from "../utils/log.js";
const router = express.Router();

router.post("/", (req, res) => {
  log("🗂️ /api/update called – placeholder only");
  res.json({ status: "ok", message: "Update logic placeholder" });
});

export default router;