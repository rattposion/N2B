import { Router } from 'express';
import aiAssistantController from '../controllers/aiAssistant';
import { authenticate } from '../middleware/auth';

const router = Router();

// Aplicar middleware de autenticação em todas as rotas
router.use(authenticate);

// Rotas para assistentes IA
router.get('/', aiAssistantController.getAssistants);
router.get('/:id', aiAssistantController.getAssistant);
router.post('/', aiAssistantController.createAssistant);
router.put('/:id', aiAssistantController.updateAssistant);
router.delete('/:id', aiAssistantController.deleteAssistant);

// Rotas para chat e treinamento
router.post('/:assistantId/chat', aiAssistantController.chatWithAssistant);
router.post('/:assistantId/train', aiAssistantController.trainAssistant);
router.get('/:assistantId/conversations', aiAssistantController.getConversationHistory);

export default router; 