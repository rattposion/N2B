const express = require('express');
const { PrismaClient } = require('@prisma/client');
const n8nService = require('../services/n8n');
const logger = require('../utils/logger');
const auth = require('../middleware/auth');

const router = express.Router();
const prisma = new PrismaClient();

// Endpoint para receber webhooks do n8n
router.post('/n8n', async (req, res) => {
  try {
    const signature = req.headers['x-p2a-signature'];
    const payload = req.body;

    if (!signature) {
      return res.status(401).json({
        success: false,
        message: 'Assinatura não fornecida'
      });
    }

    // Processar webhook do n8n
    const result = await n8nService.processIncomingWebhook(payload, signature);

    logger.info('Webhook do n8n processado com sucesso', {
      type: payload.type,
      result: result
    });

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    logger.error('Erro ao processar webhook do n8n:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

// Endpoint para disparar webhook para n8n
router.post('/trigger', auth, async (req, res) => {
  try {
    const { webhookUrl, data, options } = req.body;

    if (!webhookUrl) {
      return res.status(400).json({
        success: false,
        message: 'URL do webhook é obrigatória'
      });
    }

    const result = await n8nService.triggerWebhook(webhookUrl, data, options);

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    logger.error('Erro ao disparar webhook:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

// Endpoint para obter workflows do n8n
router.get('/workflows', auth, async (req, res) => {
  try {
    const workflows = await n8nService.getWorkflows();

    res.json({
      success: true,
      data: workflows
    });
  } catch (error) {
    logger.error('Erro ao obter workflows:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

// Endpoint para obter workflow específico
router.get('/workflows/:id', auth, async (req, res) => {
  try {
    const workflow = await n8nService.getWorkflow(req.params.id);

    res.json({
      success: true,
      data: workflow
    });
  } catch (error) {
    logger.error('Erro ao obter workflow:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

// Endpoint para executar workflow
router.post('/workflows/:id/execute', auth, async (req, res) => {
  try {
    const { data } = req.body;
    const result = await n8nService.executeWorkflow(req.params.id, data);

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    logger.error('Erro ao executar workflow:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

// Endpoint para verificar saúde do n8n
router.get('/health', async (req, res) => {
  try {
    const health = await n8nService.checkN8nHealth();

    res.json({
      success: true,
      data: health
    });
  } catch (error) {
    logger.error('Erro ao verificar saúde do n8n:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

// Endpoint para obter estatísticas do n8n
router.get('/stats', auth, async (req, res) => {
  try {
    const stats = await n8nService.getN8nStats();

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    logger.error('Erro ao obter estatísticas do n8n:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

// Endpoint para disparar evento de conversa criada
router.post('/events/conversation-created', auth, async (req, res) => {
  try {
    const { conversationData } = req.body;

    if (!conversationData) {
      return res.status(400).json({
        success: false,
        message: 'Dados da conversa são obrigatórios'
      });
    }

    const result = await n8nService.triggerConversationCreated(conversationData);

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    logger.error('Erro ao disparar evento de conversa criada:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

// Endpoint para disparar evento de mensagem recebida
router.post('/events/message-received', auth, async (req, res) => {
  try {
    const { messageData } = req.body;

    if (!messageData) {
      return res.status(400).json({
        success: false,
        message: 'Dados da mensagem são obrigatórios'
      });
    }

    const result = await n8nService.triggerMessageReceived(messageData);

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    logger.error('Erro ao disparar evento de mensagem recebida:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

// Endpoint para disparar evento de avaliação do usuário
router.post('/events/user-rating', auth, async (req, res) => {
  try {
    const { ratingData } = req.body;

    if (!ratingData) {
      return res.status(400).json({
        success: false,
        message: 'Dados da avaliação são obrigatórios'
      });
    }

    const result = await n8nService.triggerUserRating(ratingData);

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    logger.error('Erro ao disparar evento de avaliação:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

// Endpoint para disparar evento de cancelamento
router.post('/events/cancellation', auth, async (req, res) => {
  try {
    const { cancellationData } = req.body;

    if (!cancellationData) {
      return res.status(400).json({
        success: false,
        message: 'Dados do cancelamento são obrigatórios'
      });
    }

    const result = await n8nService.triggerCancellation(cancellationData);

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    logger.error('Erro ao disparar evento de cancelamento:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

// Endpoint para disparar evento de erro do sistema
router.post('/events/system-error', auth, async (req, res) => {
  try {
    const { errorData } = req.body;

    if (!errorData) {
      return res.status(400).json({
        success: false,
        message: 'Dados do erro são obrigatórios'
      });
    }

    const result = await n8nService.triggerSystemError(errorData);

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    logger.error('Erro ao disparar evento de erro do sistema:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

// Endpoint para disparar evento de atualização de status
router.post('/events/status-update', auth, async (req, res) => {
  try {
    const { statusData } = req.body;

    if (!statusData) {
      return res.status(400).json({
        success: false,
        message: 'Dados do status são obrigatórios'
      });
    }

    const result = await n8nService.triggerStatusUpdate(statusData);

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    logger.error('Erro ao disparar evento de atualização de status:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

// Endpoint para listar webhooks configurados
router.get('/config', auth, async (req, res) => {
  try {
    const config = {
      n8nBaseUrl: process.env.N8N_BASE_URL,
      webhookEndpoints: {
        chatEvents: process.env.N8N_WEBHOOK_CHAT_EVENTS,
        userActions: process.env.N8N_WEBHOOK_USER_ACTIONS,
        systemEvents: process.env.N8N_WEBHOOK_SYSTEM_EVENTS
      },
      apiKey: process.env.N8N_API_KEY ? '***configured***' : 'not configured'
    };

    res.json({
      success: true,
      data: config
    });
  } catch (error) {
    logger.error('Erro ao obter configuração de webhooks:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

module.exports = router; 