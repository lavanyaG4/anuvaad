import mongoose from "mongoose";
const { Schema, model } = mongoose;

const userSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    name: { type: String, trim: true, default: "" },
    passwordHash: { type: String, required: true, select: false },
  },
  { timestamps: true }
);
export const User = model("User", userSchema);

// A phrase the user saved from a translation result
const phraseSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true },
    source: String, text: String,          // what they typed, and in which language
    lang: String, translation: String,     // the saved result
    telugu: String, roman: String,         // its pronunciation guides
  },
  { timestamps: true }
);
phraseSchema.index({ user: 1, lang: 1, translation: 1 }, { unique: true }); // saving twice is a no-op
phraseSchema.index({ user: 1, createdAt: -1 });                              // newest first
export const Phrase = model("Phrase", phraseSchema);

// Recent searches. One row per distinct sentence; expires after 30 days.
const historySchema = new Schema({
  user: { type: Schema.Types.ObjectId, ref: "User", required: true },
  source: String,
  text: String,
  count: Number,       // set by $inc on upsert (no schema defaults, so they cannot clash with it)
  lastUsedAt: Date,
});
historySchema.index({ user: 1, source: 1, text: 1 }, { unique: true });
historySchema.index({ user: 1, lastUsedAt: -1 });
historySchema.index({ lastUsedAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 30 });
export const History = model("History", historySchema);
