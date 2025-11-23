import { Parser } from "json2csv";
import { query } from "../database/db.js"; // Import shared Supabase connection

// List logs
export const getAllLogs = async (req, res) => {
    try {
        // We select all columns, including the weather data stored in the DB
        const result = await query(
            "SELECT id, timestamp, status, mode, soil, rain, temperature, humidity, weather_condition, wind_speed, location FROM irrigation_history ORDER BY id DESC LIMIT 100"
        );
        res.json(result.rows);
    } catch (err) {
        console.error("Error fetching logs:", err);
        res.status(500).json({ error: "Failed to fetch logs" });
    }
};

// Delete one log
export const deleteLog = async (req, res) => {
    const { id } = req.params;
    try {
        await query("DELETE FROM irrigation_history WHERE id = $1", [id]);
        res.json({ success: true, message: `Deleted log #${id}` });
    } catch (err) {
        console.error("Error deleting log:", err);
        res.status(500).json({ error: "Failed to delete log" });
    }
};

// Delete all logs
export const clearAllLogs = async (req, res) => {
    try {
        await query("DELETE FROM irrigation_history");
        res.json({ success: true, message: "All logs cleared" });
    } catch (err) {
        console.error("Error clearing logs:", err);
        res.status(500).json({ error: "Failed to clear logs" });
    }
};

// Export CSV
export const exportLogsCSV = async (req, res) => {
    try {
        const result = await query(
            "SELECT id, timestamp, status, mode, soil, rain, temperature, humidity, weather_condition, wind_speed, location FROM irrigation_history ORDER BY id DESC"
        );

        const rows = result.rows;

        if (!rows.length) {
            return res.status(404).send("No logs found.");
        }

        // Format data for CSV
        const enhancedData = rows.map(row => ({
            id: row.id,
            timestamp: new Date(row.timestamp).toLocaleString(),
            status: row.status,
            mode: row.mode,
            soil_moisture: row.soil !== null ? `${row.soil}%` : 'N/A',
            rain_level: row.rain !== null ? `${row.rain}%` : 'N/A',
            temperature: row.temperature !== null ? `${row.temperature}°C` : 'N/A',
            weather_condition: row.weather_condition || 'N/A',
            humidity: row.humidity !== null ? `${row.humidity}%` : 'N/A',
            wind_speed: row.wind_speed !== null ? `${row.wind_speed} km/h` : 'N/A',
            location: row.location || 'N/A'
        }));

        const csvFields = [
            { label: 'Log ID', value: 'id' },
            { label: 'Timestamp', value: 'timestamp' },
            { label: 'Pump Status', value: 'status' },
            { label: 'Operation Mode', value: 'mode' },
            { label: 'Soil Moisture', value: 'soil_moisture' },
            { label: 'Rain Level', value: 'rain_level' },
            { label: 'Temperature', value: 'temperature' },
            { label: 'Weather Condition', value: 'weather_condition' },
            { label: 'Humidity', value: 'humidity' },
            { label: 'Wind Speed', value: 'wind_speed' },
            { label: 'Location', value: 'location' }
        ];

        const parser = new Parser({ fields: csvFields });
        const csv = parser.parse(enhancedData);

        const currentDate = new Date();
        const formattedDate = currentDate.toISOString().split('T')[0];
        const formattedTime = currentDate.toTimeString().split(' ')[0].replace(/:/g, '-');
        const filename = `irrigation_history_${formattedDate}_${formattedTime}.csv`;

        res.header("Content-Type", "text/csv");
        res.attachment(filename);
        res.send(csv);

    } catch (error) {
        console.error('Error generating CSV:', error);
        res.status(500).json({ error: 'Failed to generate CSV export' });
    }
};