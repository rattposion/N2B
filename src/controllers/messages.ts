import { Response } from 'express';
import { AuthRequest } from '../types';
import prisma from '../utils/database';
import openaiService from '../services/openai';
import ttsService from '../services/tts';
import logger from '../utils/logger';

export class MessagesController {
  async sendMessage(req: AuthRequest, res: Response) {
    try {
      const { content, conversationId, type = 'TEXT' } = req.body;
      const userId = req.user?.id;

      // Find conversation
      const conversation = await prisma.conversation.findFirst({
        where: {
          id: conversationId,
          companyId: req.user?.companyId
        },
        include: {
          messages: {
            orderBy: { createdAt: 'desc' },
            take: 10
          },
          bot: true,
          channel: true
        }
      });

      if (!conversation) {
        return res.status(404).json({ error: 'Conversa não encontrada' });
      }

      // Create user message
      const userMessage = await prisma.message.create({
        data: {
          content,
          type,
          sender: 'USER',
          conversationId,
          channelId: conversation.channelId,
          userId
        }
      });

      // Generate AI response if bot is active
      let botResponse = null;
      if (conversation.bot && conversation.status === 'ACTIVE') {
        try {
          const messageHistory = conversation.messages.map(msg => ({
            role: msg.sender === 'USER' ? 'user' as const : 'assistant' as const,
            content: msg.content
          }));

          const aiResponse = await openaiService.generateResponse(
            [...messageHistory, { role: 'user', content }],
            'Você é um assistente de atendimento ao cliente.',
            'friendly'
          );

          botResponse = await prisma.message.create({
            data: {
              content: aiResponse.message,
              type: 'TEXT',
              sender: 'BOT',
              conversationId,
              channelId: conversation.channelId,
              metadata: {
                confidence: aiResponse.confidence,
                intent: aiResponse.intent
              }
            }
          });

          // Generate TTS if enabled
          if (conversation.bot.settings?.voiceEnabled) {
            try {
              const ttsResponse = await ttsService.generateSpeech(aiResponse.message);
              botResponse = await prisma.message.update({
                where: { id: botResponse.id },
                data: {
                  metadata: {
                    ...botResponse.metadata,
                    audioUrl: ttsResponse.audioUrl,
                    duration: ttsResponse.duration
                  }
                }
              });
            } catch (ttsError) {
              logger.warn('Erro ao gerar TTS', { error: ttsError.message });
            }
          }
        } catch (aiError) {
          logger.error('Erro ao gerar resposta da IA', { error: aiError.message });
        }
      }

      // Update conversation
      await prisma.conversation.update({
        where: { id: conversationId },
        data: { updatedAt: new Date() }
      });

      logger.info('Mensagem enviada', { 
        messageId: userMessage.id, 
        conversationId,
        hasBot: !!botResponse 
      });

      res.json({
        message: 'Mensagem enviada com sucesso',
        userMessage,
        botResponse
      });
    } catch (error) {
      logger.error('Erro ao enviar mensagem', { error: error.message });
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  }

  async getMessages(req: AuthRequest, res: Response) {
    try {
      const { conversationId } = req.params;
      const { page = 1, limit = 50 } = req.query;

      const messages = await prisma.message.findMany({
        where: {
          conversationId,
          conversation: {
            companyId: req.user?.companyId
          }
        },
        orderBy: { createdAt: 'desc' },
        skip: (Number(page) - 1) * Number(limit),
        take: Number(limit),
        include: {
          user: {
            select: { id: true, name: true, avatar: true }
          }
        }
      });

      const total = await prisma.message.count({
        where: {
          conversationId,
          conversation: {
            companyId: req.user?.companyId
          }
        }
      });

      res.json({
        messages: messages.reverse(),
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total,
          pages: Math.ceil(total / Number(limit))
        }
      });
    } catch (error) {
      logger.error('Erro ao buscar mensagens', { error: error.message });
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  }

  async markAsRead(req: AuthRequest, res: Response) {
    try {
      const { conversationId } = req.params;

      await prisma.conversation.update({
        where: {
          id: conversationId,
          companyId: req.user?.companyId
        },
        data: {
          updatedAt: new Date()
        }
      });

      res.json({ message: 'Mensagens marcadas como lidas' });
    } catch (error) {
      logger.error('Erro ao marcar como lida', { error: error.message });
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  }
}

export default new MessagesController();