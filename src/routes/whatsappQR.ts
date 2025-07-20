import { Router } from 'express';
import whatsappQRController from '../controllers/whatsappQR';
import { authenticate } from '../middleware/auth';
import { AuthRequest } from '../types';
import logger from '../utils/logger';
import whatsappQRService from '../services/whatsappQRService';

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

// Rota para obter estatísticas das sessões
router.get('/stats', (req: AuthRequest, res) => {
  try {
    const stats = whatsappQRService.getSessionStats();
    res.json({ 
      success: true, 
      stats 
    });
  } catch (error) {
    logger.error('Erro ao obter estatísticas', { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: 'Erro ao obter estatísticas' });
  }
});

// Rota para limpar sessões antigas
router.post('/cleanup', async (req: AuthRequest, res) => {
  try {
    await whatsappQRService.cleanupOldSessions();
    const stats = whatsappQRService.getSessionStats();
    res.json({ 
      success: true, 
      message: 'Limpeza concluída',
      stats 
    });
  } catch (error) {
    logger.error('Erro ao executar limpeza', { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: 'Erro ao executar limpeza' });
  }
});

// Rotas para gerenciar sessões WhatsApp via QR Code
router.get('/sessions', whatsappQRController.getSessions);
router.post('/sessions', whatsappQRController.createSession);
router.delete('/sessions/:sessionId', whatsappQRController.disconnectSession);
router.get('/sessions/:sessionId/status', whatsappQRController.getSessionStatus);
router.post('/sessions/:sessionId/send', whatsappQRController.sendMessage);

export default router; 