import dotenv from "dotenv";
import path from "node:path";
import { createApp } from "./app.js";

dotenv.config({ path: path.resolve(process.cwd(), "backend/.env") });

const port = Number(process.env.PORT ?? 3101);
const staticDir = path.resolve(process.cwd(), "frontend/dist");

createApp({ staticDir }).listen(port, () => {
  console.log(`Agnes Studio: http://localhost:${port}`);
});
