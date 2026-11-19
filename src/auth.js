import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

export const hashPassword = (pw) => bcrypt.hash(pw, 10);
export const checkPassword = (pw, hash) => bcrypt.compare(pw, hash);
// Compared against when the email is unknown, so "no such user" takes as long as "wrong password"
export const DUMMY_HASH = bcrypt.hashSync("not-a-real-password", 10);

export const signToken = (userId, secret) =>
  jwt.sign({ sub: String(userId) }, secret, { algorithm: "HS256", expiresIn: "7d" });

export function authMiddleware(secret) {
  const read = (req) => {
    const m = /^Bearer (.+)$/.exec(req.get("authorization") || "");
    if (!m) return null;
    try { return jwt.verify(m[1], secret, { algorithms: ["HS256"] }).sub; } catch { return null; }
  };
  return {
    required(req, res, next) {
      req.userId = read(req);
      if (!req.userId) return res.status(401).json({ error: "Please log in." });
      next();
    },
    optional(req, _res, next) { req.userId = read(req); next(); },
  };
}
