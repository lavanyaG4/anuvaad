import mongoose from "mongoose";
import pino from "pino";
import { config } from "./src/config.js";
import { createApp } from "./src/app.js";

const logger = pino({ level: process.env.LOG_LEVEL || "info", redact: ["req.headers.authorization"] });

try {
  await mongoose.connect(config.mongoUri, { serverSelectionTimeoutMS: 8000 });
} catch (e) {
  logger.fatal({ err: e.message }, "Could not connect to MongoDB. Check MONGODB_URI.");
  process.exit(1);
}
if (!config.hasSecret) logger.warn("JWT_SECRET is not set: using an insecure development secret.");

const server = createApp({ jwtSecret: config.jwtSecret, logger }).listen(config.port, () =>
  logger.info(`Anuvaad running at http://localhost:${config.port}`)
);

process.on("SIGTERM", () => server.close(() => mongoose.disconnect()));
