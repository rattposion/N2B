import { Router } from 'express';
import workflowsController from '../controllers/workflows';
import { authenticate } from '../middleware/auth';

const router = Router();

router.use(authenticate);

// Rotas de flows
router.get('/', workflowsController.getFlows);
router.get('/:id', workflowsController.getFlow);
router.post('/', workflowsController.createFlow);
router.put('/:id', workflowsController.updateFlow);
router.delete('/:id', workflowsController.deleteFlow);

// Rotas de execução
router.post('/execute', workflowsController.executeFlow);
router.get('/executions', workflowsController.getExecutions);
router.get('/executions/:id', workflowsController.getExecution);

// Rotas de estatísticas
router.get('/stats/overview', workflowsController.getFlowStats);

export default router; 