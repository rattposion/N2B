import { Router } from 'express';
import kanbanController from '../controllers/kanban';
import { authenticate } from '../middleware/auth';

const router = Router();

// Aplicar middleware de autenticação em todas as rotas
router.use(authenticate);

// Rotas para quadros Kanban
router.get('/boards', kanbanController.getBoards);
router.get('/boards/:id', kanbanController.getBoard);
router.post('/boards', kanbanController.createBoard);
router.put('/boards/:id', kanbanController.updateBoard);
router.delete('/boards/:id', kanbanController.deleteBoard);

// Rotas para colunas
router.post('/boards/:boardId/columns', kanbanController.createColumn);
router.put('/columns/:id', kanbanController.updateColumn);
router.delete('/columns/:id', kanbanController.deleteColumn);

// Rotas para cards
router.post('/columns/:columnId/cards', kanbanController.createCard);
router.put('/cards/:id', kanbanController.updateCard);
router.put('/cards/:id/move', kanbanController.moveCard);
router.delete('/cards/:id', kanbanController.deleteCard);

// Rotas para leads
router.get('/leads', kanbanController.getLeads);
router.post('/leads', kanbanController.createLead);
router.put('/leads/:id', kanbanController.updateLead);

export default router; 