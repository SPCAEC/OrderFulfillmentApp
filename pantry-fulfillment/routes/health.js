import express from "express";
export default express.Router().get("/", (req, res) =>
  res.json({ status: "ok", service: "pantry-fulfillment", timestamp: new Date().toISOString() })
);