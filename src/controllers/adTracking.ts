import { Response } from 'express';
import { AuthRequest } from '../types';
import prisma from '../utils/database';
import logger from '../utils/logger';

export class AdTrackingController {
  async getAdTracking(req: AuthRequest, res: Response) {
    try {
      const { page = 1, limit = 20, platform } = req.query;
      const companyId = req.user!.companyId;

      const skip = (Number(page) - 1) * Number(limit);
      
      const where: any = { companyId };

      if (platform) {
        where.platform = platform;
      }

      const [adTracking, total] = await Promise.all([
        prisma.adTracking.findMany({
          where,
          include: {
            _count: {
              select: { leads: true }
            }
          },
          orderBy: { createdAt: 'desc' },
          skip,
          take: Number(limit)
        }),
        prisma.adTracking.count({ where })
      ]);

      logger.info('Rastreamento de anúncios listado', { companyId, count: adTracking.length });

      res.json({
        adTracking,
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total,
          pages: Math.ceil(total / Number(limit))
        }
      });
    } catch (error: any) {
      logger.error('Erro ao listar rastreamento de anúncios', { error: error.message });
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  }

  async getAdTrackingById(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const companyId = req.user!.companyId;

      const adTracking = await prisma.adTracking.findFirst({
        where: {
          id,
          companyId
        },
        include: {
          leads: {
            include: {
              assignedUser: {
                select: { id: true, name: true, email: true }
              }
            },
            orderBy: { createdAt: 'desc' }
          }
        }
      });

      if (!adTracking) {
        return res.status(404).json({ error: 'Rastreamento de anúncio não encontrado' });
      }

      logger.info('Rastreamento de anúncio obtido', { adTrackingId: id, companyId });

      res.json({ adTracking });
    } catch (error: any) {
      logger.error('Erro ao obter rastreamento de anúncio', { error: error.message });
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  }

