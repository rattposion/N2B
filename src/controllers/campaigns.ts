import { Response } from 'express';
import { AuthRequest } from '../types';
import prisma from '../utils/database';
import logger from '../utils/logger';
import whatsappService from '../services/whatsapp';

export class CampaignsController {
  async getCampaigns(req: AuthRequest, res: Response) {
    try {
      const { page = 1, limit = 20, status, type } = req.query;
      const companyId = req.user!.companyId;

      const skip = (Number(page) - 1) * Number(limit);
      
      const where: any = { companyId };

      if (status) {
        where.status = status;
      }

      if (type) {
        where.type = type;
      }

      const [campaigns, total] = await Promise.all([
        prisma.campaign.findMany({
          where,
          include: {
            whatsappNumber: {
              select: { id: true, name: true, phoneNumber: true }
            },
            _count: {
              select: { contacts: true, results: true }
            }
          },
          orderBy: { createdAt: 'desc' },
          skip,
          take: Number(limit)
        }),
        prisma.campaign.count({ where })
      ]);

      logger.info('Campanhas listadas', { companyId, count: campaigns.length });

      res.json({
        campaigns,
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total,
          pages: Math.ceil(total / Number(limit))
        }
      });
    } catch (error: any) {
      logger.error('Erro ao listar campanhas', { error: error.message });
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  }

  async getCampaign(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const companyId = req.user!.companyId;

      const campaign = await prisma.campaign.findFirst({
        where: {
          id,
          companyId
        },
        include: {
          whatsappNumber: {
            select: { id: true, name: true, phoneNumber: true }
          },
          contacts: {
            include: {
              contact: true
            }
          },
          results: {
            orderBy: { createdAt: 'desc' }
          }
        }
      });

      if (!campaign) {
        return res.status(404).json({ error: 'Campanha não encontrada' });
      }

      logger.info('Campanha obtida', { campaignId: id, companyId });

      res.json({ campaign });
    } catch (error: any) {
      logger.error('Erro ao obter campanha', { error: error.message });
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  }

