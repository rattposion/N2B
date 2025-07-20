import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import { createServer } from 'http';
import { Server } from 'socket.io';
import dotenv from 'dotenv';
import { corsMiddleware, allowedOrigins as corsOrigins } from './config/cors';

// Load environment variables
dotenv.config();

// Import routes
import authRoutes from './routes/auth';
import messagesRoutes from './routes/messages';
import conversationsRoutes from './routes/conversations';
import webhooksRoutes from './routes/webhooks';
import workflowsRoutes from './routes/workflows';
import analyticsRoutes from './routes/analytics';
import whatsappRoutes from './routes/whatsapp';
import campaignsRoutes from './routes/campaigns';
import aiAssistantRoutes from './routes/aiAssistant';
import kanbanRoutes from './routes/kanban';
import adTrackingRoutes from './routes/adTracking';

// Import middleware
import { generalLimiter } from './middleware/rateLimiter';
import logger from './utils/logger';

const app = express();
const server = createServer(app);

// CORS Configuration
const allowedOrigins = [
  'http://localhost:5173',    // Vite dev server
  'http://localhost:3000',    // React dev server
  'http://localhost:8080',    // Vue dev server
  'http://127.0.0.1:5173',   // Alternative localhost
  'http://127.0.0.1:3000',   // Alternative localhost
];

// Add environment variable if it exists
if (process.env.FRONTEND_URL) {
  allowedOrigins.push(process.env.FRONTEND_URL);
}

const io = new Server(server, {
  cors: {
    origin: corsOrigins,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    credentials: true
  }
});

const PORT = process.env.PORT || 3001;

// Middleware
app.use(helmet());

app.use(corsMiddleware);
app.use(morgan('combined'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(generalLimiter);

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/messages', messagesRoutes);
app.use('/api/conversations', conversationsRoutes);
app.use('/api/webhooks', webhooksRoutes);
app.use('/api/workflows', workflowsRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/whatsapp', whatsappRoutes);
app.use('/api/campaigns', campaignsRoutes);
app.use('/api/ai-assistants', aiAssistantRoutes);
app.use('/api/kanban', kanbanRoutes);
app.use('/api/ad-tracking', adTrackingRoutes);

// WebSocket handling
io.on('connection', (socket) => {
  logger.info('Cliente conectado via WebSocket', { socketId: socket.id });

  socket.on('join-company', (companyId: string) => {
    socket.join(`company-${companyId}`);
    logger.info('Cliente entrou na sala da empresa', { socketId: socket.id, companyId });
  });

  socket.on('join-conversation', (conversationId: string) => {
    socket.join(`conversation-${conversationId}`);
    logger.info('Cliente entrou na conversa', { socketId: socket.id, conversationId });
  });

  socket.on('disconnect', () => {
    logger.info('Cliente desconectado', { socketId: socket.id });
  });
});

// Global error handler
app.use((error: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  logger.error('Erro não tratado', { 
    error: error.message, 
    stack: error.stack,
    url: req.url,
    method: req.method
  });
  
  res.status(500).json({ 
    error: 'Erro interno do servidor',
    ...(process.env.NODE_ENV === 'development' && { details: error.message })
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Rota não encontrada' });
});

// Start server
server.listen(PORT, () => {
  logger.info(`Servidor rodando na porta ${PORT}`);
  logger.info(`Ambiente: ${process.env.NODE_ENV || 'development'}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('Recebido SIGTERM, encerrando servidor...');
  server.close(() => {
    logger.info('Servidor encerrado');
    process.exit(0);
  });
});

export { io };