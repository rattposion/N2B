import { Router, Request, Response } from 'express';
import whatsappService from '../services/whatsapp';
import prisma from '../utils/database';
import openaiService from '../services/openai';
import logger from '../utils/logger';

const router = Router();

// WhatsApp Webhook
router.get('/whatsapp', (req: Request, res: Response) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  const result = whatsappService.verifyWebhook(mode as string, token as string, challenge as string);
  
  if (result) {
    res.status(200).send(result);
  } else {
    res.status(403).send('Forbidden');
  }
});

router.post('/whatsapp', async (req: Request, res: Response) => {
  try {
    const message = whatsappService.parseWebhookMessage(req.body);
    
    if (!message) {
      return res.status(200).send('OK');
    }

    // Find or create customer
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

    // Find WhatsApp channel
    const channel = await prisma.channel.findFirst({
      where: {
        type: 'WHATSAPP',
        isActive: true
      },
      include: { bot: true }
    });

    if (!channel) {
      logger.warn('Canal WhatsApp não encontrado');
      return res.status(200).send('OK');
    }

    // Find or create conversation
    let conversation = await prisma.conversation.findFirst({
      where: {
        customerId: customer.id,
        channelId: channel.id,
        status: { in: ['ACTIVE', 'WAITING'] }
      }
    });

    if (!conversation) {
      conversation = await prisma.conversation.create({
        data: {
          companyId: channel.companyId,
          customerId: customer.id,
          channelId: channel.id,
          botId: channel.botId,
          status: 'ACTIVE'
        }
      });
    }

    // Save incoming message
    await prisma.message.create({
      data: {
        content: message.text?.body || '',
        type: 'TEXT',
        sender: 'USER',
        conversationId: conversation.id,
        channelId: channel.id,
        metadata: { whatsappId: message.id }
      }
    });

    // Generate AI response if bot is active
    if (channel.bot && channel.bot.isActive) {
      try {
        const aiResponse = await openaiService.generateResponse(
          [{ role: 'user', content: message.text?.body || '' }],
          'Você é um assistente de atendimento via WhatsApp.',
          'friendly'
        );

        // Save bot response
        await prisma.message.create({
          data: {
            content: aiResponse.message,
            type: 'TEXT',
            sender: 'BOT',
            conversationId: conversation.id,
            channelId: channel.id,
            metadata: {
              confidence: aiResponse.confidence,
              intent: aiResponse.intent
            }
          }
        });

        // Send response via WhatsApp
        await whatsappService.sendMessage(message.from, aiResponse.message);
      } catch (error) {
        logger.error('Erro ao processar mensagem WhatsApp', { error: error.message });
      }
    }

    res.status(200).send('OK');
  } catch (error) {
    logger.error('Erro no webhook WhatsApp', { error: error.message });
    res.status(500).send('Error');
  }
});

export default router;