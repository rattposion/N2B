import { Router } from 'express';
import messagesController from '../controllers/messages';
import { authenticate } from '../middleware/auth';
import { messageValidation } from '../middleware/validation';
import { messageLimiter } from '../middleware/rateLimiter';

const router = Router();

router.use(authenticate);

router.post('/', messageLimiter, messageValidation, messagesController.sendMessage);
router.get('/:conversationId', messagesController.getMessages);
router.patch('/:conversationId/read', messagesController.markAsRead);

export default router;