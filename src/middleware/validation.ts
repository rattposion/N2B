import { body, validationResult } from 'express-validator';
import { Request, Response, NextFunction } from 'express';

export const validateRequest = (req: Request, res: Response, next: NextFunction) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: 'Dados inválidos',
      details: errors.array()
    });
  }
  next();
};

export const loginValidation = [
  body('email').isEmail().withMessage('Email inválido'),
  body('password').isLength({ min: 6 }).withMessage('Senha deve ter pelo menos 6 caracteres'),
  validateRequest
];

export const registerValidation = [
  body('name').isLength({ min: 2 }).withMessage('Nome deve ter pelo menos 2 caracteres'),
  body('email').isEmail().withMessage('Email inválido'),
  body('password').isLength({ min: 6 }).withMessage('Senha deve ter pelo menos 6 caracteres'),
  body('companyName').isLength({ min: 2 }).withMessage('Nome da empresa deve ter pelo menos 2 caracteres'),
  validateRequest
];

export const messageValidation = [
  body('content').isLength({ min: 1 }).withMessage('Conteúdo da mensagem é obrigatório'),
  body('conversationId').isUUID().withMessage('ID da conversa inválido'),
  validateRequest
];

export const botValidation = [
  body('name').isLength({ min: 2 }).withMessage('Nome do bot deve ter pelo menos 2 caracteres'),
  body('description').optional().isLength({ max: 500 }).withMessage('Descrição muito longa'),
  validateRequest
];

export const flowValidation = [
  body('name').isLength({ min: 2 }).withMessage('Nome do fluxo deve ter pelo menos 2 caracteres'),
  body('triggers').isArray().withMessage('Gatilhos devem ser um array'),
  body('steps').isArray().withMessage('Etapas devem ser um array'),
  validateRequest
];