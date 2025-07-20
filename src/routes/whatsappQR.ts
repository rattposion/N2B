import { Router } from 'express';
import whatsappQRController from '../controllers/whatsappQR';
import { authenticate } from '../middleware/auth';
import { AuthRequest } from '../types';
import logger from '../utils/logger';

const router = Router();

// Aplicar middleware de autenticação em todas as rotas
router.use(authenticate);

// Rota de teste para verificar autenticação
router.get('/test', (req: AuthRequest, res) => {
  logger.info('Teste de autenticação', { 
    user: req.user?.id, 
    companyId: req.user?.companyId,
    email: req.user?.email 
  });
  res.json({ 
    success: true, 
    message: 'Autenticação funcionando',
    user: {
      id: req.user?.id,
      email: req.user?.email,
      companyId: req.user?.companyId
    }
  });
});

// Rotas para gerenciar sessões WhatsApp via QR Code
router.get('/sessions', whatsappQRController.getSessions);
router.post('/sessions', whatsappQRController.createSession);
router.delete('/sessions/:sessionId', whatsappQRController.disconnectSession);
router.get('/sessions/:sessionId/status', whatsappQRController.getSessionStatus);
router.post('/sessions/:sessionId/send', whatsappQRController.sendMessage);

export default router; 