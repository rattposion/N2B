const express = require('express');
const { PrismaClient } = require('@prisma/client');
const auth = require('../middleware/auth');
const logger = require('../utils/logger');

const router = express.Router();
const prisma = new PrismaClient();

// Listar todos os fluxos da empresa
router.get('/', auth, async (req, res) => {
  try {
    const flows = await prisma.flow.findMany({
      where: {
        companyId: req.user.companyId
      },
      include: {
        bot: {
          select: {
            id: true,
            name: true,
            avatar: true
          }
        },
        triggers: true,
        actions: true,
        _count: {
          select: {
            executions: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    res.json({
      success: true,
      data: flows
    });
  } catch (error) {
    logger.error('Erro ao listar fluxos:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

// Obter fluxo específico
router.get('/:id', auth, async (req, res) => {
  try {
    const flow = await prisma.flow.findFirst({
      where: {
        id: req.params.id,
        companyId: req.user.companyId
      },
      include: {
        bot: true,
        triggers: true,
        actions: {
          orderBy: {
            order: 'asc'
          }
        },
        conditions: {
          orderBy: {
            order: 'asc'
          }
        },
        executions: {
          take: 10,
          orderBy: {
            createdAt: 'desc'
          }
        }
      }
    });

    if (!flow) {
      return res.status(404).json({
        success: false,
        message: 'Fluxo não encontrado'
      });
    }

    res.json({
      success: true,
      data: flow
    });
  } catch (error) {
    logger.error('Erro ao obter fluxo:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

// Criar novo fluxo
router.post('/', auth, async (req, res) => {
  try {
    const {
      name,
      description,
      botId,
      isActive,
      triggers,
      actions,
      conditions,
      settings
    } = req.body;

    // Validar dados obrigatórios
    if (!name || !botId) {
      return res.status(400).json({
        success: false,
        message: 'Nome e bot são obrigatórios'
      });
    }

    // Verificar se o bot pertence à empresa
    const bot = await prisma.bot.findFirst({
      where: {
        id: botId,
        companyId: req.user.companyId
      }
    });

    if (!bot) {
      return res.status(404).json({
        success: false,
        message: 'Bot não encontrado'
      });
    }

    const flow = await prisma.flow.create({
      data: {
        name,
        description,
        botId,
        isActive: isActive !== undefined ? isActive : true,
        companyId: req.user.companyId,
        createdBy: req.user.id,
        settings: settings || {},
        triggers: {
          create: triggers || []
        },
        actions: {
          create: actions ? actions.map((action, index) => ({
            ...action,
            order: index
          })) : []
        },
        conditions: {
          create: conditions ? conditions.map((condition, index) => ({
            ...condition,
            order: index
          })) : []
        }
      },
      include: {
        bot: true,
        triggers: true,
        actions: true,
        conditions: true
      }
    });

    logger.info(`Fluxo criado: ${flow.id} por usuário ${req.user.id}`);

    res.status(201).json({
      success: true,
      data: flow
    });
  } catch (error) {
    logger.error('Erro ao criar fluxo:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

// Atualizar fluxo
router.put('/:id', auth, async (req, res) => {
  try {
    const {
      name,
      description,
      botId,
      isActive,
      triggers,
      actions,
      conditions,
      settings
    } = req.body;

    // Verificar se o fluxo existe e pertence à empresa
    const existingFlow = await prisma.flow.findFirst({
      where: {
        id: req.params.id,
        companyId: req.user.companyId
      }
    });

    if (!existingFlow) {
      return res.status(404).json({
        success: false,
        message: 'Fluxo não encontrado'
      });
    }

    // Se botId foi alterado, verificar se o novo bot pertence à empresa
    if (botId && botId !== existingFlow.botId) {
      const bot = await prisma.bot.findFirst({
        where: {
          id: botId,
          companyId: req.user.companyId
        }
      });

      if (!bot) {
        return res.status(404).json({
          success: false,
          message: 'Bot não encontrado'
        });
      }
    }

    // Atualizar fluxo e suas relações
    const updatedFlow = await prisma.flow.update({
      where: {
        id: req.params.id
      },
      data: {
        name,
        description,
        botId,
        isActive,
        settings,
        updatedAt: new Date()
      },
      include: {
        bot: true,
        triggers: true,
        actions: true,
        conditions: true
      }
    });

    // Atualizar triggers se fornecidos
    if (triggers) {
      await prisma.trigger.deleteMany({
        where: { flowId: req.params.id }
      });
      await prisma.trigger.createMany({
        data: triggers.map(trigger => ({
          ...trigger,
          flowId: req.params.id
        }))
      });
    }

    // Atualizar actions se fornecidos
    if (actions) {
      await prisma.action.deleteMany({
        where: { flowId: req.params.id }
      });
      await prisma.action.createMany({
        data: actions.map((action, index) => ({
          ...action,
          flowId: req.params.id,
          order: index
        }))
      });
    }

    // Atualizar conditions se fornecidos
    if (conditions) {
      await prisma.condition.deleteMany({
        where: { flowId: req.params.id }
      });
      await prisma.condition.createMany({
        data: conditions.map((condition, index) => ({
          ...condition,
          flowId: req.params.id,
          order: index
        }))
      });
    }

    logger.info(`Fluxo atualizado: ${updatedFlow.id} por usuário ${req.user.id}`);

    res.json({
      success: true,
      data: updatedFlow
    });
  } catch (error) {
    logger.error('Erro ao atualizar fluxo:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

// Deletar fluxo
router.delete('/:id', auth, async (req, res) => {
  try {
    // Verificar se o fluxo existe e pertence à empresa
    const existingFlow = await prisma.flow.findFirst({
      where: {
        id: req.params.id,
        companyId: req.user.companyId
      }
    });

    if (!existingFlow) {
      return res.status(404).json({
        success: false,
        message: 'Fluxo não encontrado'
      });
    }

    // Deletar fluxo e todas as relações (cascade)
    await prisma.flow.delete({
      where: {
        id: req.params.id
      }
    });

    logger.info(`Fluxo deletado: ${req.params.id} por usuário ${req.user.id}`);

    res.json({
      success: true,
      message: 'Fluxo deletado com sucesso'
    });
  } catch (error) {
    logger.error('Erro ao deletar fluxo:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

// Ativar/desativar fluxo
router.patch('/:id/toggle', auth, async (req, res) => {
  try {
    const existingFlow = await prisma.flow.findFirst({
      where: {
        id: req.params.id,
        companyId: req.user.companyId
      }
    });

    if (!existingFlow) {
      return res.status(404).json({
        success: false,
        message: 'Fluxo não encontrado'
      });
    }

    const updatedFlow = await prisma.flow.update({
      where: {
        id: req.params.id
      },
      data: {
        isActive: !existingFlow.isActive
      }
    });

    logger.info(`Fluxo ${updatedFlow.isActive ? 'ativado' : 'desativado'}: ${req.params.id} por usuário ${req.user.id}`);

    res.json({
      success: true,
      data: updatedFlow
    });
  } catch (error) {
    logger.error('Erro ao alternar status do fluxo:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

// Executar fluxo manualmente
router.post('/:id/execute', auth, async (req, res) => {
  try {
    const { context, data } = req.body;

    const flow = await prisma.flow.findFirst({
      where: {
        id: req.params.id,
        companyId: req.user.companyId,
        isActive: true
      },
      include: {
        bot: true,
        triggers: true,
        actions: {
          orderBy: {
            order: 'asc'
          }
        },
        conditions: {
          orderBy: {
            order: 'asc'
          }
        }
      }
    });

    if (!flow) {
      return res.status(404).json({
        success: false,
        message: 'Fluxo não encontrado ou inativo'
      });
    }

    // Registrar execução
    const execution = await prisma.flowExecution.create({
      data: {
        flowId: flow.id,
        triggeredBy: req.user.id,
        context: context || {},
        data: data || {},
        status: 'RUNNING'
      }
    });

    try {
      // Executar condições
      let shouldExecute = true;
      for (const condition of flow.conditions) {
        const conditionResult = await evaluateCondition(condition, context, data);
        if (!conditionResult) {
          shouldExecute = false;
          break;
        }
      }

      if (!shouldExecute) {
        await prisma.flowExecution.update({
          where: { id: execution.id },
          data: { status: 'SKIPPED' }
        });

        return res.json({
          success: true,
          data: {
            executionId: execution.id,
            status: 'SKIPPED',
            message: 'Fluxo não executado devido às condições não atendidas'
          }
        });
      }

      // Executar ações
      const results = [];
      for (const action of flow.actions) {
        try {
          const actionResult = await executeAction(action, context, data);
          results.push({
            actionId: action.id,
            type: action.type,
            success: true,
            result: actionResult
          });
        } catch (error) {
          results.push({
            actionId: action.id,
            type: action.type,
            success: false,
            error: error.message
          });
        }
      }

      await prisma.flowExecution.update({
        where: { id: execution.id },
        data: { 
          status: 'COMPLETED',
          results: results
        }
      });

      logger.info(`Fluxo executado: ${flow.id} por usuário ${req.user.id}`);

      res.json({
        success: true,
        data: {
          executionId: execution.id,
          status: 'COMPLETED',
          results: results
        }
      });
    } catch (error) {
      await prisma.flowExecution.update({
        where: { id: execution.id },
        data: { 
          status: 'FAILED',
          error: error.message
        }
      });

      throw error;
    }
  } catch (error) {
    logger.error('Erro ao executar fluxo:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

// Obter histórico de execuções do fluxo
router.get('/:id/executions', auth, async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;

    const flow = await prisma.flow.findFirst({
      where: {
        id: req.params.id,
        companyId: req.user.companyId
      }
    });

    if (!flow) {
      return res.status(404).json({
        success: false,
        message: 'Fluxo não encontrado'
      });
    }

    const executions = await prisma.flowExecution.findMany({
      where: {
        flowId: req.params.id
      },
      include: {
        triggeredByUser: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      },
      skip: (page - 1) * limit,
      take: parseInt(limit)
    });

    const total = await prisma.flowExecution.count({
      where: {
        flowId: req.params.id
      }
    });

    res.json({
      success: true,
      data: {
        executions,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });
  } catch (error) {
    logger.error('Erro ao obter execuções do fluxo:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

// Funções auxiliares para execução de fluxos
async function evaluateCondition(condition, context, data) {
  switch (condition.type) {
    case 'EQUALS':
      return context[condition.field] === condition.value;
    case 'NOT_EQUALS':
      return context[condition.field] !== condition.value;
    case 'CONTAINS':
      return context[condition.field]?.includes(condition.value);
    case 'GREATER_THAN':
      return Number(context[condition.field]) > Number(condition.value);
    case 'LESS_THAN':
      return Number(context[condition.field]) < Number(condition.value);
    case 'EXISTS':
      return context[condition.field] !== undefined && context[condition.field] !== null;
    default:
      return true;
  }
}

async function executeAction(action, context, data) {
  switch (action.type) {
    case 'SEND_MESSAGE':
      return await executeSendMessage(action, context, data);
    case 'UPDATE_USER':
      return await executeUpdateUser(action, context, data);
    case 'CREATE_TICKET':
      return await executeCreateTicket(action, context, data);
    case 'WEBHOOK':
      return await executeWebhook(action, context, data);
    case 'DELAY':
      return await executeDelay(action, context, data);
    case 'SET_VARIABLE':
      return await executeSetVariable(action, context, data);
    default:
      throw new Error(`Tipo de ação não suportado: ${action.type}`);
  }
}

async function executeSendMessage(action, context, data) {
  // Implementar envio de mensagem via bot
  const message = action.config.message;
  const channel = action.config.channel || 'chat';
  
  // Aqui você implementaria a lógica de envio real
  // Por exemplo, via WebSocket, API externa, etc.
  
  return {
    messageId: `msg_${Date.now()}`,
    channel,
    content: message
  };
}

async function executeUpdateUser(action, context, data) {
  // Implementar atualização de dados do usuário
  const updates = action.config.updates || {};
  
  // Aqui você implementaria a atualização real no banco
  return {
    updated: true,
    fields: Object.keys(updates)
  };
}

async function executeCreateTicket(action, context, data) {
  // Implementar criação de ticket
  const ticket = {
    title: action.config.title,
    description: action.config.description,
    priority: action.config.priority || 'medium',
    userId: context.userId
  };
  
  // Aqui você implementaria a criação real do ticket
  return {
    ticketId: `ticket_${Date.now()}`,
    ...ticket
  };
}

async function executeWebhook(action, context, data) {
  // Implementar chamada de webhook
  const { url, method = 'POST', headers = {}, body = {} } = action.config;
  
  // Aqui você implementaria a chamada HTTP real
  return {
    webhookId: `webhook_${Date.now()}`,
    url,
    method,
    status: 'sent'
  };
}

async function executeDelay(action, context, data) {
  // Implementar delay
  const delayMs = action.config.delay || 1000;
  
  return new Promise(resolve => {
    setTimeout(() => {
      resolve({
        delayed: true,
        delayMs
      });
    }, delayMs);
  });
}

async function executeSetVariable(action, context, data) {
  // Implementar definição de variável
  const { variable, value } = action.config;
  
  // Aqui você implementaria o armazenamento real da variável
  return {
    variable,
    value,
    set: true
  };
}

module.exports = router; 