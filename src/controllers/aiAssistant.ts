import { Response } from 'express';
import { AuthRequest } from '../types';
import prisma from '../utils/database';
import logger from '../utils/logger';
import aiService from '../services/aiService';

export class AIAssistantController {
  async getAssistants(req: AuthRequest, res: Response) {
    try {
      const { page = 1, limit = 20 } = req.query;
      const companyId = req.user!.companyId;

      const skip = (Number(page) - 1) * Number(limit);
      
      const [assistants, total] = await Promise.all([
        prisma.aIAssistant.findMany({
          where: { companyId },
          include: {
            _count: {
              select: { conversations: true }
            }
          },
          orderBy: { createdAt: 'desc' },
          skip,
          take: Number(limit)
        }),
        prisma.aIAssistant.count({ where: { companyId } })
      ]);

      logger.info('Assistentes IA listados', { companyId, count: assistants.length });

      res.json({
        assistants,
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total,
          pages: Math.ceil(total / Number(limit))
        }
      });
    } catch (error: any) {
      logger.error('Erro ao listar assistentes IA', { error: error.message });
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  }

  async getAssistant(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const companyId = req.user!.companyId;

      const assistant = await prisma.aIAssistant.findFirst({
        where: {
          id,
          companyId
        },
        include: {
          conversations: {
            orderBy: { createdAt: 'desc' },
            take: 10
          }
        }
      });

      if (!assistant) {
        return res.status(404).json({ error: 'Assistente IA não encontrado' });
      }

      logger.info('Assistente IA obtido', { assistantId: id, companyId });

      res.json({ assistant });
    } catch (error: any) {
      logger.error('Erro ao obter assistente IA', { error: error.message });
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  }

  async createAssistant(req: AuthRequest, res: Response) {
    try {
      const { name, description, personality, provider, model, apiKey, settings, trainingData } = req.body;
      const companyId = req.user!.companyId;

      if (!name || !personality) {
        return res.status(400).json({ 
          error: 'Nome e personalidade são obrigatórios' 
        });
      }

      const assistant = await prisma.aIAssistant.create({
        data: {
          name,
          description,
          personality,
          provider: provider || 'OPENAI',
          model: model || 'gpt-3.5-turbo',
          apiKey: apiKey || null,
          settings: settings || {},
          trainingData: trainingData || [],
          companyId
        }
      });

      logger.info('Assistente IA criado', { assistantId: assistant.id, companyId });

      res.status(201).json({ assistant });
    } catch (error: any) {
      logger.error('Erro ao criar assistente IA', { error: error.message });
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  }

  async updateAssistant(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const { name, description, personality, provider, model, apiKey, isActive, settings, trainingData } = req.body;
      const companyId = req.user!.companyId;

      const assistant = await prisma.aIAssistant.findFirst({
        where: { id, companyId }
      });

      if (!assistant) {
        return res.status(404).json({ error: 'Assistente IA não encontrado' });
      }

      const updatedAssistant = await prisma.aIAssistant.update({
        where: { id },
        data: {
          name,
          description,
          personality,
          provider,
          model,
          apiKey,
          isActive,
          settings,
          trainingData
        }
      });

      logger.info('Assistente IA atualizado', { assistantId: id, companyId });

      res.json({ assistant: updatedAssistant });
    } catch (error: any) {
      logger.error('Erro ao atualizar assistente IA', { error: error.message });
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  }

  async deleteAssistant(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const companyId = req.user!.companyId;

      const assistant = await prisma.aIAssistant.findFirst({
        where: { id, companyId }
      });

      if (!assistant) {
        return res.status(404).json({ error: 'Assistente IA não encontrado' });
      }

      await prisma.aIAssistant.delete({
        where: { id }
      });

      logger.info('Assistente IA deletado', { assistantId: id, companyId });

      res.json({ message: 'Assistente IA deletado com sucesso' });
    } catch (error: any) {
      logger.error('Erro ao deletar assistente IA', { error: error.message });
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  }

  async chatWithAssistant(req: AuthRequest, res: Response) {
    try {
      const { assistantId } = req.params;
      const { message, conversationId } = req.body;
      const companyId = req.user!.companyId;

      if (!message) {
        return res.status(400).json({ error: 'Mensagem é obrigatória' });
      }

      // Buscar o assistente
      const assistant = await prisma.aIAssistant.findFirst({
        where: { id: assistantId, companyId }
      });

      if (!assistant) {
        return res.status(404).json({ error: 'Assistente IA não encontrado' });
      }

      // Buscar ou criar conversa
      let conversation;
      if (conversationId) {
        conversation = await prisma.conversation.findFirst({
          where: { id: conversationId, companyId }
        });
      }

      if (!conversation) {
        // Criar nova conversa
        const customer = await prisma.customer.create({
          data: {
            name: 'Cliente IA',
            phone: 'IA-' + Date.now()
          }
        });

        const channel = await prisma.channel.findFirst({
          where: { companyId, type: 'WEBCHAT' }
        });

        if (!channel) {
          return res.status(500).json({ error: 'Canal webchat não configurado' });
        }

        conversation = await prisma.conversation.create({
          data: {
            companyId,
            customerId: customer.id,
            channelId: channel.id,
            aiAssistantId: assistantId,
            status: 'ACTIVE'
          }
        });
      }

      // Salvar mensagem do usuário
      const userMessage = await prisma.message.create({
        data: {
          conversationId: conversation.id,
          channelId: conversation.channelId,
          content: message,
          type: 'TEXT',
          sender: 'USER'
        }
      });

      // Gerar resposta da IA usando o serviço unificado
      const aiResponse = await aiService.generateResponse(
        [{ role: 'user', content: message }],
        assistantId
      );

      // Salvar resposta da IA
      const assistantMessage = await prisma.message.create({
        data: {
          conversationId: conversation.id,
          channelId: conversation.channelId,
          content: aiResponse.message,
          type: 'TEXT',
          sender: 'BOT'
        }
      });

      logger.info('Chat com assistente IA', {
        assistantId,
        conversationId: conversation.id,
        messageLength: message.length,
        responseLength: aiResponse.message.length
      });

      res.json({
        conversation: {
          id: conversation.id,
          status: conversation.status
        },
        messages: [
          {
            id: userMessage.id,
            content: userMessage.content,
            sender: userMessage.sender,
            timestamp: userMessage.createdAt
          },
          {
            id: assistantMessage.id,
            content: assistantMessage.content,
            sender: assistantMessage.sender,
            timestamp: assistantMessage.createdAt
          }
        ],
        intent: aiResponse.intent,
        confidence: aiResponse.confidence
      });
    } catch (error: any) {
      logger.error('Erro no chat com assistente IA', { error: error.message });
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  }

  async validateProvider(req: AuthRequest, res: Response) {
    try {
      const { provider, apiKey } = req.body;

      if (!provider) {
        return res.status(400).json({ error: 'Provedor é obrigatório' });
      }

      // Validação simplificada - verificar se as chaves estão configuradas
      const isValid = provider === 'openai' ? !!process.env.OPENAI_API_KEY : 
                     provider === 'openrouter' ? !!process.env.OPENROUTER_API_KEY : false;

      res.json({ 
        provider, 
        isValid,
        message: isValid ? 'Provedor configurado corretamente' : 'Erro na configuração do provedor'
      });
    } catch (error: any) {
      logger.error('Erro na validação do provedor', { error: error.message });
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  }

  async getAvailableModels(req: AuthRequest, res: Response) {
    try {
      const { provider } = req.query;

      if (!provider) {
        return res.status(400).json({ error: 'Provedor é obrigatório' });
      }

      // Modelos disponíveis por provedor
      const models = provider === 'openai' ? [
        { id: 'gpt-4', name: 'GPT-4' },
        { id: 'gpt-4-turbo', name: 'GPT-4 Turbo' },
        { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo' }
      ] : provider === 'openrouter' ? [
        { id: 'anthropic/claude-3-sonnet', name: 'Claude 3 Sonnet' },
        { id: 'anthropic/claude-3-haiku', name: 'Claude 3 Haiku' },
        { id: 'openai/gpt-4', name: 'GPT-4' }
      ] : [];

      res.json({ 
        provider, 
        models 
      });
    } catch (error: any) {
      logger.error('Erro ao buscar modelos', { error: error.message });
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  }

  async getUsageInfo(req: AuthRequest, res: Response) {
    try {
      const { provider } = req.query;

      if (!provider) {
        return res.status(400).json({ error: 'Provedor é obrigatório' });
      }

      // Informações de uso simplificadas
      const usageInfo = {
        provider,
        status: 'active',
        limit: provider === 'openai' ? 'unlimited' : 'unlimited',
        usage: 'tracking_not_available'
      };

      res.json({ 
        provider, 
        usageInfo 
      });
    } catch (error: any) {
      logger.error('Erro ao buscar informações de uso', { error: error.message });
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  }

  async trainAssistant(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const { trainingData } = req.body;
      const companyId = req.user!.companyId;

      const assistant = await prisma.aIAssistant.findFirst({
        where: { id, companyId }
      });

      if (!assistant) {
        return res.status(404).json({ error: 'Assistente IA não encontrado' });
      }

      const updatedAssistant = await prisma.aIAssistant.update({
        where: { id },
        data: {
          trainingData: trainingData || []
        }
      });

      logger.info('Assistente IA treinado', { assistantId: id, companyId });

      res.json({ assistant: updatedAssistant });
    } catch (error: any) {
      logger.error('Erro ao treinar assistente IA', { error: error.message });
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  }

  async getConversationHistory(req: AuthRequest, res: Response) {
    try {
      const { assistantId } = req.params;
      const { page = 1, limit = 20 } = req.query;
      const companyId = req.user!.companyId;

      const skip = (Number(page) - 1) * Number(limit);

      const conversations = await prisma.conversation.findMany({
        where: {
          aiAssistantId: assistantId,
          companyId
        },
        include: {
          messages: {
            orderBy: { createdAt: 'desc' },
            take: 5
          },
          customer: true
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: Number(limit)
      });

      const total = await prisma.conversation.count({
        where: {
          aiAssistantId: assistantId,
          companyId
        }
      });

      res.json({
        conversations,
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total,
          pages: Math.ceil(total / Number(limit))
        }
      });
    } catch (error: any) {
      logger.error('Erro ao buscar histórico de conversas', { error: error.message });
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  }
}

export default new AIAssistantController(); 