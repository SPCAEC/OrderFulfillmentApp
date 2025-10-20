import express from "express";
import health from "./routes/health.js";
import lookup from "./routes/lookup.js";
import createLabels from "./routes/createLabels.js";
import update from "./routes/update.js";
import { log } from "./utils/log.js";

const app = express();
app.use(express.json());

// Routes
app.use("/", health);
app.use("/api/lookup", lookup);
app.use("/api/createLabels", createLabels);
app.use("/api/update", update);

// Start server
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => log(`✅ Pantry Fulfillment API listening on port ${PORT}`));