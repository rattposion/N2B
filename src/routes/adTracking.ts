import { Router } from 'express';
import adTrackingController from '../controllers/adTracking';
import { authenticate } from '../middleware/auth';

const router = Router();

// Aplicar middleware de autenticação em todas as rotas
router.use(authenticate);

// Rotas para rastreamento de anúncios
router.get('/', adTrackingController.getAdTracking);
router.get('/stats', adTrackingController.getAdTrackingStats);
router.get('/:id', adTrackingController.getAdTrackingById);
router.post('/', adTrackingController.createAdTracking);
router.put('/:id', adTrackingController.updateAdTracking);
router.delete('/:id', adTrackingController.deleteAdTracking);

// Rotas para captura de leads
router.post('/:adTrackingId/capture-lead', adTrackingController.captureLeadFromAd);

// Rotas para importação de anúncios
router.post('/import/facebook', adTrackingController.importFacebookAd);
router.post('/import/google', adTrackingController.importGoogleAd);

export default router; 