import { Response } from 'express';
import { AuthRequest } from '../types';
import prisma from '../utils/database';
import logger from '../utils/logger';
import { OpenAI } from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

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
      const { name, description, personality, settings, trainingData } = req.body;
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
      const { name, description, personality, isActive, settings, trainingData } = req.body;
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
            name: 'Cliente IA'
          }
        });

        conversation = await prisma.conversation.create({
          data: {
            companyId,
            customerId: customer.id,
            channelId: 'ai-channel', // Canal virtual para IA
            aiAssistantId: assistantId
          }
        });
      }

      // Salvar mensagem do usuário
      await prisma.message.create({
        data: {
          content: message,
          type: 'TEXT',
          sender: 'USER',
          conversationId: conversation.id,
          channelId: conversation.channelId
        }
      });

      // Gerar resposta da IA
      const aiResponse = await this.generateAIResponse(assistant, message, conversation.id);

      // Salvar resposta da IA
      await prisma.message.create({
        data: {
          content: aiResponse,
          type: 'TEXT',
          sender: 'BOT',
          conversationId: conversation.id,
          channelId: conversation.channelId
        }
      });

      logger.info('Chat com assistente IA', { 
        assistantId, 
        conversationId: conversation.id,
        messageLength: message.length 
      });

      res.json({ 
        response: aiResponse,
        conversationId: conversation.id
      });
    } catch (error: any) {
      logger.error('Erro no chat com assistente IA', { error: error.message });
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  }

  private async generateAIResponse(assistant: any, userMessage: string, conversationId: string): Promise<string> {
    try {
      // Buscar histórico da conversa
      const messages = await prisma.message.findMany({
        where: { conversationId },
        orderBy: { createdAt: 'asc' },
        take: 10 // Últimas 10 mensagens para contexto
      });

      // Construir contexto da conversa
      const conversationHistory = messages.map(msg => 
        `${msg.sender === 'USER' ? 'Usuário' : 'Assistente'}: ${msg.content}`
      ).join('\n');

      // Construir prompt para a IA
      const systemPrompt = `Você é ${assistant.name}, um assistente virtual com a seguinte personalidade:

${assistant.personality}

Seu objetivo é ajudar o usuário de forma amigável e profissional. Responda sempre em português brasileiro.

Histórico da conversa:
${conversationHistory}

Usuário: ${userMessage}
${assistant.name}:`;

      const completion = await openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: systemPrompt
          },
          {
            role: 'user',
            content: userMessage
          }
        ],
        max_tokens: 500,
        temperature: 0.7
      });

      return completion.choices[0]?.message?.content || 'Desculpe, não consegui processar sua mensagem.';
    } catch (error: any) {
      logger.error('Erro ao gerar resposta da IA', { error: error.message });
      return 'Desculpe, estou enfrentando dificuldades técnicas. Tente novamente em alguns instantes.';
    }
  }

  async trainAssistant(req: AuthRequest, res: Response) {
    try {
      const { assistantId } = req.params;
      const { trainingData } = req.body;
      const companyId = req.user!.companyId;

      const assistant = await prisma.aIAssistant.findFirst({
        where: { id: assistantId, companyId }
      });

      if (!assistant) {
        return res.status(404).json({ error: 'Assistente IA não encontrado' });
      }

      // Atualizar dados de treinamento
      const updatedAssistant = await prisma.aIAssistant.update({
        where: { id: assistantId },
        data: {
          trainingData: trainingData || []
        }
      });

      logger.info('Assistente IA treinado', { assistantId, companyId });

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

      const [conversations, total] = await Promise.all([
        prisma.conversation.findMany({
          where: {
            aiAssistantId: assistantId,
            companyId
          },
          include: {
            customer: true,
            messages: {
              orderBy: { createdAt: 'desc' },
              take: 1
            }
          },
          orderBy: { updatedAt: 'desc' },
          skip,
          take: Number(limit)
        }),
        prisma.conversation.count({
          where: {
            aiAssistantId: assistantId,
            companyId
          }
        })
      ]);

      logger.info('Histórico de conversas obtido', { assistantId, companyId });

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
      logger.error('Erro ao obter histórico de conversas', { error: error.message });
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  }
}

export default new AIAssistantController(); 