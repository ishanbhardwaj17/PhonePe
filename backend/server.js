import app from "./src/app.js";
import dotenv from "dotenv";
dotenv.config();
import connectDB from "./src/config/db.js";

connectDB();

app.listen(process.env.PORT, () => {
    console.log(`Server is running on port ${process.env.PORT}`);
});