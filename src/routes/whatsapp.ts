import { Router } from 'express';
import whatsappController from '../controllers/whatsapp';
import { authenticate } from '../middleware/auth';

const router = Router();

// Aplicar middleware de autenticação em todas as rotas
router.use(authenticate);

// Rotas para gerenciar números de WhatsApp
router.get('/numbers', whatsappController.getNumbers);
router.post('/numbers', whatsappController.createNumber);
router.put('/numbers/:id', whatsappController.updateNumber);
router.delete('/numbers/:id', whatsappController.deleteNumber);

// Rotas para envio em massa
router.post('/bulk-send', whatsappController.sendBulkMessage);

// Rotas para webhooks (sem autenticação)
router.get('/webhook/:whatsappNumberId', whatsappController.verifyWebhook);
router.post('/webhook/:whatsappNumberId', whatsappController.handleWebhook);

export default router; 