import { Router, Request, Response } from 'express';
import whatsappService from '../services/whatsapp';
import prisma from '../utils/database';
import openaiService from '../services/openai';
import logger from '../utils/logger';
import { io } from '../index';

const router = Router();

// WhatsApp Webhook para múltiplos números
router.get('/whatsapp/:whatsappNumberId', (req: Request, res: Response) => {
  const { whatsappNumberId } = req.params;
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  const result = whatsappService.verifyWebhook(whatsappNumberId, mode as string, token as string, challenge as string);
  
  if (result) {
    res.status(200).send(result);
  } else {
    res.status(403).send('Forbidden');
  }
});

router.post('/whatsapp/:whatsappNumberId', async (req: Request, res: Response) => {
  try {
    const { whatsappNumberId } = req.params;
    const message = whatsappService.parseWebhookMessage(req.body);
    
    if (!message) {
      return res.status(200).send('OK');
    }

    // Buscar número de WhatsApp
    const whatsappNumber = await prisma.whatsAppNumber.findUnique({
      where: { id: whatsappNumberId }
    });

    if (!whatsappNumber || !whatsappNumber.isActive) {
      logger.warn('Número de WhatsApp não encontrado ou inativo', { whatsappNumberId });
      return res.status(200).send('OK');
    }

    // Processar mensagem recebida
    await whatsappService.processIncomingMessage(message);

    // Emitir evento em tempo real para o chat
    io.to(`company-${whatsappNumber.companyId}`).emit('whatsapp-message-received', {
      whatsappNumberId,
      message: {
        from: message.from,
        content: message.text?.body || '',
        timestamp: new Date(),
        type: message.type
      }
    });

    // Buscar ou criar customer
    let customer = await prisma.customer.findFirst({
      where: { phone: message.from }
    });

    if (!customer) {
      customer = await prisma.customer.create({
        data: {
          name: `Cliente ${message.from}`,
          phone: message.from
        }
      });
    }

    // Buscar ou criar conversa
    let conversation = await prisma.conversation.findFirst({
      where: {
        whatsappNumberId: whatsappNumber.id,
        customerId: customer.id,
        status: { in: ['ACTIVE', 'WAITING'] }
      }
    });

    if (!conversation) {
      // Criar channel se não existir
      let channel = await prisma.channel.findFirst({
        where: {
          companyId: whatsappNumber.companyId,
          type: 'WHATSAPP'
        }
      });

      if (!channel) {
        channel = await prisma.channel.create({
          data: {
            name: 'WhatsApp',
            type: 'WHATSAPP',
            companyId: whatsappNumber.companyId,
            isConnected: true
          }
        });
      }

      conversation = await prisma.conversation.create({
        data: {
          companyId: whatsappNumber.companyId,
          customerId: customer.id,
          channelId: channel.id,
          whatsappNumberId: whatsappNumber.id,
          status: 'ACTIVE'
        }
      });
    }

    // Salvar mensagem
    const savedMessage = await prisma.message.create({
      data: {
        content: message.text?.body || '',
        type: 'TEXT',
        sender: 'CUSTOMER',
        conversationId: conversation.id,
        channelId: conversation.channelId,
        metadata: {
          whatsappMessageId: message.id,
          from: message.from,
          timestamp: message.timestamp
        }
      }
    });

    // Emitir evento para sala específica da conversa
    io.to(`conversation-${conversation.id}`).emit('conversation-message', {
      conversationId: conversation.id,
      message: {
        id: savedMessage.id,
        content: savedMessage.content,
        type: savedMessage.type,
        sender: savedMessage.sender,
        timestamp: savedMessage.createdAt,
        customer: {
          id: customer.id,
          name: customer.name,
          phone: customer.phone
        }
      }
    });

    // Verificar se há bot ativo para responder automaticamente
    const bot = await prisma.bot.findFirst({
      where: {
        companyId: whatsappNumber.companyId,
        isActive: true
      }
    });

    if (bot) {
      try {
        // Buscar histórico da conversa
        const conversationHistory = await prisma.message.findMany({
          where: { conversationId: conversation.id },
          orderBy: { createdAt: 'asc' },
          take: 10 // Últimas 10 mensagens
        });

        // Preparar contexto para IA
        const messages = conversationHistory.map(msg => ({
          role: msg.sender === 'CUSTOMER' ? 'user' as const : 'assistant' as const,
          content: msg.content
        }));

        // Gerar resposta da IA
        const aiResponse = await openaiService.generateResponse(
          messages,
          'Você é um assistente de atendimento via WhatsApp. Seja amigável e prestativo.',
          'friendly'
        );

        // Salvar resposta do bot
        const botMessage = await prisma.message.create({
          data: {
            content: aiResponse.message,
            type: 'TEXT',
            sender: 'BOT',
            conversationId: conversation.id,
            channelId: conversation.channelId,
            metadata: {
              confidence: aiResponse.confidence,
              intent: aiResponse.intent
            }
          }
        });

        // Enviar resposta via WhatsApp
        await whatsappService.sendMessage(whatsappNumber.id, message.from, aiResponse.message);

        // Emitir resposta do bot em tempo real
        io.to(`conversation-${conversation.id}`).emit('conversation-message', {
          conversationId: conversation.id,
          message: {
            id: botMessage.id,
            content: botMessage.content,
            type: botMessage.type,
            sender: botMessage.sender,
            timestamp: botMessage.createdAt
          }
        });

      } catch (error: any) {
        logger.error('Erro ao processar resposta automática', { error: error.message });
      }
    }

    res.status(200).send('OK');
  } catch (error: any) {
    logger.error('Erro no webhook WhatsApp', { error: error.message });
    res.status(500).send('Error');
  }
});

// Webhook para status de conexão
router.post('/whatsapp/:whatsappNumberId/status', async (req: Request, res: Response) => {
  try {
    const { whatsappNumberId } = req.params;
    const { status } = req.body;

    // Atualizar status de conexão
    await prisma.whatsAppNumber.update({
      where: { id: whatsappNumberId },
      data: { 
        isConnected: status === 'connected',
        qrCode: status === 'connected' ? null : undefined
      }
    });

    // Emitir evento de status
    const whatsappNumber = await prisma.whatsAppNumber.findUnique({
      where: { id: whatsappNumberId }
    });

    if (whatsappNumber) {
      io.to(`company-${whatsappNumber.companyId}`).emit('whatsapp-connection-status', {
        whatsappNumberId,
        status: status === 'connected' ? 'CONNECTED' : 'DISCONNECTED',
        timestamp: new Date()
      });
    }

    res.status(200).send('OK');
  } catch (error: any) {
    logger.error('Erro ao processar status de conexão', { error: error.message });
    res.status(500).send('Error');
  }
});

export default router;