import { Router } from 'express';
import conversationsController from '../controllers/conversations';
import { authenticate } from '../middleware/auth';

const router = Router();

router.use(authenticate);

router.get('/', conversationsController.getConversations);
router.get('/:id', conversationsController.getConversation);
router.post('/', conversationsController.createConversation);
router.put('/:id', conversationsController.updateConversation);
router.delete('/:id', conversationsController.deleteConversation);
router.get('/stats/overview', conversationsController.getConversationStats);

export default router;