  async createAdTracking(req: AuthRequest, res: Response) {
    try {
      const { 
        adId, 
        adName, 
        platform, 
        thumbnail, 
        title, 
        description, 
        conversionText,
        metadata 
      } = req.body;
      const companyId = req.user!.companyId;

      if (!adId || !adName || !platform) {
        return res.status(400).json({ 
          error: 'ID do anúncio, nome e plataforma são obrigatórios' 
        });
      }

      const adTracking = await prisma.adTracking.create({
        data: {
          adId,
          adName,
          platform,
          thumbnail,
          title,
          description,
          conversionText,
          metadata: metadata || {},
          companyId
        }
      });

      logger.info('Rastreamento de anúncio criado', { adTrackingId: adTracking.id, companyId });

      res.status(201).json({ adTracking });
    } catch (error: any) {
      logger.error('Erro ao criar rastreamento de anúncio', { error: error.message });
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  }

  async updateAdTracking(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const { 
        adName, 
        platform, 
        thumbnail, 
        title, 
        description, 
        conversionText,
        metadata 
      } = req.body;
      const companyId = req.user!.companyId;

      const adTracking = await prisma.adTracking.findFirst({
        where: { id, companyId }
      });

      if (!adTracking) {
        return res.status(404).json({ error: 'Rastreamento de anúncio não encontrado' });
      }

      const updatedAdTracking = await prisma.adTracking.update({
        where: { id },
        data: {
          adName,
          platform,
          thumbnail,
          title,
          description,
          conversionText,
          metadata
        }
      });

      logger.info('Rastreamento de anúncio atualizado', { adTrackingId: id, companyId });

      res.json({ adTracking: updatedAdTracking });
    } catch (error: any) {
      logger.error('Erro ao atualizar rastreamento de anúncio', { error: error.message });
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  }

  async deleteAdTracking(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const companyId = req.user!.companyId;

      const adTracking = await prisma.adTracking.findFirst({
        where: { id, companyId }
      });

      if (!adTracking) {
        return res.status(404).json({ error: 'Rastreamento de anúncio não encontrado' });
      }

      await prisma.adTracking.delete({
        where: { id }
      });

      logger.info('Rastreamento de anúncio deletado', { adTrackingId: id, companyId });

      res.json({ message: 'Rastreamento de anúncio deletado com sucesso' });
    } catch (error: any) {
      logger.error('Erro ao deletar rastreamento de anúncio', { error: error.message });
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  }

  async captureLeadFromAd(req: AuthRequest, res: Response) {
    try {
      const { adTrackingId } = req.params;
      const { name, email, phone, companyName, source, metadata } = req.body;
      const companyId = req.user!.companyId;

      if (!name) {
        return res.status(400).json({ error: 'Nome é obrigatório' });
      }

      // Verificar se o rastreamento de anúncio existe
      const adTracking = await prisma.adTracking.findFirst({
        where: { id: adTrackingId, companyId }
      });

      if (!adTracking) {
        return res.status(404).json({ error: 'Rastreamento de anúncio não encontrado' });
      }

      // Criar lead
      const lead = await prisma.lead.create({
        data: {
          name,
          email,
          phone,
          companyName,
          source: source || adTracking.platform,
          status: 'NEW',
          score: 0,
          metadata: {
            ...metadata,
            adTrackingId: adTracking.id,
            adId: adTracking.adId,
            adName: adTracking.adName,
            platform: adTracking.platform,
            capturedAt: new Date().toISOString()
          },
          companyId,
          adTrackingId: adTracking.id
        }
      });

      logger.info('Lead capturado de anúncio', { 
        leadId: lead.id, 
        adTrackingId, 
        companyId 
      });

      res.status(201).json({ lead });
    } catch (error: any) {
      logger.error('Erro ao capturar lead de anúncio', { error: error.message });
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  }

  async getAdTrackingStats(req: AuthRequest, res: Response) {
    try {
      const companyId = req.user!.companyId;

      // Estatísticas por plataforma
      const platformStats = await prisma.adTracking.groupBy({
        by: ['platform'],
        where: { companyId },
        _count: {
          id: true
        }
      });

      // Total de leads capturados
      const totalLeads = await prisma.lead.count({
        where: {
          companyId,
          adTrackingId: { not: null }
        }
      });

      // Leads por anúncio
      const leadsByAd = await prisma.adTracking.findMany({
        where: { companyId },
        include: {
          _count: {
            select: { leads: true }
          }
        },
        orderBy: {
          leads: {
            _count: 'desc'
          }
        },
        take: 10
      });

      // Conversão por anúncio
      const conversionStats = await prisma.lead.groupBy({
        by: ['adTrackingId'],
        where: {
          companyId,
          adTrackingId: { not: null }
        },
        _count: {
          id: true
        }
      });

      logger.info('Estatísticas de rastreamento obtidas', { companyId });

      res.json({
        platformStats,
        totalLeads,
        leadsByAd,
        conversionStats
      });
    } catch (error: any) {
      logger.error('Erro ao obter estatísticas de rastreamento', { error: error.message });
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  }

  async importFacebookAd(req: AuthRequest, res: Response) {
    try {
      const { adId, accessToken } = req.body;
      const companyId = req.user!.companyId;

      if (!adId || !accessToken) {
        return res.status(400).json({ 
          error: 'ID do anúncio e token de acesso são obrigatórios' 
        });
      }

      // Aqui você implementaria a integração com a API do Facebook
      // Para este exemplo, vamos simular os dados
      const adData = {
        adId,
        adName: `Anúncio ${adId}`,
        platform: 'facebook',
        thumbnail: 'https://via.placeholder.com/300x200',
        title: 'Título do anúncio',
        description: 'Descrição do anúncio',
        conversionText: 'Texto de conversão do anúncio',
        metadata: {
          facebookAdId: adId,
          importedAt: new Date().toISOString()
        }
      };

      const adTracking = await prisma.adTracking.create({
        data: {
          ...adData,
          companyId
        }
      });

      logger.info('Anúncio do Facebook importado', { 
        adTrackingId: adTracking.id, 
        adId, 
        companyId 
      });

      res.status(201).json({ adTracking });
    } catch (error: any) {
      logger.error('Erro ao importar anúncio do Facebook', { error: error.message });
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  }

  async importGoogleAd(req: AuthRequest, res: Response) {
    try {
      const { adId, customerId } = req.body;
      const companyId = req.user!.companyId;

      if (!adId || !customerId) {
        return res.status(400).json({ 
          error: 'ID do anúncio e ID do cliente são obrigatórios' 
        });
      }

      // Aqui você implementaria a integração com a API do Google Ads
      // Para este exemplo, vamos simular os dados
      const adData = {
        adId,
        adName: `Anúncio Google ${adId}`,
        platform: 'google',
        thumbnail: 'https://via.placeholder.com/300x200',
        title: 'Título do anúncio Google',
        description: 'Descrição do anúncio Google',
        conversionText: 'Texto de conversão do anúncio Google',
        metadata: {
          googleAdId: adId,
          customerId,
          importedAt: new Date().toISOString()
        }
      };

      const adTracking = await prisma.adTracking.create({
        data: {
          ...adData,
          companyId
        }
      });

      logger.info('Anúncio do Google importado', { 
        adTrackingId: adTracking.id, 
        adId, 
        companyId 
      });

      res.status(201).json({ adTracking });
    } catch (error: any) {
      logger.error('Erro ao importar anúncio do Google', { error: error.message });
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  }
}

export default new AdTrackingController(); 