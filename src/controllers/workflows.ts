import { Response } from 'express';
import { AuthRequest } from '../types';
import prisma from '../utils/database';
import logger from '../utils/logger';
import { WorkflowEngine } from '../services/workflowEngine';

export class WorkflowsController {
  async getFlows(req: AuthRequest, res: Response) {
    try {
      const { page = 1, limit = 20, category, isActive } = req.query;
      const companyId = req.user!.companyId;

      const skip = (Number(page) - 1) * Number(limit);
      
      const where: any = { companyId };

      if (category) {
        where.category = category;
      }

      if (isActive !== undefined) {
        where.isActive = isActive === 'true';
      }

      const [flows, total] = await Promise.all([
        prisma.flow.findMany({
          where,
          include: {
            bot: {
              select: { id: true, name: true }
            },
            _count: {
              select: { executions: true }
            }
          },
          orderBy: [
            { priority: 'desc' },
            { createdAt: 'desc' }
          ],
          skip,
          take: Number(limit)
        }),
        prisma.flow.count({ where })
      ]);

      logger.info('Flows listados', { companyId, count: flows.length });

      res.json({
        flows,
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total,
          pages: Math.ceil(total / Number(limit))
        }
      });
    } catch (error: any) {
      logger.error('Erro ao listar flows', { error: error.message });
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  }

  async getFlow(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const companyId = req.user!.companyId;

      const flow = await prisma.flow.findFirst({
        where: {
          id,
          companyId
        },
        include: {
          bot: {
            select: { id: true, name: true }
          },
          executions: {
            orderBy: { createdAt: 'desc' },
            take: 10
          }
        }
      });

      if (!flow) {
        return res.status(404).json({ error: 'Flow não encontrado' });
      }

      logger.info('Flow obtido', { flowId: id, companyId });

      res.json({ flow });
    } catch (error: any) {
      logger.error('Erro ao obter flow', { error: error.message });
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  }

