import { Request, Response } from 'express';
import prisma from '../utils/database';
import logger from '../utils/logger';

export class ConversationsController {
  async getConversations(req: Request, res: Response) {
    try {
      const { page = 1, limit = 10, status, search } = req.query;
      const companyId = (req as any).user.companyId;
      const skip = (Number(page) - 1) * Number(limit);

      const where: any = {
        companyId,
        ...(status && { status: status as string }),
        ...(search && {
          OR: [
            { customer: { name: { contains: search as string, mode: 'insensitive' } } },
            { customer: { email: { contains: search as string, mode: 'insensitive' } } },
            { customer: { phone: { contains: search as string, mode: 'insensitive' } } }
          ]
        })
      };

      const [conversations, total] = await Promise.all([
        prisma.conversation.findMany({
          where,
          include: {
            customer: true,
            channel: true,
            bot: true,
            assignedUser: {
              select: { id: true, name: true, email: true }
            },
            messages: {
              orderBy: { createdAt: 'desc' },
              take: 1
            }
          },
          orderBy: { updatedAt: 'desc' },
          skip,
          take: Number(limit)
        }),
        prisma.conversation.count({ where })
      ]);

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
      logger.error('Erro ao buscar conversas', { error: error.message });
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  }

  async getConversation(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const companyId = (req as any).user.companyId;

      const conversation = await prisma.conversation.findFirst({
        where: { id, companyId },
        include: {
          customer: true,
          channel: true,
          bot: true,
          assignedUser: {
            select: { id: true, name: true, email: true }
          },
          messages: {
            orderBy: { createdAt: 'asc' }
          }
        }
      });

      if (!conversation) {
        return res.status(404).json({ error: 'Conversa não encontrada' });
      }

      res.json(conversation);
    } catch (error: any) {
      logger.error('Erro ao buscar conversa', { error: error.message });
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  }

  async createConversation(req: Request, res: Response) {
    try {
      const { customerId, channelId, botId, assignedTo } = req.body;
      const companyId = (req as any).user.companyId;

      const conversation = await prisma.conversation.create({
        data: {
          customerId,
          channelId,
          botId,
          assignedTo,
          companyId,
          status: 'ACTIVE'
        },
        include: {
          customer: true,
          channel: true,
          bot: true,
          assignedUser: {
            select: { id: true, name: true, email: true }
          }
        }
      });

      logger.info('Conversa criada', { conversationId: conversation.id });
      res.status(201).json(conversation);
    } catch (error: any) {
      logger.error('Erro ao criar conversa', { error: error.message });
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  }

  async updateConversation(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { status, assignedTo } = req.body;
      const companyId = (req as any).user.companyId;

      const conversation = await prisma.conversation.findFirst({
        where: { id, companyId }
      });

      if (!conversation) {
        return res.status(404).json({ error: 'Conversa não encontrada' });
      }

      const updatedConversation = await prisma.conversation.update({
        where: { id },
        data: {
          ...(status && { status }),
          ...(assignedTo && { assignedTo })
        },
        include: {
          customer: true,
          channel: true,
          bot: true,
          assignedUser: {
            select: { id: true, name: true, email: true }
          }
        }
      });

      logger.info('Conversa atualizada', { conversationId: id });
      res.json(updatedConversation);
    } catch (error: any) {
      logger.error('Erro ao atualizar conversa', { error: error.message });
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  }

  async deleteConversation(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const companyId = (req as any).user.companyId;

      const conversation = await prisma.conversation.findFirst({
        where: { id, companyId }
      });

      if (!conversation) {
        return res.status(404).json({ error: 'Conversa não encontrada' });
      }

      await prisma.conversation.delete({ where: { id } });

      logger.info('Conversa deletada', { conversationId: id });
      res.json({ message: 'Conversa deletada com sucesso' });
    } catch (error: any) {
      logger.error('Erro ao deletar conversa', { error: error.message });
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  }

  async getConversationStats(req: Request, res: Response) {
    try {
      const companyId = (req as any).user.companyId;

      const [
        totalConversations,
        openConversations,
        resolvedConversations,
        avgResponseTime
      ] = await Promise.all([
        prisma.conversation.count({ where: { companyId } }),
        prisma.conversation.count({ 
          where: { companyId, status: 'ACTIVE' } 
        }),
        prisma.conversation.count({ 
          where: { companyId, status: 'CLOSED' } 
        }),
        prisma.conversation.aggregate({
          where: { companyId },
          _avg: {
            // Removido responseTime pois não existe no schema
          }
        })
      ]);

      res.json({
        totalConversations,
        openConversations,
        resolvedConversations,
        avgResponseTime: avgResponseTime._avg || 0
      });
    } catch (error: any) {
      logger.error('Erro ao buscar estatísticas', { error: error.message });
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  }
}

export default new ConversationsController();