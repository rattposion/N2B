import { Response } from 'express';
import { AuthRequest } from '../types';
import prisma from '../utils/database';
import logger from '../utils/logger';

export class KanbanController {
  async getBoards(req: AuthRequest, res: Response) {
    try {
      const companyId = req.user!.companyId;

      const boards = await prisma.kanbanBoard.findMany({
        where: { companyId, isActive: true },
        include: {
          columns: {
            include: {
              cards: {
                include: {
                  lead: true,
                  assignedUser: {
                    select: { id: true, name: true, email: true }
                  }
                },
                orderBy: { order: 'asc' }
              }
            },
            orderBy: { order: 'asc' }
          }
        },
        orderBy: { createdAt: 'desc' }
      });

      logger.info('Quadros Kanban listados', { companyId, count: boards.length });

      res.json({ boards });
    } catch (error: any) {
      logger.error('Erro ao listar quadros Kanban', { error: error.message });
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  }

  async getBoard(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const companyId = req.user!.companyId;

      const board = await prisma.kanbanBoard.findFirst({
        where: { id, companyId },
        include: {
          columns: {
            include: {
              cards: {
                include: {
                  lead: true,
                  assignedUser: {
                    select: { id: true, name: true, email: true }
                  }
                },
                orderBy: { order: 'asc' }
              }
            },
            orderBy: { order: 'asc' }
          }
        }
      });

      if (!board) {
        return res.status(404).json({ error: 'Quadro Kanban não encontrado' });
      }

      logger.info('Quadro Kanban obtido', { boardId: id, companyId });

      res.json({ board });
    } catch (error: any) {
      logger.error('Erro ao obter quadro Kanban', { error: error.message });
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  }

  async createBoard(req: AuthRequest, res: Response) {
    try {
      const { name, description, settings } = req.body;
      const companyId = req.user!.companyId;

      if (!name) {
        return res.status(400).json({ error: 'Nome é obrigatório' });
      }

      const board = await prisma.kanbanBoard.create({
        data: {
          name,
          description,
          settings: settings || {},
          companyId
        }
      });

      // Criar colunas padrão
      const defaultColumns = [
        { name: 'Novos Leads', order: 1, color: '#3B82F6' },
        { name: 'Em Contato', order: 2, color: '#F59E0B' },
        { name: 'Qualificados', order: 3, color: '#10B981' },
        { name: 'Proposta', order: 4, color: '#8B5CF6' },
        { name: 'Negociação', order: 5, color: '#EF4444' },
        { name: 'Fechado', order: 6, color: '#6B7280' }
      ];

      for (const column of defaultColumns) {
        await prisma.kanbanColumn.create({
          data: {
            ...column,
            boardId: board.id
          }
        });
      }

      logger.info('Quadro Kanban criado', { boardId: board.id, companyId });

      res.status(201).json({ board });
    } catch (error: any) {
      logger.error('Erro ao criar quadro Kanban', { error: error.message });
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  }

  async updateBoard(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const { name, description, isActive, settings } = req.body;
      const companyId = req.user!.companyId;

      const board = await prisma.kanbanBoard.findFirst({
        where: { id, companyId }
      });

      if (!board) {
        return res.status(404).json({ error: 'Quadro Kanban não encontrado' });
      }

      const updatedBoard = await prisma.kanbanBoard.update({
        where: { id },
        data: {
          name,
          description,
          isActive,
          settings
        }
      });

      logger.info('Quadro Kanban atualizado', { boardId: id, companyId });

      res.json({ board: updatedBoard });
    } catch (error: any) {
      logger.error('Erro ao atualizar quadro Kanban', { error: error.message });
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  }

  async deleteBoard(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const companyId = req.user!.companyId;

      const board = await prisma.kanbanBoard.findFirst({
        where: { id, companyId }
      });

      if (!board) {
        return res.status(404).json({ error: 'Quadro Kanban não encontrado' });
      }

      await prisma.kanbanBoard.delete({
        where: { id }
      });

      logger.info('Quadro Kanban deletado', { boardId: id, companyId });

      res.json({ message: 'Quadro Kanban deletado com sucesso' });
    } catch (error: any) {
      logger.error('Erro ao deletar quadro Kanban', { error: error.message });
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  }

  async createColumn(req: AuthRequest, res: Response) {
    try {
      const { boardId } = req.params;
      const { name, color } = req.body;
      const companyId = req.user!.companyId;

      if (!name) {
        return res.status(400).json({ error: 'Nome é obrigatório' });
      }

      // Verificar se o quadro pertence à empresa
      const board = await prisma.kanbanBoard.findFirst({
        where: { id: boardId, companyId }
      });

      if (!board) {
        return res.status(404).json({ error: 'Quadro Kanban não encontrado' });
      }

      // Obter a maior ordem atual
      const maxOrder = await prisma.kanbanColumn.findFirst({
        where: { boardId },
        orderBy: { order: 'desc' },
        select: { order: true }
      });

      const column = await prisma.kanbanColumn.create({
        data: {
          name,
          color,
          order: (maxOrder?.order || 0) + 1,
          boardId
        }
      });

      logger.info('Coluna Kanban criada', { columnId: column.id, boardId });

      res.status(201).json({ column });
    } catch (error: any) {
      logger.error('Erro ao criar coluna Kanban', { error: error.message });
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  }

  async updateColumn(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const { name, color, isActive } = req.body;
      const companyId = req.user!.companyId;

      // Verificar se a coluna pertence a um quadro da empresa
      const column = await prisma.kanbanColumn.findFirst({
        where: {
          id,
          board: { companyId }
        }
      });

      if (!column) {
        return res.status(404).json({ error: 'Coluna Kanban não encontrada' });
      }

      const updatedColumn = await prisma.kanbanColumn.update({
        where: { id },
        data: {
          name,
          color,
          isActive
        }
      });

      logger.info('Coluna Kanban atualizada', { columnId: id });

      res.json({ column: updatedColumn });
    } catch (error: any) {
      logger.error('Erro ao atualizar coluna Kanban', { error: error.message });
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  }

  async deleteColumn(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const companyId = req.user!.companyId;

      // Verificar se a coluna pertence a um quadro da empresa
      const column = await prisma.kanbanColumn.findFirst({
        where: {
          id,
          board: { companyId }
        }
      });

      if (!column) {
        return res.status(404).json({ error: 'Coluna Kanban não encontrada' });
      }

      await prisma.kanbanColumn.delete({
        where: { id }
      });

      logger.info('Coluna Kanban deletada', { columnId: id });

      res.json({ message: 'Coluna Kanban deletada com sucesso' });
    } catch (error: any) {
      logger.error('Erro ao deletar coluna Kanban', { error: error.message });
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  }

  async createCard(req: AuthRequest, res: Response) {
    try {
      const { columnId } = req.params;
      const { title, description, leadId, assignedTo, color, dueDate } = req.body;
      const companyId = req.user!.companyId;

      if (!title) {
        return res.status(400).json({ error: 'Título é obrigatório' });
      }

      // Verificar se a coluna pertence a um quadro da empresa
      const column = await prisma.kanbanColumn.findFirst({
        where: {
          id: columnId,
          board: { companyId }
        }
      });

      if (!column) {
        return res.status(404).json({ error: 'Coluna Kanban não encontrada' });
      }

      // Obter a maior ordem atual
      const maxOrder = await prisma.kanbanCard.findFirst({
        where: { columnId },
        orderBy: { order: 'desc' },
        select: { order: true }
      });

      const card = await prisma.kanbanCard.create({
        data: {
          title,
          description,
          leadId,
          assignedTo,
          color,
          dueDate: dueDate ? new Date(dueDate) : null,
          order: (maxOrder?.order || 0) + 1,
          columnId
        },
        include: {
          lead: true,
          assignedUser: {
            select: { id: true, name: true, email: true }
          }
        }
      });

      logger.info('Card Kanban criado', { cardId: card.id, columnId });

      res.status(201).json({ card });
    } catch (error: any) {
      logger.error('Erro ao criar card Kanban', { error: error.message });
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  }

  async updateCard(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const { title, description, assignedTo, color, dueDate } = req.body;
      const companyId = req.user!.companyId;

      // Verificar se o card pertence a um quadro da empresa
      const card = await prisma.kanbanCard.findFirst({
        where: {
          id,
          column: { board: { companyId } }
        }
      });

      if (!card) {
        return res.status(404).json({ error: 'Card Kanban não encontrado' });
      }

      const updatedCard = await prisma.kanbanCard.update({
        where: { id },
        data: {
          title,
          description,
          assignedTo,
          color,
          dueDate: dueDate ? new Date(dueDate) : null
        },
        include: {
          lead: true,
          assignedUser: {
            select: { id: true, name: true, email: true }
          }
        }
      });

      logger.info('Card Kanban atualizado', { cardId: id });

      res.json({ card: updatedCard });
    } catch (error: any) {
      logger.error('Erro ao atualizar card Kanban', { error: error.message });
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  }

  async moveCard(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const { columnId, order } = req.body;
      const companyId = req.user!.companyId;

      // Verificar se o card pertence a um quadro da empresa
      const card = await prisma.kanbanCard.findFirst({
        where: {
          id,
          column: { board: { companyId } }
        }
      });

      if (!card) {
        return res.status(404).json({ error: 'Card Kanban não encontrado' });
      }

      // Verificar se a nova coluna pertence ao mesmo quadro
      const newColumn = await prisma.kanbanColumn.findFirst({
        where: {
          id: columnId,
          board: { companyId }
        }
      });

      if (!newColumn) {
        return res.status(404).json({ error: 'Coluna de destino não encontrada' });
      }

      // Atualizar posição do card
      const updatedCard = await prisma.kanbanCard.update({
        where: { id },
        data: {
          columnId,
          order
        },
        include: {
          lead: true,
          assignedUser: {
            select: { id: true, name: true, email: true }
          }
        }
      });

      logger.info('Card Kanban movido', { cardId: id, newColumnId: columnId, newOrder: order });

      res.json({ card: updatedCard });
    } catch (error: any) {
      logger.error('Erro ao mover card Kanban', { error: error.message });
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  }

  async deleteCard(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const companyId = req.user!.companyId;

      // Verificar se o card pertence a um quadro da empresa
      const card = await prisma.kanbanCard.findFirst({
        where: {
          id,
          column: { board: { companyId } }
        }
      });

      if (!card) {
        return res.status(404).json({ error: 'Card Kanban não encontrado' });
      }

      await prisma.kanbanCard.delete({
        where: { id }
      });

      logger.info('Card Kanban deletado', { cardId: id });

      res.json({ message: 'Card Kanban deletado com sucesso' });
    } catch (error: any) {
      logger.error('Erro ao deletar card Kanban', { error: error.message });
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  }

  async getLeads(req: AuthRequest, res: Response) {
    try {
      const { page = 1, limit = 20, status, search } = req.query;
      const companyId = req.user!.companyId;

      const skip = (Number(page) - 1) * Number(limit);
      
      const where: any = { companyId };

      if (status) {
        where.status = status;
      }

      if (search) {
        where.OR = [
          { name: { contains: search as string, mode: 'insensitive' } },
          { email: { contains: search as string, mode: 'insensitive' } },
          { phone: { contains: search as string, mode: 'insensitive' } },
          { companyName: { contains: search as string, mode: 'insensitive' } }
        ];
      }

      const [leads, total] = await Promise.all([
        prisma.lead.findMany({
          where,
          include: {
            assignedUser: {
              select: { id: true, name: true, email: true }
            }
          },
          orderBy: { createdAt: 'desc' },
          skip,
          take: Number(limit)
        }),
        prisma.lead.count({ where })
      ]);

      logger.info('Leads listados', { companyId, count: leads.length });

      res.json({
        leads,
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total,
          pages: Math.ceil(total / Number(limit))
        }
      });
    } catch (error: any) {
      logger.error('Erro ao listar leads', { error: error.message });
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  }

  async createLead(req: AuthRequest, res: Response) {
    try {
      const { name, email, phone, companyName, source, status } = req.body;
      const companyId = req.user!.companyId;

      if (!name) {
        return res.status(400).json({ error: 'Nome é obrigatório' });
      }

      const lead = await prisma.lead.create({
        data: {
          name,
          email,
          phone,
          companyName,
          source,
          status: status || 'NEW',
          companyId
        }
      });

      logger.info('Lead criado', { leadId: lead.id, companyId });

      res.status(201).json({ lead });
    } catch (error: any) {
      logger.error('Erro ao criar lead', { error: error.message });
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  }

  async updateLead(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const { name, email, phone, companyName, source, status, assignedTo, score } = req.body;
      const companyId = req.user!.companyId;

      const lead = await prisma.lead.findFirst({
        where: { id, companyId }
      });

      if (!lead) {
        return res.status(404).json({ error: 'Lead não encontrado' });
      }

      const updatedLead = await prisma.lead.update({
        where: { id },
        data: {
          name,
          email,
          phone,
          companyName,
          source,
          status,
          assignedTo,
          score
        }
      });

      logger.info('Lead atualizado', { leadId: id, companyId });

      res.json({ lead: updatedLead });
    } catch (error: any) {
      logger.error('Erro ao atualizar lead', { error: error.message });
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  }
}

export default new KanbanController(); 