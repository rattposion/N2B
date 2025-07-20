import { Response } from 'express';
import { AuthRequest } from '../types';
import prisma from '../utils/database';
import logger from '../utils/logger';

export class ConversationsController {
  async getConversations(req: AuthRequest, res: Response) {
    try {
      const { page = 1, limit = 20, status, channelId, search } = req.query;
      const userId = req.user!.id;
      const companyId = req.user!.companyId;

      const skip = (Number(page) - 1) * Number(limit);
      
      const where: any = {
        companyId,
        OR: [
          { userId },
          { bot: { companyId } }
        ]
      };

      if (status) {
        where.status = status;
      }

      if (channelId) {
        where.channelId = channelId;
      }

      if (search) {
        where.OR = [
          { customerName: { contains: search as string, mode: 'insensitive' } },
          { customerPhone: { contains: search as string, mode: 'insensitive' } },
          { customerEmail: { contains: search as string, mode: 'insensitive' } }
        ];
      }

      const [conversations, total] = await Promise.all([
        prisma.conversation.findMany({
          where,
          include: {
            customer: true,
            bot: true,
            channel: true,
            messages: {
              orderBy: { createdAt: 'desc' },
              take: 1
            },
            _count: {
              select: { messages: true }
            }
          },
          orderBy: { updatedAt: 'desc' },
          skip,
          take: Number(limit)
        }),
        prisma.conversation.count({ where })
      ]);

      logger.info('Conversas listadas', { userId, companyId, count: conversations.length });

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
      logger.error('Erro ao listar conversas', { error: error.message });
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  }

  async getConversation(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const userId = req.user!.id;
      const companyId = req.user!.companyId;

      const conversation = await prisma.conversation.findFirst({
        where: {
          id,
          companyId,
          OR: [
            { userId },
            { bot: { companyId } }
          ]
        },
        include: {
          customer: true,
          bot: true,
          channel: true,
          messages: {
            orderBy: { createdAt: 'asc' }
          }
        }
      });

      if (!conversation) {
        return res.status(404).json({ error: 'Conversa não encontrada' });
      }

      logger.info('Conversa obtida', { conversationId: id, userId });

      res.json({ conversation });
    } catch (error: any) {
      logger.error('Erro ao obter conversa', { error: error.message });
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  }

  async createConversation(req: AuthRequest, res: Response) {
    try {
      const { customerName, customerPhone, customerEmail, channelId, botId } = req.body;
      const userId = req.user!.id;
      const companyId = req.user!.companyId;

      // Validate required fields
      if (!customerName || !channelId) {
        return res.status(400).json({ error: 'Nome do cliente e canal são obrigatórios' });
      }

      const conversation = await prisma.conversation.create({
        data: {
          customerName,
          customerPhone,
          customerEmail,
          status: 'ACTIVE',
          companyId,
          userId,
          channelId,
          botId
        },
        include: {
          customer: true,
          bot: true,
          channel: true
        }
      });

      logger.info('Conversa criada', { conversationId: conversation.id, userId });

      res.status(201).json({ conversation });
    } catch (error: any) {
      logger.error('Erro ao criar conversa', { error: error.message });
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  }

  async updateConversation(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const { status, customerName, customerPhone, customerEmail } = req.body;
      const userId = req.user!.id;
      const companyId = req.user!.companyId;

      const conversation = await prisma.conversation.findFirst({
        where: {
          id,
          companyId,
          OR: [
            { userId },
            { bot: { companyId } }
          ]
        }
      });

      if (!conversation) {
        return res.status(404).json({ error: 'Conversa não encontrada' });
      }

      const updatedConversation = await prisma.conversation.update({
        where: { id },
        data: {
          status,
          customerName,
          customerPhone,
          customerEmail
        },
        include: {
          customer: true,
          bot: true,
          channel: true
        }
      });

      logger.info('Conversa atualizada', { conversationId: id, userId });

      res.json({ conversation: updatedConversation });
    } catch (error: any) {
      logger.error('Erro ao atualizar conversa', { error: error.message });
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  }

  async deleteConversation(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const userId = req.user!.id;
      const companyId = req.user!.companyId;

      const conversation = await prisma.conversation.findFirst({
        where: {
          id,
          companyId,
          OR: [
            { userId },
            { bot: { companyId } }
          ]
        }
      });

      if (!conversation) {
        return res.status(404).json({ error: 'Conversa não encontrada' });
      }

      await prisma.conversation.delete({
        where: { id }
      });

      logger.info('Conversa deletada', { conversationId: id, userId });

      res.json({ message: 'Conversa deletada com sucesso' });
    } catch (error: any) {
      logger.error('Erro ao deletar conversa', { error: error.message });
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  }

  async getConversationStats(req: AuthRequest, res: Response) {
    try {
      const companyId = req.user!.companyId;

      const [
        totalConversations,
        activeConversations,
        resolvedConversations,
        avgResponseTime
      ] = await Promise.all([
        prisma.conversation.count({ where: { companyId } }),
        prisma.conversation.count({ where: { companyId, status: 'ACTIVE' } }),
        prisma.conversation.count({ where: { companyId, status: 'RESOLVED' } }),
        prisma.conversation.aggregate({
          where: { companyId },
          _avg: { responseTime: true }
        })
      ]);

      const stats = {
        total: totalConversations,
        active: activeConversations,
        resolved: resolvedConversations,
        avgResponseTime: avgResponseTime._avg.responseTime || 0
      };

      logger.info('Estatísticas de conversas obtidas', { companyId });

      res.json({ stats });
    } catch (error: any) {
      logger.error('Erro ao obter estatísticas', { error: error.message });
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  }
}

export default new ConversationsController();