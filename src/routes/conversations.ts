import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import prisma from '../utils/database';
import logger from '../utils/logger';
import { AuthRequest } from '../types';

const router = Router();

// Aplicar middleware de autenticação em todas as rotas
router.use(authenticate);

// Listar conversas
router.get('/', async (req: AuthRequest, res) => {
  try {
    const companyId = req.user!.companyId;
    
    const conversations = await prisma.conversation.findMany({
      where: { companyId },
      include: {
        customer: true,
        channel: true,
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1
        }
      },
      orderBy: { updatedAt: 'desc' }
    });

    res.json({ conversations });
  } catch (error: any) {
    logger.error('Erro ao listar conversas', { error: error.message });
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Obter conversa específica
router.get('/:id', async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const companyId = req.user!.companyId;

    const conversation = await prisma.conversation.findFirst({
      where: { 
        id,
        companyId 
      },
      include: {
        customer: true,
        channel: true,
        messages: {
          orderBy: { createdAt: 'asc' }
        }
      }
    });

    if (!conversation) {
      return res.status(404).json({ error: 'Conversa não encontrada' });
    }

    res.json({ conversation });
  } catch (error: any) {
    logger.error('Erro ao buscar conversa', { error: error.message });
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Listar mensagens de uma conversa
router.get('/:id/messages', async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const companyId = req.user!.companyId;

    const conversation = await prisma.conversation.findFirst({
      where: { 
        id,
        companyId 
      }
    });

    if (!conversation) {
      return res.status(404).json({ error: 'Conversa não encontrada' });
    }

    const messages = await prisma.message.findMany({
      where: { conversationId: id },
      orderBy: { createdAt: 'asc' }
    });

    res.json({ messages });
  } catch (error: any) {
    logger.error('Erro ao buscar mensagens', { error: error.message });
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Enviar mensagem
router.post('/:id/messages', async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const { content, type = 'TEXT', sender = 'USER' } = req.body;
    const companyId = req.user!.companyId;

    const conversation = await prisma.conversation.findFirst({
      where: { 
        id,
        companyId 
      }
    });

    if (!conversation) {
      return res.status(404).json({ error: 'Conversa não encontrada' });
    }

    const message = await prisma.message.create({
      data: {
        content,
        type,
        sender,
        conversationId: id,
        channelId: conversation.channelId
      }
    });

    // Atualizar última atividade da conversa
    await prisma.conversation.update({
      where: { id },
      data: { updatedAt: new Date() }
    });

    res.status(201).json({ message });
  } catch (error: any) {
    logger.error('Erro ao enviar mensagem', { error: error.message });
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Atualizar status da conversa
router.patch('/:id/status', async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const companyId = req.user!.companyId;

    const conversation = await prisma.conversation.findFirst({
      where: { 
        id,
        companyId 
      }
    });

    if (!conversation) {
      return res.status(404).json({ error: 'Conversa não encontrada' });
    }

    const updatedConversation = await prisma.conversation.update({
      where: { id },
      data: { status }
    });

    res.json({ conversation: updatedConversation });
  } catch (error: any) {
    logger.error('Erro ao atualizar status da conversa', { error: error.message });
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

export default router;