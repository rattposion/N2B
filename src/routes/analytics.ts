import express from 'express';
import { authenticate } from '../middleware/auth';
import prisma from '../utils/database';
import logger from '../utils/logger';

const router = express.Router();

// Middleware de autenticação
router.use(authenticate);

// Analytics de conversas
router.get('/conversations', async (req, res) => {
  try {
    const { range = '7d' } = req.query;
    const companyId = (req as any).user.companyId;

    // Calcular data de início baseada no range
    const startDate = new Date();
    switch (range) {
      case '1d':
        startDate.setDate(startDate.getDate() - 1);
        break;
      case '7d':
        startDate.setDate(startDate.getDate() - 7);
        break;
      case '30d':
        startDate.setDate(startDate.getDate() - 30);
        break;
      case '90d':
        startDate.setDate(startDate.getDate() - 90);
        break;
      default:
        startDate.setDate(startDate.getDate() - 7);
    }

    // Buscar dados de conversas
    const conversations = await prisma.conversation.findMany({
      where: {
        companyId,
        createdAt: {
          gte: startDate
        }
      },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' }
        },
        customer: true
      }
    });

    // Buscar analytics salvos
    const analytics = await prisma.analytics.findMany({
      where: {
        date: {
          gte: startDate
        },
        metric: 'conversation_analysis'
      }
    });

    // Calcular métricas
    const totalConversations = conversations.length;
    const totalMessages = conversations.reduce((sum, conv) => sum + conv.messages.length, 0);
    
    // Calcular tempo médio de resposta
    let totalResponseTime = 0;
    let responseCount = 0;
    
    conversations.forEach(conversation => {
      const messages = conversation.messages;
      for (let i = 1; i < messages.length; i++) {
        const prevMessage = messages[i - 1];
        const currentMessage = messages[i];
        
        if ((prevMessage.sender as string) === 'CUSTOMER' && (currentMessage.sender as string) === 'USER') {
          const responseTime = currentMessage.createdAt.getTime() - prevMessage.createdAt.getTime();
          totalResponseTime += responseTime;
          responseCount++;
        }
      }
    });
    
    const averageResponseTime = responseCount > 0 ? Math.round(totalResponseTime / responseCount / 1000) : 0;

    // Calcular taxa de satisfação (baseada em sentimento positivo)
    const positiveAnalytics = analytics.filter(a => 
      a.metadata && (a.metadata as any).sentiment === 'positive'
    ).length;
    const satisfactionRate = analytics.length > 0 ? Math.round((positiveAnalytics / analytics.length) * 100) : 0;

    // Calcular taxa de escalação
    const escalationAnalytics = analytics.filter(a => 
      a.metadata && (a.metadata as any).escalationNeeded === true
    ).length;
    const escalationRate = analytics.length > 0 ? Math.round((escalationAnalytics / analytics.length) * 100) : 0;

    // Top intenções
    const intentCounts: { [key: string]: number } = {};
    analytics.forEach(a => {
      if (a.metadata && (a.metadata as any).intent) {
        const intent = (a.metadata as any).intent;
        intentCounts[intent] = (intentCounts[intent] || 0) + 1;
      }
    });
    
    const topIntents = Object.entries(intentCounts)
      .map(([intent, count]) => ({ intent, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    // Distribuição de sentimento
    const sentimentCounts: { [key: string]: number } = {};
    analytics.forEach(a => {
      if (a.metadata && (a.metadata as any).sentiment) {
        const sentiment = (a.metadata as any).sentiment;
        sentimentCounts[sentiment] = (sentimentCounts[sentiment] || 0) + 1;
      }
    });
    
    const sentimentDistribution = Object.entries(sentimentCounts)
      .map(([sentiment, count]) => ({ sentiment, count }))
      .sort((a, b) => b.count - a.count);

    // Conversas por dia
    const conversationsByDay: { [key: string]: number } = {};
    conversations.forEach(conversation => {
      const date = conversation.createdAt.toISOString().split('T')[0];
      conversationsByDay[date] = (conversationsByDay[date] || 0) + 1;
    });
    
    const conversationsByDayArray = Object.entries(conversationsByDay)
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // Tempo de resposta por hora
    const responseTimeByHour: { [key: number]: number[] } = {};
    conversations.forEach(conversation => {
      const messages = conversation.messages;
      for (let i = 1; i < messages.length; i++) {
        const prevMessage = messages[i - 1];
        const currentMessage = messages[i];
        
        if ((prevMessage.sender as string) === 'CUSTOMER' && (currentMessage.sender as string) === 'USER') {
          const hour = currentMessage.createdAt.getHours();
          const responseTime = currentMessage.createdAt.getTime() - prevMessage.createdAt.getTime();
          
          if (!responseTimeByHour[hour]) {
            responseTimeByHour[hour] = [];
          }
          responseTimeByHour[hour].push(responseTime);
        }
      }
    });
    
    const responseTimeByHourArray = Object.entries(responseTimeByHour)
      .map(([hour, times]) => ({
        hour: parseInt(hour),
        avgTime: Math.round(times.reduce((sum, time) => sum + time, 0) / times.length / 1000)
      }))
      .sort((a, b) => a.hour - b.hour);

    const analyticsData = {
      totalConversations,
      totalMessages,
      averageResponseTime,
      satisfactionRate,
      escalationRate,
      topIntents,
      sentimentDistribution,
      conversationsByDay: conversationsByDayArray,
      responseTimeByHour: responseTimeByHourArray
    };

    res.json(analyticsData);
  } catch (error: any) {
    logger.error('Erro ao buscar analytics de conversas', { error: error.message });
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Analytics detalhados de uma conversa específica
router.get('/conversations/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const companyId = (req as any).user.companyId;

    const conversation = await prisma.conversation.findFirst({
      where: {
        id,
        companyId
      },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' }
        },
        customer: true
      }
    });

    if (!conversation) {
      return res.status(404).json({ error: 'Conversa não encontrada' });
    }

    // Calcular métricas da conversa
    const totalMessages = conversation.messages.length;
    const customerMessages = conversation.messages.filter(m => (m.sender as string) === 'CUSTOMER').length;
    const userMessages = conversation.messages.filter(m => (m.sender as string) === 'USER').length;
    
    // Tempo médio de resposta
    let totalResponseTime = 0;
    let responseCount = 0;
    
    for (let i = 1; i < conversation.messages.length; i++) {
      const prevMessage = conversation.messages[i - 1];
      const currentMessage = conversation.messages[i];
      
      if ((prevMessage.sender as string) === 'CUSTOMER' && (currentMessage.sender as string) === 'USER') {
        const responseTime = currentMessage.createdAt.getTime() - prevMessage.createdAt.getTime();
        totalResponseTime += responseTime;
        responseCount++;
      }
    }
    
    const averageResponseTime = responseCount > 0 ? Math.round(totalResponseTime / responseCount / 1000) : 0;

    // Duração da conversa
    const firstMessage = conversation.messages[0];
    const lastMessage = conversation.messages[conversation.messages.length - 1];
    const duration = firstMessage && lastMessage 
      ? Math.round((lastMessage.createdAt.getTime() - firstMessage.createdAt.getTime()) / 1000 / 60)
      : 0;

    // Buscar analytics específicos da conversa
    const conversationAnalytics = await prisma.analytics.findMany({
      where: {
        metadata: {
          path: ['conversationId'],
          equals: id
        }
      }
    });

    const analyticsData = {
      conversationId: id,
      totalMessages,
      customerMessages,
      userMessages,
      averageResponseTime,
      duration,
      analytics: conversationAnalytics
    };

    res.json(analyticsData);
  } catch (error: any) {
    logger.error('Erro ao buscar analytics da conversa', { error: error.message });
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Exportar analytics
router.get('/export', async (req, res) => {
  try {
    const { format = 'json', range = '30d' } = req.query;
    const companyId = (req as any).user.companyId;

    // Calcular data de início
    const startDate = new Date();
    switch (range) {
      case '7d':
        startDate.setDate(startDate.getDate() - 7);
        break;
      case '30d':
        startDate.setDate(startDate.getDate() - 30);
        break;
      case '90d':
        startDate.setDate(startDate.getDate() - 90);
        break;
      default:
        startDate.setDate(startDate.getDate() - 30);
    }

    // Buscar dados
    const conversations = await prisma.conversation.findMany({
      where: {
        companyId,
        createdAt: {
          gte: startDate
        }
      },
      include: {
        messages: true,
        customer: true
      }
    });

    const analytics = await prisma.analytics.findMany({
      where: {
        date: {
          gte: startDate
        }
      }
    });

    const exportData = {
      period: {
        start: startDate,
        end: new Date()
      },
      conversations,
      analytics
    };

    if (format === 'csv') {
      // Implementar exportação CSV
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=analytics.csv');
      res.send('CSV export not implemented yet');
    } else {
      res.json(exportData);
    }
  } catch (error: any) {
    logger.error('Erro ao exportar analytics', { error: error.message });
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

export default router; 