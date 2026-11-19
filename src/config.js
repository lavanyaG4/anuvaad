import "dotenv/config";

const isTestEnvironment = process.env.NODE_ENV === 'test';

const {
  MONGODB_URI,
  MONGODB_DATABASE = 'anuvaad',
  PORT = 5000,
  CORS_ORIGINS = 'http://localhost:3000,https://my-expenses-fe.vercel.app',
  GOOGLE_AI_API_KEY,
  GOOGLE_AI_MODEL = 'gemini-3.8-flash',
} = process.env;
const mongodbUri = MONGODB_URI ?? (isTestEnvironment ? 'mongodb://127.0.0.1:27017/anuvaad' : undefined);

if (!mongodbUri) {
  throw new Error('MONGODB_URI is missing. Copy .env.example to .env and add your MongoDB Atlas URL.');
}

export const config = {
  port: Number(process.env.PORT) || 3000,
  mongoUri: process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/anuvaad",
  jwtSecret: process.env.JWT_SECRET || "dev-only-secret-change-me",
  hasSecret:Boolean(process.env.JWT_SECRET),
  isProd: process.env.NODE_ENV === "production",
};

if (config.isProd && !config.hasSecret) throw new Error("Set the JWT_SECRET environment variable in production.");