  async createCampaign(req: AuthRequest, res: Response) {
    try {
      const { 
        name, 
        description, 
        type, 
        message, 
        scheduledAt, 
        whatsappNumberId,
        contactIds 
      } = req.body;
      const companyId = req.user!.companyId;

      if (!name || !type || !message || !whatsappNumberId) {
        return res.status(400).json({ 
          error: 'Nome, tipo, mensagem e número de WhatsApp são obrigatórios' 
        });
      }

      // Verificar se o número de WhatsApp pertence à empresa
      const whatsappNumber = await prisma.whatsAppNumber.findFirst({
        where: { id: whatsappNumberId, companyId }
      });

      if (!whatsappNumber) {
        return res.status(404).json({ error: 'Número de WhatsApp não encontrado' });
      }

      const campaign = await prisma.campaign.create({
        data: {
          name,
          description,
          type,
          message,
          scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
          companyId,
          whatsappNumberId
        },
        include: {
          whatsappNumber: {
            select: { id: true, name: true, phoneNumber: true }
          }
        }
      });

      // Adicionar contatos à campanha
      if (contactIds && contactIds.length > 0) {
        const campaignContacts = contactIds.map((contactId: string) => ({
          campaignId: campaign.id,
          contactId
        }));

        await prisma.campaignContact.createMany({
          data: campaignContacts
        });
      }

      logger.info('Campanha criada', { campaignId: campaign.id, companyId });

      res.status(201).json({ campaign });
    } catch (error: any) {
      logger.error('Erro ao criar campanha', { error: error.message });
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  }

  async updateCampaign(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const { 
        name, 
        description, 
        type, 
        message, 
        scheduledAt, 
        status,
        whatsappNumberId 
      } = req.body;
      const companyId = req.user!.companyId;

      const campaign = await prisma.campaign.findFirst({
        where: { id, companyId }
      });

      if (!campaign) {
        return res.status(404).json({ error: 'Campanha não encontrada' });
      }

      const updatedCampaign = await prisma.campaign.update({
        where: { id },
        data: {
          name,
          description,
          type,
          message,
          scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
          status,
          whatsappNumberId
        },
        include: {
          whatsappNumber: {
            select: { id: true, name: true, phoneNumber: true }
          }
        }
      });

      logger.info('Campanha atualizada', { campaignId: id, companyId });

      res.json({ campaign: updatedCampaign });
    } catch (error: any) {
      logger.error('Erro ao atualizar campanha', { error: error.message });
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  }

  async deleteCampaign(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const companyId = req.user!.companyId;

      const campaign = await prisma.campaign.findFirst({
        where: { id, companyId }
      });

      if (!campaign) {
        return res.status(404).json({ error: 'Campanha não encontrada' });
      }

      await prisma.campaign.delete({
        where: { id }
      });

      logger.info('Campanha deletada', { campaignId: id, companyId });

      res.json({ message: 'Campanha deletada com sucesso' });
    } catch (error: any) {
      logger.error('Erro ao deletar campanha', { error: error.message });
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  }

  async executeCampaign(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const companyId = req.user!.companyId;

      const campaign = await prisma.campaign.findFirst({
        where: { id, companyId },
        include: {
          whatsappNumber: true,
          contacts: {
            include: {
              contact: true
            }
          }
        }
      });

      if (!campaign) {
        return res.status(404).json({ error: 'Campanha não encontrada' });
      }

      if (campaign.status !== 'DRAFT' && campaign.status !== 'SCHEDULED') {
        return res.status(400).json({ error: 'Campanha não pode ser executada' });
      }

      // Atualizar status para RUNNING
      await prisma.campaign.update({
        where: { id },
        data: { status: 'RUNNING' }
      });

      // Executar envio em background
      this.executeCampaignInBackground(campaign);

      logger.info('Campanha iniciada', { campaignId: id, companyId });

      res.json({ message: 'Campanha iniciada com sucesso' });
    } catch (error: any) {
      logger.error('Erro ao executar campanha', { error: error.message });
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  }

  private async executeCampaignInBackground(campaign: any) {
    try {
      const contacts = campaign.contacts.map((cc: any) => cc.contact.phone);
      const results = await whatsappService.sendBulkMessage(
        campaign.whatsappNumberId,
        contacts,
        campaign.message
      );

      // Atualizar status dos contatos
      for (let i = 0; i < campaign.contacts.length; i++) {
        const contact = campaign.contacts[i];
        const result = results[i];

        await prisma.campaignContact.update({
          where: { id: contact.id },
          data: {
            status: result.success ? 'SENT' : 'FAILED',
            sentAt: result.success ? new Date() : null,
            error: result.error || null
          }
        });
      }

      // Atualizar status da campanha
      const successCount = results.filter((r: any) => r.success).length;
      await prisma.campaign.update({
        where: { id: campaign.id },
        data: {
          status: 'COMPLETED',
          sentAt: new Date()
        }
      });

      // Salvar resultados
      await prisma.campaignResult.create({
        data: {
          campaignId: campaign.id,
          metric: 'total_sent',
          value: successCount,
          metadata: {
            totalContacts: contacts.length,
            failedCount: contacts.length - successCount
          }
        }
      });

      logger.info('Campanha executada com sucesso', { 
        campaignId: campaign.id,
        totalContacts: contacts.length,
        successCount 
      });

    } catch (error: any) {
      logger.error('Erro ao executar campanha em background', { 
        campaignId: campaign.id,
        error: error.message 
      });

      await prisma.campaign.update({
        where: { id: campaign.id },
        data: { status: 'FAILED' }
      });
    }
  }

  async getContacts(req: AuthRequest, res: Response) {
    try {
      const { page = 1, limit = 20, search } = req.query;
      const companyId = req.user!.companyId;

      const skip = (Number(page) - 1) * Number(limit);
      
      const where: any = { companyId, isActive: true };

      if (search) {
        where.OR = [
          { name: { contains: search as string, mode: 'insensitive' } },
          { phone: { contains: search as string, mode: 'insensitive' } },
          { email: { contains: search as string, mode: 'insensitive' } }
        ];
      }

      const [contacts, total] = await Promise.all([
        prisma.contact.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip,
          take: Number(limit)
        }),
        prisma.contact.count({ where })
      ]);

      logger.info('Contatos listados', { companyId, count: contacts.length });

      res.json({
        contacts,
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total,
          pages: Math.ceil(total / Number(limit))
        }
      });
    } catch (error: any) {
      logger.error('Erro ao listar contatos', { error: error.message });
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  }

  async createContact(req: AuthRequest, res: Response) {
    try {
      const { name, phone, email, tags } = req.body;
      const companyId = req.user!.companyId;

      if (!name || !phone) {
        return res.status(400).json({ 
          error: 'Nome e telefone são obrigatórios' 
        });
      }

      const contact = await prisma.contact.create({
        data: {
          name,
          phone,
          email,
          tags: tags || [],
          companyId
        }
      });

      logger.info('Contato criado', { contactId: contact.id, companyId });

      res.status(201).json({ contact });
    } catch (error: any) {
      logger.error('Erro ao criar contato', { error: error.message });
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  }
}

export default new CampaignsController(); 