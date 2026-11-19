import "dotenv/config";
import dns from "node:dns/promises";
import mongoose from "mongoose";

const uri = process.env.MONGODB_URI;

if (!uri) {
  console.error("MONGODB_URI is missing. Set it in .env or the environment.");
  process.exit(1);
}

const parsedUri = new URL(uri);
if (parsedUri.protocol === "mongodb+srv:") {
  const srvName = `_mongodb._tcp.${parsedUri.hostname}`;

  try {
    console.log("Resolving MongoDB Atlas SRV record:", srvName);
    console.log("DNS records:", await dns.resolveSrv(srvName));
  } catch (error) {
    console.error(
      `Node.js could not resolve ${srvName} (${error.code ?? "DNS error"}). ` +
      "Check the machine's DNS resolver/firewall, or try another network/DNS provider."
    );
    process.exit(1);
  }
}

try {
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 15000 });
  console.log("MongoDB connected successfully!");
} catch (error) {
  console.error("MongoDB connection failed:", error.message);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
