import express from "express";
import {
    getAllLogs,
    deleteLog,
    clearAllLogs,
    exportLogsCSV,
} from "../controllers/irrigationHistoryController.js";

const router = express.Router();

// Order matters: put the static path before the dynamic :id route
router.get("/export/csv", exportLogsCSV);
router.delete("/", clearAllLogs);
router.delete("/:id", deleteLog);
router.get("/", getAllLogs);

export default router;
