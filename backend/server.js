import app from "./src/app.js";
import dotenv from "dotenv";
dotenv.config();
import connectDB from "./src/config/db.js";

connectDB();

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});