  async createFlow(req: AuthRequest, res: Response) {
    try {
      const { name, description, triggers, steps, category, botId, priority = 0 } = req.body;
      const companyId = req.user!.companyId;

      if (!name || !triggers || !steps) {
        return res.status(400).json({ error: 'Nome, triggers e steps são obrigatórios' });
      }

      const flow = await prisma.flow.create({
        data: {
          name,
          description,
          triggers,
          steps,
          category,
          priority,
          companyId,
          botId
        },
        include: {
          bot: {
            select: { id: true, name: true }
          }
        }
      });

      logger.info('Flow criado', { flowId: flow.id, companyId });

      res.status(201).json({ flow });
    } catch (error: any) {
      logger.error('Erro ao criar flow', { error: error.message });
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  }

  async updateFlow(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const { name, description, triggers, steps, category, isActive, botId, priority } = req.body;
      const companyId = req.user!.companyId;

      const flow = await prisma.flow.findFirst({
        where: { id, companyId }
      });

      if (!flow) {
        return res.status(404).json({ error: 'Flow não encontrado' });
      }

      const updatedFlow = await prisma.flow.update({
        where: { id },
        data: {
          name,
          description,
          triggers,
          steps,
          category,
          isActive,
          botId,
          priority
        },
        include: {
          bot: {
            select: { id: true, name: true }
          }
        }
      });

      logger.info('Flow atualizado', { flowId: id, companyId });

      res.json({ flow: updatedFlow });
    } catch (error: any) {
      logger.error('Erro ao atualizar flow', { error: error.message });
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  }

  async deleteFlow(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const companyId = req.user!.companyId;

      const flow = await prisma.flow.findFirst({
        where: { id, companyId }
      });

      if (!flow) {
        return res.status(404).json({ error: 'Flow não encontrado' });
      }

      await prisma.flow.delete({
        where: { id }
      });

      logger.info('Flow deletado', { flowId: id, companyId });

      res.json({ message: 'Flow deletado com sucesso' });
    } catch (error: any) {
      logger.error('Erro ao deletar flow', { error: error.message });
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  }

  async executeFlow(req: AuthRequest, res: Response) {
    try {
      const { flowId, conversationId, data = {} } = req.body;
      const companyId = req.user!.companyId;

      if (!flowId || !conversationId) {
        return res.status(400).json({ error: 'Flow ID e Conversation ID são obrigatórios' });
      }

      // Verificar se o flow existe
      const flow = await prisma.flow.findFirst({
        where: { id: flowId, companyId }
      });

      if (!flow) {
        return res.status(404).json({ error: 'Flow não encontrado' });
      }

      // Verificar se a conversa existe
      const conversation = await prisma.conversation.findFirst({
        where: { id: conversationId, companyId }
      });

      if (!conversation) {
        return res.status(404).json({ error: 'Conversa não encontrada' });
      }

      // Criar execução do workflow
      const execution = await prisma.workflowExecution.create({
        data: {
          flowId,
          conversationId,
          companyId,
          data,
          status: 'RUNNING'
        }
      });

      // Executar o workflow
      const workflowEngine = new WorkflowEngine();
      const result = await workflowEngine.execute(execution.id);

      logger.info('Workflow executado', { 
        executionId: execution.id, 
        flowId, 
        conversationId,
        status: result.status 
      });

      res.json({ 
        execution: result,
        message: 'Workflow iniciado com sucesso'
      });
    } catch (error: any) {
      logger.error('Erro ao executar workflow', { error: error.message });
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  }

  async getExecutions(req: AuthRequest, res: Response) {
    try {
      const { page = 1, limit = 20, status, flowId, conversationId } = req.query;
      const companyId = req.user!.companyId;

      const skip = (Number(page) - 1) * Number(limit);
      
      const where: any = { companyId };

      if (status) {
        where.status = status;
      }

      if (flowId) {
        where.flowId = flowId;
      }

      if (conversationId) {
        where.conversationId = conversationId;
      }

      const [executions, total] = await Promise.all([
        prisma.workflowExecution.findMany({
          where,
          include: {
            flow: {
              select: { id: true, name: true }
            },
            conversation: {
              select: { id: true, customerName: true }
            }
          },
          orderBy: { createdAt: 'desc' },
          skip,
          take: Number(limit)
        }),
        prisma.workflowExecution.count({ where })
      ]);

      logger.info('Execuções listadas', { companyId, count: executions.length });

      res.json({
        executions,
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total,
          pages: Math.ceil(total / Number(limit))
        }
      });
    } catch (error: any) {
      logger.error('Erro ao listar execuções', { error: error.message });
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  }

  async getExecution(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const companyId = req.user!.companyId;

      const execution = await prisma.workflowExecution.findFirst({
        where: {
          id,
          companyId
        },
        include: {
          flow: {
            select: { id: true, name: true, steps: true }
          },
          conversation: {
            select: { id: true, customerName: true, status: true }
          }
        }
      });

      if (!execution) {
        return res.status(404).json({ error: 'Execução não encontrada' });
      }

      logger.info('Execução obtida', { executionId: id, companyId });

      res.json({ execution });
    } catch (error: any) {
      logger.error('Erro ao obter execução', { error: error.message });
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  }

  async getFlowStats(req: AuthRequest, res: Response) {
    try {
      const companyId = req.user!.companyId;

      const [
        totalFlows,
        activeFlows,
        totalExecutions,
        completedExecutions,
        failedExecutions
      ] = await Promise.all([
        prisma.flow.count({ where: { companyId } }),
        prisma.flow.count({ where: { companyId, isActive: true } }),
        prisma.workflowExecution.count({ where: { companyId } }),
        prisma.workflowExecution.count({ where: { companyId, status: 'COMPLETED' } }),
        prisma.workflowExecution.count({ where: { companyId, status: 'FAILED' } })
      ]);

      const stats = {
        totalFlows,
        activeFlows,
        totalExecutions,
        completedExecutions,
        failedExecutions,
        successRate: totalExecutions > 0 ? (completedExecutions / totalExecutions) * 100 : 0
      };

      logger.info('Estatísticas de workflows obtidas', { companyId });

      res.json({ stats });
    } catch (error: any) {
      logger.error('Erro ao obter estatísticas', { error: error.message });
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  }
}

export default new WorkflowsController(); 