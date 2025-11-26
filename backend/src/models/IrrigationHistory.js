import mongoose from "mongoose";

const irrigationHistorySchema = new mongoose.Schema({
    timestamp: { type: Date, default: Date.now },
    status: { type: String, enum: ["ON", "OFF"], required: true },
    mode: { type: String, enum: ["Auto", "Manual"], required: true },
    soil: Number,
    rain: Number
}, { timestamps: true });

export default mongoose.model("IrrigationHistory", irrigationHistorySchema);
