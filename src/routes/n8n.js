const express = require('express');
const { PrismaClient } = require('@prisma/client');
const auth = require('../middleware/auth');
const logger = require('../utils/logger');
const n8nService = require('../services/n8n');

const router = express.Router();
const prisma = new PrismaClient();

// Webhook para receber eventos do n8n
router.post('/webhook', async (req, res) => {
  try {
    const result = await n8nService.processWebhook(req.headers, req.body);
    
    if (result.success) {
      res.json({ success: true, message: 'Webhook processado com sucesso' });
    } else {
      res.status(400).json({ success: false, error: result.error });
    }
  } catch (error) {
    logger.error('Erro ao processar webhook do n8n:', error);
    res.status(500).json({ success: false, error: 'Erro interno do servidor' });
  }
});

// Listar workflows do n8n
router.get('/workflows', auth, async (req, res) => {
  try {
    const result = await n8nService.listWorkflows();
    
    if (result.success) {
      res.json({
        success: true,
        data: result.data
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error
      });
    }
  } catch (error) {
    logger.error('Erro ao listar workflows:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

// Obter status de um workflow específico
router.get('/workflows/:id/status', auth, async (req, res) => {
  try {
    const result = await n8nService.getWorkflowStatus(req.params.id);
    
    if (result.success) {
      res.json({
        success: true,
        data: result.data
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error
      });
    }
  } catch (error) {
    logger.error('Erro ao obter status do workflow:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

// Executar workflow manualmente
router.post('/workflows/:id/execute', auth, async (req, res) => {
  try {
    const { data } = req.body;
    
    const result = await n8nService.executeWorkflow(req.params.id, data);
    
    if (result.success) {
      res.json({
        success: true,
        data: result.data
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error
      });
    }
  } catch (error) {
    logger.error('Erro ao executar workflow:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

// Configurar webhook para um evento específico
router.post('/webhooks/configure', auth, async (req, res) => {
  try {
    const {
      event,
      webhookUrl,
      description,
      isActive = true
    } = req.body;

    if (!event || !webhookUrl) {
      return res.status(400).json({
        success: false,
        message: 'Evento e URL do webhook são obrigatórios'
      });
    }

    const webhook = await prisma.n8nWebhook.create({
      data: {
        event,
        webhookUrl,
        description,
        isActive,
        companyId: req.user.companyId,
        createdBy: req.user.id
      }
    });

    logger.info(`Webhook configurado: ${event} por usuário ${req.user.id}`);

    res.status(201).json({
      success: true,
      data: webhook
    });
  } catch (error) {
    logger.error('Erro ao configurar webhook:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

// Listar webhooks configurados
router.get('/webhooks', auth, async (req, res) => {
  try {
    const webhooks = await prisma.n8nWebhook.findMany({
      where: {
        companyId: req.user.companyId
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    res.json({
      success: true,
      data: webhooks
    });
  } catch (error) {
    logger.error('Erro ao listar webhooks:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

// Atualizar webhook
router.put('/webhooks/:id', auth, async (req, res) => {
  try {
    const {
      event,
      webhookUrl,
      description,
      isActive
    } = req.body;

    const existingWebhook = await prisma.n8nWebhook.findFirst({
      where: {
        id: req.params.id,
        companyId: req.user.companyId
      }
    });

    if (!existingWebhook) {
      return res.status(404).json({
        success: false,
        message: 'Webhook não encontrado'
      });
    }

    const updatedWebhook = await prisma.n8nWebhook.update({
      where: {
        id: req.params.id
      },
      data: {
        event,
        webhookUrl,
        description,
        isActive,
        updatedAt: new Date()
      }
    });

    logger.info(`Webhook atualizado: ${updatedWebhook.id} por usuário ${req.user.id}`);

    res.json({
      success: true,
      data: updatedWebhook
    });
  } catch (error) {
    logger.error('Erro ao atualizar webhook:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

// Deletar webhook
router.delete('/webhooks/:id', auth, async (req, res) => {
  try {
    const existingWebhook = await prisma.n8nWebhook.findFirst({
      where: {
        id: req.params.id,
        companyId: req.user.companyId
      }
    });

    if (!existingWebhook) {
      return res.status(404).json({
        success: false,
        message: 'Webhook não encontrado'
      });
    }

    await prisma.n8nWebhook.delete({
      where: {
        id: req.params.id
      }
    });

    logger.info(`Webhook deletado: ${req.params.id} por usuário ${req.user.id}`);

    res.json({
      success: true,
      message: 'Webhook deletado com sucesso'
    });
  } catch (error) {
    logger.error('Erro ao deletar webhook:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

// Testar webhook
router.post('/webhooks/:id/test', auth, async (req, res) => {
  try {
    const webhook = await prisma.n8nWebhook.findFirst({
      where: {
        id: req.params.id,
        companyId: req.user.companyId
      }
    });

    if (!webhook) {
      return res.status(404).json({
        success: false,
        message: 'Webhook não encontrado'
      });
    }

    const testData = {
      event: webhook.event,
      test: true,
      timestamp: new Date().toISOString(),
      companyId: req.user.companyId
    };

    const result = await n8nService.triggerWebhook(webhook.webhookUrl, testData);

    if (result.success) {
      res.json({
        success: true,
        message: 'Webhook testado com sucesso',
        data: result.data
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error
      });
    }
  } catch (error) {
    logger.error('Erro ao testar webhook:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

// Obter logs de integração com n8n
router.get('/logs', auth, async (req, res) => {
  try {
    const { page = 1, limit = 20, event, status } = req.query;

    const where = {
      companyId: req.user.companyId
    };

    if (event) where.event = event;
    if (status) where.status = status;

    const logs = await prisma.n8nIntegrationLog.findMany({
      where,
      orderBy: {
        createdAt: 'desc'
      },
      skip: (page - 1) * limit,
      take: parseInt(limit)
    });

    const total = await prisma.n8nIntegrationLog.count({ where });

    res.json({
      success: true,
      data: {
        logs,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });
  } catch (error) {
    logger.error('Erro ao obter logs de integração:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

// Obter estatísticas de integração
router.get('/stats', auth, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    const where = {
      companyId: req.user.companyId
    };

    if (startDate && endDate) {
      where.createdAt = {
        gte: new Date(startDate),
        lte: new Date(endDate)
      };
    }

    const [
      totalEvents,
      successfulEvents,
      failedEvents,
      eventsByType,
      averageResponseTime
    ] = await Promise.all([
      prisma.n8nIntegrationLog.count({ where }),
      prisma.n8nIntegrationLog.count({
        where: { ...where, status: 'SUCCESS' }
      }),
      prisma.n8nIntegrationLog.count({
        where: { ...where, status: 'FAILED' }
      }),
      prisma.n8nIntegrationLog.groupBy({
        by: ['event'],
        where,
        _count: true
      }),
      prisma.n8nIntegrationLog.aggregate({
        where: { ...where, status: 'SUCCESS' },
        _avg: {
          responseTime: true
        }
      })
    ]);

    res.json({
      success: true,
      data: {
        totalEvents,
        successfulEvents,
        failedEvents,
        successRate: totalEvents > 0 ? (successfulEvents / totalEvents) * 100 : 0,
        eventsByType,
        averageResponseTime: averageResponseTime._avg.responseTime || 0
      }
    });
  } catch (error) {
    logger.error('Erro ao obter estatísticas de integração:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

module.exports = router; 