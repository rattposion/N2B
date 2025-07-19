const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const slowDown = require('express-slow-down');
const { createServer } = require('http');
const { Server } = require('socket.io');
const { PrismaClient } = require('@prisma/client');
const logger = require('./utils/logger');
const errorHandler = require('./middleware/errorHandler');

// Importar rotas
const authRoutes = require('./routes/auth');
const botsRoutes = require('./routes/bots');
const flowsRoutes = require('./routes/flows');
const conversationsRoutes = require('./routes/conversations');
const analyticsRoutes = require('./routes/analytics');
const settingsRoutes = require('./routes/settings');
const knowledgeRoutes = require('./routes/knowledge');
const companiesRoutes = require('./routes/companies');
const usersRoutes = require('./routes/users');
const webhooksRoutes = require('./routes/webhooks');
const n8nRoutes = require('./routes/n8n');

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_URL || "http://localhost:3000",
    methods: ["GET", "POST"]
  }
});

const prisma = new PrismaClient();

// Configurações de segurança
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutos
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100, // máximo 100 requests por IP
  message: {
    error: 'Muitas requisições, tente novamente mais tarde'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Slow down para requests muito frequentes
const speedLimiter = slowDown({
  windowMs: 15 * 60 * 1000, // 15 minutos
  delayAfter: 50, // permitir 50 requests por 15 minutos sem delay
  delayMs: 500 // adicionar 500ms de delay por request após o limite
});

app.use(limiter);
app.use(speedLimiter);

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || "http://localhost:3000",
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Adicionar io ao req para uso nas rotas
app.use((req, res, next) => {
  req.io = io;
  next();
});

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV
  });
});

// Rotas da API
app.use('/api/auth', authRoutes);
app.use('/api/bots', botsRoutes);
app.use('/api/flows', flowsRoutes);
app.use('/api/conversations', conversationsRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/knowledge', knowledgeRoutes);
app.use('/api/companies', companiesRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/webhooks', webhooksRoutes);
app.use('/api/n8n', n8nRoutes);

// Rota para documentação da API
app.get('/api/docs', (req, res) => {
  res.json({
    message: 'API Documentation',
    version: '1.0.0',
    endpoints: {
      auth: '/api/auth',
      bots: '/api/bots',
      flows: '/api/flows',
      conversations: '/api/conversations',
      analytics: '/api/analytics',
      settings: '/api/settings',
      knowledge: '/api/knowledge',
      companies: '/api/companies',
      users: '/api/users',
      webhooks: '/api/webhooks',
      n8n: '/api/n8n'
    }
  });
});

// WebSocket para chat em tempo real
io.on('connection', (socket) => {
  logger.info(`Usuário conectado: ${socket.id}`);

  // Usuário entra em uma conversa
  socket.on('join_conversation', ({ conversationId, userId, userName }) => {
    socket.join(conversationId);
    socket.userId = userId;
    socket.userName = userName;
    
    // Notificar outros usuários na conversa
    socket.to(conversationId).emit('user_joined', {
      userId,
      userName,
      conversationId
    });
    
    logger.info(`Usuário ${userName} entrou na conversa ${conversationId}`);
  });

  // Usuário sai de uma conversa
  socket.on('leave_conversation', ({ conversationId }) => {
    socket.leave(conversationId);
    
    // Notificar outros usuários na conversa
    socket.to(conversationId).emit('user_left', {
      userId: socket.userId,
      userName: socket.userName,
      conversationId
    });
    
    logger.info(`Usuário ${socket.userName} saiu da conversa ${conversationId}`);
  });

  // Nova mensagem
  socket.on('new_message', (data) => {
    socket.to(data.conversationId).emit('new_message', data);
    logger.info(`Nova mensagem na conversa ${data.conversationId}`);
  });

  // Indicador de digitação
  socket.on('typing_start', (data) => {
    socket.to(data.conversationId).emit('typing_start', {
      ...data,
      userId: socket.userId,
      userName: socket.userName
    });
  });

  socket.on('typing_stop', (data) => {
    socket.to(data.conversationId).emit('typing_stop', {
      ...data,
      userId: socket.userId,
      userName: socket.userName
    });
  });

  // Notificações em tempo real
  socket.on('join_notifications', ({ companyId, userId }) => {
    socket.join(`notifications_${companyId}`);
    socket.companyId = companyId;
    socket.userId = userId;
  });

  // Desconexão
  socket.on('disconnect', () => {
    logger.info(`Usuário desconectado: ${socket.id}`);
  });
});

// Middleware de tratamento de erros
app.use(errorHandler);

// Rota 404
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: 'Endpoint não encontrado'
  });
});

// Função para iniciar o servidor
const startServer = async () => {
  try {
    const port = process.env.PORT || 3001;
    
    // Testar conexão com banco de dados
    await prisma.$connect();
    logger.info('Conexão com banco de dados estabelecida');

    server.listen(port, () => {
      logger.info(`🚀 Servidor rodando na porta ${port}`);
      logger.info(`📊 Ambiente: ${process.env.NODE_ENV}`);
      logger.info(`🌐 Health check: http://localhost:${port}/health`);
      logger.info(`📚 API Docs: http://localhost:${port}/api/docs`);
    });
  } catch (error) {
    logger.error('Erro ao iniciar servidor:', error);
    process.exit(1);
  }
};

// Graceful shutdown
const gracefulShutdown = async (signal) => {
  logger.info(`Recebido sinal ${signal}, iniciando graceful shutdown...`);
  
  server.close(async () => {
    logger.info('Servidor HTTP fechado');
    
    try {
      await prisma.$disconnect();
      logger.info('Conexão com banco de dados fechada');
      process.exit(0);
    } catch (error) {
      logger.error('Erro ao fechar conexão com banco:', error);
      process.exit(1);
    }
  });
};

// Capturar sinais de término
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Capturar erros não tratados
process.on('uncaughtException', (error) => {
  logger.error('Erro não tratado:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Promise rejeitada não tratada:', reason);
  process.exit(1);
});

// Iniciar servidor
startServer();

module.exports = { app, server, io }; 