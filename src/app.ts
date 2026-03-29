import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import express from "express";
import routes from "./routes";

const nodeEnv = process.env.NODE_ENV?.trim() || "development";
const envFile = `.env.${nodeEnv}`;
const envPath = path.resolve(process.cwd(), envFile);
const fallbackEnvPath = path.resolve(process.cwd(), ".env");

if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
} else {
  dotenv.config({ path: fallbackEnvPath });
}

const app = express();
app.use(express.json());
app.set("env", nodeEnv);

app.use("/profiles", routes);

const port = Number(process.env.PORT || 3001);

app.listen(port, () => {
  console.log(`ProfileService started on ${port} (env: ${nodeEnv})`);
});
