// src/server.ts
import app from './app.js';
import { connectDatabase } from './config/database.js';
import { config } from './config/env.js';

const startServer = async (): Promise<void> => {
  try {
    // Connect to database
    await connectDatabase();
    console.log('✅ Database connected successfully');

    // Start server
    const server = app.listen(config.PORT, () => {
      console.log(`🚀 Server running on port ${config.PORT}`);
    });

    // Graceful shutdown
    process.on('SIGTERM', () => {
      console.log('SIGTERM received, shutting down gracefully');
      server.close(() => {
        console.log('Process terminated');
      });
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
};

startServer()
  .then(() => {
    console.log('server started');
  })
  .catch(err => console.error('this is an error', err));
