import { Router } from 'express';
import campaignsController from '../controllers/campaigns';
import { authenticate } from '../middleware/auth';

const router = Router();

// Aplicar middleware de autenticação em todas as rotas
router.use(authenticate);

// Rotas para campanhas
router.get('/', campaignsController.getCampaigns);
router.get('/:id', campaignsController.getCampaign);
router.post('/', campaignsController.createCampaign);
router.put('/:id', campaignsController.updateCampaign);
router.delete('/:id', campaignsController.deleteCampaign);
router.post('/:id/execute', campaignsController.executeCampaign);

// Rotas para contatos
router.get('/contacts', campaignsController.getContacts);
router.post('/contacts', campaignsController.createContact);

export default router; 