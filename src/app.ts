import cors from 'cors';
import express, { type Application, type Request, type Response } from 'express';

const app: Application = express();

// Middleware
app.use(cors());
app.use(express.json());

// Root route
app.get('/', (req: Request, res: Response) => {
  res.send({
    message: 'Aloskill server running 🚀 with Express.js and TypeScript! with rocket emoji !!!!',
  });
});

export default app;
