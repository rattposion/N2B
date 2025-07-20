import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../src/utils/auth';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Iniciando seed do banco de dados...');

  // Create demo company
  const company = await prisma.company.upsert({
    where: { slug: 'demo-company' },
    update: {},
    create: {
      name: 'Demo Company',
      slug: 'demo-company',
      plan: 'PROFESSIONAL',
      settings: {
        aiEnabled: true,
        voiceEnabled: true,
        language: 'pt-BR',
        aiTone: 'friendly',
        businessHours: {
          enabled: true,
          timezone: 'America/Sao_Paulo',
          schedule: {
            monday: { start: '09:00', end: '18:00' },
            tuesday: { start: '09:00', end: '18:00' },
            wednesday: { start: '09:00', end: '18:00' },
            thursday: { start: '09:00', end: '18:00' },
            friday: { start: '09:00', end: '18:00' }
          }
        }
      }
    }
  });

  // Create demo admin user
  const hashedPassword = await hashPassword('admin123');
  const adminUser = await prisma.user.upsert({
    where: { email: 'admin@demo.com' },
    update: {},
    create: {
      name: 'Admin Demo',
      email: 'admin@demo.com',
      password: hashedPassword,
      role: 'ADMIN',
      companyId: company.id,
      avatar: 'https://images.pexels.com/photos/771742/pexels-photo-771742.jpeg?auto=compress&cs=tinysrgb&w=400'
    }
  });

  // Create demo bot
  const bot = await prisma.bot.create({
    data: {
      name: 'Assistente Principal',
      description: 'Bot principal para atendimento geral e vendas',
      isActive: true,
      companyId: company.id,
      settings: {
        welcomeMessage: 'Olá! Sou seu assistente virtual. Como posso ajudá-lo hoje?',
        fallbackMessage: 'Desculpe, não entendi. Pode reformular sua pergunta?',
        handoffEnabled: true,
        voiceEnabled: true,
        proactiveMessages: true
      }
    }
  });

  // Create demo channels
  const whatsappChannel = await prisma.channel.create({
    data: {
      type: 'WHATSAPP',
      name: 'WhatsApp Business',
      isActive: true,
      isConnected: true,
      companyId: company.id,
      botId: bot.id,
      credentials: {
        token: 'demo-token',
        phoneNumberId: 'demo-phone-id',
        verifyToken: 'demo-verify-token'
      },
      settings: {
        phoneNumber: '+55 11 99999-9999',
        businessName: 'Demo Company'
      }
    }
  });

  const webchatChannel = await prisma.channel.create({
    data: {
      type: 'WEBCHAT',
      name: 'Webchat',
      isActive: true,
      isConnected: true,
      companyId: company.id,
      botId: bot.id,
      settings: {
        domain: 'https://demo.com',
        position: 'bottom-right',
        theme: 'blue'
      }
    }
  });

  // Create demo customers
  const customers = await Promise.all([
    prisma.customer.create({
      data: {
        name: 'João Silva',
        email: 'joao@email.com',
        phone: '+55 11 98888-8888',
        metadata: { source: 'website', interests: ['pricing', 'features'] }
      }
    }),
    prisma.customer.create({
      data: {
        name: 'Maria Santos',
        email: 'maria@empresa.com',
        phone: '+55 11 97777-7777',
        metadata: { source: 'whatsapp', company: 'StartupXYZ' }
      }
    })
  ]);

  // Create demo conversations
  const conversation1 = await prisma.conversation.create({
    data: {
      companyId: company.id,
      customerId: customers[0].id,
      channelId: whatsappChannel.id,
      botId: bot.id,
      status: 'ACTIVE',
      assignedTo: adminUser.id
    }
  });

  const conversation2 = await prisma.conversation.create({
    data: {
      companyId: company.id,
      customerId: customers[1].id,
      channelId: webchatChannel.id,
      botId: bot.id,
      status: 'CLOSED',
      rating: 5,
      feedback: 'Excelente atendimento!',
      endedAt: new Date()
    }
  });

  // Create demo messages
  await Promise.all([
    prisma.message.create({
      data: {
        content: 'Olá, gostaria de saber mais sobre os planos',
        type: 'TEXT',
        sender: 'USER',
        conversationId: conversation1.id,
        channelId: whatsappChannel.id
      }
    }),
    prisma.message.create({
      data: {
        content: 'Olá! Ficaria feliz em ajudar com informações sobre nossos planos. Temos três opções: Starter, Professional e Enterprise. Qual tipo de negócio você tem?',
        type: 'TEXT',
        sender: 'BOT',
        conversationId: conversation1.id,
        channelId: whatsappChannel.id,
        metadata: { confidence: 0.95, intent: 'pricing' }
      }
    })
  ]);

  // Create demo flows
  await prisma.flow.create({
    data: {
      name: 'Fluxo de Vendas',
      description: 'Fluxo para qualificação e conversão de leads',
      isActive: true,
      triggers: ['vendas', 'preços', 'planos', 'comprar'],
      category: 'Vendas',
      companyId: company.id,
      botId: bot.id,
      steps: [
        {
          id: '1',
          type: 'message',
          content: 'Ótimo! Vou te ajudar a encontrar o plano ideal. Qual o tamanho da sua empresa?',
          nextStepId: '2'
        },
        {
          id: '2',
          type: 'condition',
          conditions: {
            'pequena': '3',
            'média': '4',
            'grande': '5'
          }
        }
      ]
    }
  });

  // Create demo knowledge base
  await Promise.all([
    prisma.knowledgeBase.create({
      data: {
        title: 'Como configurar integração WhatsApp',
        content: 'Para configurar a integração com WhatsApp Business API, siga estes passos: 1. Acesse o painel de canais...',
        category: 'Integrações',
        tags: ['whatsapp', 'api', 'configuração'],
        isActive: true,
        views: 1247,
        companyId: company.id
      }
    }),
    prisma.knowledgeBase.create({
      data: {
        title: 'Melhores práticas para fluxos conversacionais',
        content: 'Criar fluxos eficientes é essencial para uma boa experiência do usuário. Aqui estão as principais dicas...',
        category: 'Fluxos',
        tags: ['fluxos', 'conversão', 'boas-práticas'],
        isActive: true,
        views: 892,
        companyId: company.id
      }
    })
  ]);

  console.log('✅ Seed concluído com sucesso!');
  console.log(`👤 Admin criado: admin@demo.com / admin123`);
  console.log(`🏢 Empresa: ${company.name} (${company.slug})`);
  console.log(`🤖 Bot: ${bot.name}`);
}

main()
  .catch((e) => {
    console.error('❌ Erro no seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });