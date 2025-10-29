import express, { Express } from 'express';
import https from 'https';
import fs from 'fs';
import cors from 'cors';
import dotenv from 'dotenv';
import authRoutes from './routes/auth';
import meetingRoutes from './routes/meetings';
import { WebSocketManager } from './websocket/WebSocketManager';
import { errorHandler } from './middleware/errorHandler';
import prisma from './config/prisma';
import { logger } from './utils/logger';

// Load environment variables
dotenv.config();

const app: Express = express();
const PORT = process.env.PORT || 3000;

// Create HTTP server
// const httpServer = http.createServer(app);
const httpsServer = https.createServer({
  key: fs.readFileSync('src/ssl/key.pem','utf-8'),
  cert: fs.readFileSync('src/ssl/cert.pem','utf-8'),
}, app);
// Middleware
app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:5173',
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use((req, _res, next) => {
  logger.info(`${req.method} ${req.path}`);
  next();
});

// Health check
app.get('/health', (_, res) => {
  res.json({
    success: true,
    message: 'Signaling server is running',
    timestamp: new Date().toISOString()
  });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/meetings', meetingRoutes);

// 404 handler
app.use('*', (_, res) => {
  res.status(404).json({
    success: false,
    error: 'Route not found'
  });
});

// Error handler
app.use(errorHandler);

// Initialize WebSocket Manager
new WebSocketManager(httpsServer);

// Graceful shutdown
const shutdown = async () => {
  logger.info('Shutting down gracefully...');
  
  // Close HTTP server
  httpsServer.close(() => {
    logger.info('HTTP server closed');
  });

  // Disconnect Prisma
  await prisma.$disconnect();
  logger.info('Database connection closed');

  process.exit(0);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// Start server
httpsServer.listen(PORT, () => {
  logger.info(`Signaling server running on port ${PORT}`);
  logger.info(` WebSocket server ready`);
  logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
  logger.info(`Database: Connected`);
});

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  shutdown();
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', { promise, reason });
  shutdown();
});

export default app;