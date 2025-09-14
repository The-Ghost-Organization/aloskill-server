// src/server.ts
import dotenv from 'dotenv';
import express from 'express';

// Load .env variables
dotenv.config();

const app = express();

// Middleware (example)
app.use(express.json());

// ✅ Safe PORT getter
function getEnvPort(): number {
  const port = process.env.PORT;
  if (!port) {
    return 8000;
  } // default
  const parsed = Number(port);
  if (isNaN(parsed)) {
    throw new Error('❌ Invalid PORT value in .env file');
  }
  return parsed;
}

const PORT = getEnvPort();

// Sample route
app.get('/', (_req, res) => {
  res.send('🚀 Aloskill backend running...');
});

// Start server
app.listen(PORT, () => {
  console.log(`✅ Server is running at http://localhost:${PORT}`);
});
