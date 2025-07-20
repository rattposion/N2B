import { Router } from 'express';
import authController from '../controllers/auth';
import { loginValidation, registerValidation } from '../middleware/validation';
import { authLimiter } from '../middleware/rateLimiter';
import { authenticate } from '../middleware/auth';

const router = Router();

router.post('/register', authLimiter, registerValidation, authController.register);
router.post('/login', authLimiter, loginValidation, authController.login);
router.post('/refresh', authController.refreshToken);
router.post('/logout', authController.logout);
router.get('/me', authenticate, authController.me);

export default router;