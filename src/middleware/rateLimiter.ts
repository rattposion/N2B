import rateLimit from 'express-rate-limit';

export const generalLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'), // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '10000'), // Aumentado drasticamente
  message: {
    error: 'Muitas requisições. Tente novamente em alguns minutos.'
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Pular rate limit para todas as rotas de WhatsApp
    return req.path.includes('/whatsapp-qr') || 
           req.path.includes('/api/whatsapp') ||
           req.path.includes('/sessions');
  }
});

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 50, // Aumentado drasticamente
  message: {
    error: 'Muitas tentativas de login. Tente novamente em 15 minutos.'
  },
  skipSuccessfulRequests: true,
});

export const messageLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 500, // Aumentado drasticamente
  message: {
    error: 'Muitas mensagens enviadas. Aguarde um momento.'
  },
});