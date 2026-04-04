import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import { createServer } from 'http';
import { config } from './config';
import { pool } from './db/connection';
import { initWebSocket } from './services/websocket';
import { initProviders, areContractsConfigured } from './services/blockchain';
import userRoutes from './routes/user';
import globalRoutes from './routes/global';
import p2pRoutes from './routes/p2p';
import adminRoutes from './routes/admin';
import { startIndexer } from './services/indexer';
import { startWorkers, stopWorkers } from './services/workers';
import { initQueues, closeQueues } from './services/queue';
import { errorHandler } from './utils/validation';

const app = express();

// Middleware
app.use(cors());
app.use(helmet());
app.use(morgan('combined'));
app.use(compression());
app.use(express.json());

// Routes
app.use('/api/v1', userRoutes);
app.use('/api/v1', globalRoutes);
app.use('/api/v1', p2pRoutes);
app.use('/api/v1', adminRoutes);

// Error handling middleware
app.use(errorHandler);

// Health check
app.get('/health', (_req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
    });
});

// Create HTTP server and attach WebSocket
const server = createServer(app);
initWebSocket(server);

// Initialize blockchain providers
initProviders();

// Graceful shutdown
async function gracefulShutdown(signal: string): Promise<void> {
    console.log(`${signal} received. Shutting down gracefully...`);
    try {
        await stopWorkers().catch(() => {});
        await closeQueues().catch(() => {});
    } catch { /* ignore */ }
    server.close(() => {
        pool.end().then(() => {
            console.log('PostgreSQL pool closed.');
            process.exit(0);
        });
    });
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

server.listen(config.port, async () => {
    console.log(`KAIRO Backend running on port ${config.port}`);
    console.log(`Environment: ${config.nodeEnv}`);
    console.log(`Health check: http://localhost:${config.port}/health`);
    console.log(`WebSocket: ws://localhost:${config.port}/ws`);

    if (!areContractsConfigured()) {
        console.warn('⚠ Contract addresses not configured. Running in degraded mode (API only, no blockchain features).');
        console.warn('  Set contract addresses in environment variables and restart to enable full functionality.');
        return;
    }

    // Initialize BullMQ scheduled jobs
    await initQueues().catch((err) => console.error('Failed to initialize queues:', err));

    // Start blockchain event indexer
    startIndexer().catch((err) => console.error('Failed to start indexer:', err));

    // Start BullMQ workers
    startWorkers().catch((err) => console.error('Failed to start workers:', err));
});

export default app;
