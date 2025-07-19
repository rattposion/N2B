const express = require('express');
const { PrismaClient } = require('@prisma/client');
const auth = require('../middleware/auth');
const logger = require('../utils/logger');
const { generateAIResponse } = require('../services/ai');

const router = express.Router();
const prisma = new PrismaClient();

// Listar todos os bots da empresa
router.get('/', auth, async (req, res) => {
  try {
    const bots = await prisma.bot.findMany({
      where: {
        companyId: req.user.companyId
      },
      include: {
        flows: true,
        integrations: true,
        _count: {
          select: {
            conversations: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    res.json({
      success: true,
      data: bots
    });
  } catch (error) {
    logger.error('Erro ao listar bots:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

// Obter bot específico
router.get('/:id', auth, async (req, res) => {
  try {
    const bot = await prisma.bot.findFirst({
      where: {
        id: req.params.id,
        companyId: req.user.companyId
      },
      include: {
        flows: true,
        integrations: true,
        knowledgeBase: true,
        settings: true
      }
    });

    if (!bot) {
      return res.status(404).json({
        success: false,
        message: 'Bot não encontrado'
      });
    }

    res.json({
      success: true,
      data: bot
    });
  } catch (error) {
    logger.error('Erro ao obter bot:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

// Criar novo bot
router.post('/', auth, async (req, res) => {
  try {
    const {
      name,
      description,
      avatar,
      welcomeMessage,
      aiModel,
      temperature,
      maxTokens,
      systemPrompt,
      isActive,
      settings
    } = req.body;

    // Validar dados obrigatórios
    if (!name || !systemPrompt) {
      return res.status(400).json({
        success: false,
        message: 'Nome e prompt do sistema são obrigatórios'
      });
    }

    const bot = await prisma.bot.create({
      data: {
        name,
        description,
        avatar,
        welcomeMessage,
        aiModel: aiModel || 'gpt-4',
        temperature: temperature || 0.7,
        maxTokens: maxTokens || 1000,
        systemPrompt,
        isActive: isActive !== undefined ? isActive : true,
        companyId: req.user.companyId,
        createdBy: req.user.id,
        settings: settings || {}
      }
    });

    logger.info(`Bot criado: ${bot.id} por usuário ${req.user.id}`);

    res.status(201).json({
      success: true,
      data: bot
    });
  } catch (error) {
    logger.error('Erro ao criar bot:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

// Atualizar bot
router.put('/:id', auth, async (req, res) => {
  try {
    const {
      name,
      description,
      avatar,
      welcomeMessage,
      aiModel,
      temperature,
      maxTokens,
      systemPrompt,
      isActive,
      settings
    } = req.body;

    // Verificar se o bot existe e pertence à empresa
    const existingBot = await prisma.bot.findFirst({
      where: {
        id: req.params.id,
        companyId: req.user.companyId
      }
    });

    if (!existingBot) {
      return res.status(404).json({
        success: false,
        message: 'Bot não encontrado'
      });
    }

    const updatedBot = await prisma.bot.update({
      where: {
        id: req.params.id
      },
      data: {
        name,
        description,
        avatar,
        welcomeMessage,
        aiModel,
        temperature,
        maxTokens,
        systemPrompt,
        isActive,
        settings,
        updatedAt: new Date()
      }
    });

    logger.info(`Bot atualizado: ${updatedBot.id} por usuário ${req.user.id}`);

    res.json({
      success: true,
      data: updatedBot
    });
  } catch (error) {
    logger.error('Erro ao atualizar bot:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

// Deletar bot
router.delete('/:id', auth, async (req, res) => {
  try {
    // Verificar se o bot existe e pertence à empresa
    const existingBot = await prisma.bot.findFirst({
      where: {
        id: req.params.id,
        companyId: req.user.companyId
      }
    });

    if (!existingBot) {
      return res.status(404).json({
        success: false,
        message: 'Bot não encontrado'
      });
    }

    // Deletar bot e todas as relações (cascade)
    await prisma.bot.delete({
      where: {
        id: req.params.id
      }
    });

    logger.info(`Bot deletado: ${req.params.id} por usuário ${req.user.id}`);

    res.json({
      success: true,
      message: 'Bot deletado com sucesso'
    });
  } catch (error) {
    logger.error('Erro ao deletar bot:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

// Ativar/desativar bot
router.patch('/:id/toggle', auth, async (req, res) => {
  try {
    const existingBot = await prisma.bot.findFirst({
      where: {
        id: req.params.id,
        companyId: req.user.companyId
      }
    });

    if (!existingBot) {
      return res.status(404).json({
        success: false,
        message: 'Bot não encontrado'
      });
    }

    const updatedBot = await prisma.bot.update({
      where: {
        id: req.params.id
      },
      data: {
        isActive: !existingBot.isActive
      }
    });

    logger.info(`Bot ${updatedBot.isActive ? 'ativado' : 'desativado'}: ${req.params.id} por usuário ${req.user.id}`);

    res.json({
      success: true,
      data: updatedBot
    });
  } catch (error) {
    logger.error('Erro ao alternar status do bot:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

// Testar resposta do bot
router.post('/:id/test', auth, async (req, res) => {
  try {
    const { message } = req.body;

    if (!message) {
      return res.status(400).json({
        success: false,
        message: 'Mensagem é obrigatória'
      });
    }

    const bot = await prisma.bot.findFirst({
      where: {
        id: req.params.id,
        companyId: req.user.companyId
      },
      include: {
        knowledgeBase: true,
        settings: true
      }
    });

    if (!bot) {
      return res.status(404).json({
        success: false,
        message: 'Bot não encontrado'
      });
    }

    // Gerar resposta usando IA
    const aiResponse = await generateAIResponse({
      message,
      systemPrompt: bot.systemPrompt,
      model: bot.aiModel,
      temperature: bot.temperature,
      maxTokens: bot.maxTokens,
      knowledgeBase: bot.knowledgeBase,
      context: {
        botId: bot.id,
        companyId: bot.companyId,
        userId: req.user.id
      }
    });

    res.json({
      success: true,
      data: {
        message,
        response: aiResponse,
        bot: {
          id: bot.id,
          name: bot.name,
          avatar: bot.avatar
        }
      }
    });
  } catch (error) {
    logger.error('Erro ao testar bot:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

// Obter estatísticas do bot
router.get('/:id/stats', auth, async (req, res) => {
  try {
    const bot = await prisma.bot.findFirst({
      where: {
        id: req.params.id,
        companyId: req.user.companyId
      }
    });

    if (!bot) {
      return res.status(404).json({
        success: false,
        message: 'Bot não encontrado'
      });
    }

    // Estatísticas dos últimos 30 dias
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const [
      totalConversations,
      recentConversations,
      totalMessages,
      recentMessages,
      avgResponseTime
    ] = await Promise.all([
      prisma.conversation.count({
        where: { botId: req.params.id }
      }),
      prisma.conversation.count({
        where: {
          botId: req.params.id,
          createdAt: { gte: thirtyDaysAgo }
        }
      }),
      prisma.message.count({
        where: { conversation: { botId: req.params.id } }
      }),
      prisma.message.count({
        where: {
          conversation: { botId: req.params.id },
          createdAt: { gte: thirtyDaysAgo }
        }
      }),
      prisma.message.aggregate({
        where: {
          conversation: { botId: req.params.id },
          isFromBot: true
        },
        _avg: {
          responseTime: true
        }
      })
    ]);

    res.json({
      success: true,
      data: {
        totalConversations,
        recentConversations,
        totalMessages,
        recentMessages,
        avgResponseTime: avgResponseTime._avg.responseTime || 0,
        isActive: bot.isActive
      }
    });
  } catch (error) {
    logger.error('Erro ao obter estatísticas do bot:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

module.exports = router; 