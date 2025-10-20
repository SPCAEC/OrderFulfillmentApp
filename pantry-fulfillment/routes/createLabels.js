import express from "express";
import { log } from "../utils/log.js";

const router = express.Router();

router.post("/", async (req, res) => {
  log("📦 /api/createLabels called – placeholder only");
  res.json({
    status: "pending",
    message: "Label generation not yet implemented"
  });
});

export default router;