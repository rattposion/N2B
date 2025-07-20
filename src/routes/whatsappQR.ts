import { Router } from 'express';
import whatsappQRController from '../controllers/whatsappQR';
import { authenticate } from '../middleware/auth';

const router = Router();

// Aplicar middleware de autenticação em todas as rotas
router.use(authenticate);

// Rotas para gerenciar sessões WhatsApp via QR Code
router.get('/sessions', whatsappQRController.getSessions);
router.post('/sessions', whatsappQRController.createSession);
router.delete('/sessions/:sessionId', whatsappQRController.disconnectSession);
router.get('/sessions/:sessionId/status', whatsappQRController.getSessionStatus);
router.post('/sessions/:sessionId/send', whatsappQRController.sendMessage);

export default router; 