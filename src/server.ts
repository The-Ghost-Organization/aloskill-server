import dotenv from 'dotenv';
import app from './app';
dotenv.config();

const PORT = process.env.PORT ?? 5000;

app.listen(port, () => {
  console.log(`✅ Server is running at http://localhost:${PORT}`);
});
