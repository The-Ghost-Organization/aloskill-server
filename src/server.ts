import dotenv from 'dotenv';
import app from './app.js';
import { config } from './config/env';
dotenv.config();

const port = config.port;

app.listen(port, () => {
  console.log(`✅ Server is running at http://localhost:${port}`);
});
