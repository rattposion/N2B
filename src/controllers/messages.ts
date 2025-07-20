import { Request, Response } from 'express';
import prisma from '../utils/database';
import logger from '../utils/logger';
import openaiService from '../services/openai';
import ttsService from '../services/tts';

export class MessagesController {
  async getMessages(req: Request, res: Response) {
    try {
      const { conversationId } = req.params;
      const companyId = (req as any).user.companyId;

      const conversation = await prisma.conversation.findFirst({
        where: { id: conversationId, companyId }
      });

      if (!conversation) {
        return res.status(404).json({ error: 'Conversa não encontrada' });
      }

      const messages = await prisma.message.findMany({
        where: { conversationId },
        orderBy: { createdAt: 'asc' }
      });

      res.json(messages);
    } catch (error: any) {
      logger.error('Erro ao buscar mensagens', { error: error.message });
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  }

  async sendMessage(req: Request, res: Response) {
    try {
      const { conversationId } = req.params;
      const { content, type = 'TEXT', sender = 'USER' } = req.body;
      const companyId = (req as any).user.companyId;

      const conversation = await prisma.conversation.findFirst({
        where: { id: conversationId, companyId },
        include: {
          bot: true,
          channel: true
        }
      });

      if (!conversation) {
        return res.status(404).json({ error: 'Conversa não encontrada' });
      }

      // Create message
      const message = await prisma.message.create({
        data: {
          conversationId,
          channelId: conversation.channelId,
          content,
          type,
          sender,
          metadata: {}
        }
      });

      // Update conversation status
      await prisma.conversation.update({
        where: { id: conversationId },
        data: { status: 'ACTIVE' }
      });

      // If message is from user and bot exists, generate AI response
      if (sender === 'USER' && conversation.bot) {
        try {
          const botSettings = conversation.bot.settings as any;
          const voiceEnabled = botSettings?.voiceEnabled || false;

          // Generate AI response
          const aiResponse = await openaiService.generateResponse(
            content,
            conversationId,
            companyId
          );

          // Create AI message
          const aiMessage = await prisma.message.create({
            data: {
              conversationId,
              channelId: conversation.channelId,
              content: aiResponse.toString(),
              type: 'TEXT',
              sender: 'BOT',
              metadata: {}
            }
          });

          // Generate voice if enabled
          if (voiceEnabled) {
            try {
              const audioUrl = await ttsService.generateSpeech(aiResponse.toString());
              await prisma.message.create({
                data: {
                  conversationId,
                  channelId: conversation.channelId,
                  content: audioUrl.toString(),
                  type: 'AUDIO',
                  sender: 'BOT',
                  metadata: { originalText: aiResponse.toString() }
                }
              });
            } catch (ttsError: any) {
              logger.error('Erro na síntese de voz', { 
                error: ttsError.message,
                conversationId 
              });
            }
          }

          res.json({ message, aiMessage });
        } catch (aiError: any) {
          logger.error('Erro na geração de resposta IA', { 
            error: aiError.message,
            conversationId 
          });
          res.json({ message });
        }
      } else {
        res.json({ message });
      }
    } catch (error: any) {
      logger.error('Erro ao enviar mensagem', { error: error.message });
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  }

  async updateMessage(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { content } = req.body;
      const companyId = (req as any).user.companyId;

      const message = await prisma.message.findFirst({
        where: { id },
        include: {
          conversation: true
        }
      });

      if (!message || message.conversation.companyId !== companyId) {
        return res.status(404).json({ error: 'Mensagem não encontrada' });
      }

      const updatedMessage = await prisma.message.update({
        where: { id },
        data: { content }
      });

      res.json(updatedMessage);
    } catch (error: any) {
      logger.error('Erro ao atualizar mensagem', { error: error.message });
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  }

  async deleteMessage(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const companyId = (req as any).user.companyId;

      const message = await prisma.message.findFirst({
        where: { id },
        include: {
          conversation: true
        }
      });

      if (!message || message.conversation.companyId !== companyId) {
        return res.status(404).json({ error: 'Mensagem não encontrada' });
      }

      await prisma.message.delete({ where: { id } });

      res.json({ message: 'Mensagem deletada com sucesso' });
    } catch (error: any) {
      logger.error('Erro ao deletar mensagem', { error: error.message });
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  }
}

export default new MessagesController();