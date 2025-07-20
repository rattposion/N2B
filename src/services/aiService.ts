import axios from 'axios';
import logger from '../utils/logger';
import prisma from '../utils/database';

export interface AIMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface AIResponse {
  message: string;
  confidence: number;
  intent: string;
  entities?: any[];
  suggestedActions?: string[];
  sentiment?: 'positive' | 'negative' | 'neutral';
  escalationNeeded?: boolean;
}

export interface ConversationContext {
  customerName: string;
  customerPhone: string;
  companyName: string;
  conversationHistory: AIMessage[];
  currentIntent?: string;
  customerPreferences?: any;
  customerData?: any;
  companyData?: any;
}

class AIService {
  private openaiApiKey: string;
  private openrouterApiKey: string;
  private defaultProvider: string;

  constructor() {
    this.openaiApiKey = process.env.OPENAI_API_KEY || '';
    this.openrouterApiKey = process.env.OPENROUTER_API_KEY || '';
    this.defaultProvider = process.env.AI_PROVIDER || 'openai';
  }

  async generateResponse(
    messages: AIMessage[],
    systemPrompt: string,
    context?: ConversationContext
  ): Promise<AIResponse> {
    try {
      // Enriquecer contexto com dados reais
      const enrichedContext = await this.enrichContext(context);
      const enrichedPrompt = await this.enrichSystemPrompt(systemPrompt, enrichedContext);
      
      // Adicionar mensagem do sistema
      const fullMessages = [
        { role: 'system' as const, content: enrichedPrompt },
        ...messages
      ];

      let response: AIResponse;

      if (this.defaultProvider === 'openrouter') {
        response = await this.callOpenRouter(fullMessages);
      } else {
        response = await this.callOpenAI(fullMessages);
      }

      // Analisar resposta para extrair intenção e entidades
      const analysis = await this.analyzeResponse(response.message, enrichedContext);
      
      // Determinar sentimento
      const sentiment = await this.analyzeSentiment(messages[messages.length - 1]?.content || '');
      
      // Verificar se precisa escalar
      const escalationNeeded = await this.shouldEscalateToHuman(messages, sentiment);
      
      return {
        ...response,
        intent: analysis.intent,
        entities: analysis.entities,
        suggestedActions: analysis.suggestedActions,
        sentiment,
        escalationNeeded
      };
    } catch (error: any) {
      logger.error('Erro ao gerar resposta da IA', { error: error.message });
      return {
        message: 'Desculpe, não consegui processar sua mensagem no momento. Como posso ajudá-lo?',
        confidence: 0.5,
        intent: 'fallback',
        suggestedActions: ['escalar_para_humano'],
        sentiment: 'neutral',
        escalationNeeded: true
      };
    }
  }

  private async enrichContext(context?: ConversationContext): Promise<ConversationContext | undefined> {
    if (!context) return context;

    try {
      // Buscar dados reais do cliente
      const customer = await prisma.customer.findFirst({
        where: { phone: context.customerPhone },
        include: {
          conversations: {
            include: {
              messages: {
                orderBy: { createdAt: 'desc' },
                take: 10
              }
            },
            orderBy: { updatedAt: 'desc' },
            take: 5
          }
        }
      });

      if (customer) {
        context.customerData = {
          id: customer.id,
          name: customer.name,
          email: customer.email,
          totalConversations: customer.conversations.length,
          lastInteraction: customer.conversations[0]?.updatedAt,
          preferences: customer.metadata
        };
      }

      // Buscar dados da empresa
      const company = await prisma.company.findFirst({
        where: { name: context.companyName },
        include: {
          knowledgeBase: {
            where: { isActive: true },
            take: 10,
            orderBy: { views: 'desc' }
          }
        }
      });

      if (company) {
        context.companyData = {
          id: company.id,
          name: company.name,
          plan: company.plan,
          knowledgeBase: company.knowledgeBase,
          products: [],
          services: [],
          settings: company.settings
        };
      }

      return context;
    } catch (error: any) {
      logger.error('Erro ao enriquecer contexto', { error: error.message });
      return context;
    }
  }

  private async enrichSystemPrompt(
    basePrompt: string,
    context?: ConversationContext
  ): Promise<string> {
    let enrichedPrompt = basePrompt;

    if (context) {
      enrichedPrompt += `\n\nContexto da conversa:
- Cliente: ${context.customerName} (${context.customerPhone})
- Empresa: ${context.companyName}
- Histórico: ${context.conversationHistory.length} mensagens anteriores`;

      // Adicionar dados do cliente
      if (context.customerData) {
        enrichedPrompt += `\n\nDados do Cliente:
- Nome: ${context.customerData.name}
- Email: ${context.customerData.email || 'Não informado'}
- Total de conversas: ${context.customerData.totalConversations}
- Última interação: ${context.customerData.lastInteraction ? new Date(context.customerData.lastInteraction).toLocaleDateString() : 'Nunca'}
- Preferências: ${JSON.stringify(context.customerData.preferences || {})}`;
      }

      // Adicionar dados da empresa
      if (context.companyData) {
        enrichedPrompt += `\n\nDados da Empresa:
- Nome: ${context.companyData.name}
- Plano: ${context.companyData.plan}
- Produtos: ${context.companyData.products?.length || 0} disponíveis
- Serviços: ${context.companyData.services?.length || 0} disponíveis`;

        // Adicionar base de conhecimento
        if (context.companyData.knowledgeBase?.length > 0) {
          enrichedPrompt += `\n\nBase de Conhecimento:
${context.companyData.knowledgeBase.map(kb => `- ${kb.title}: ${kb.content}`).join('\n')}`;
        }

        // Adicionar produtos
        if (context.companyData.products?.length > 0) {
          enrichedPrompt += `\n\nProdutos Disponíveis:
${context.companyData.products.map(p => `- ${p.name}: ${p.description || 'Sem descrição'}`).join('\n')}`;
        }

        // Adicionar serviços
        if (context.companyData.services?.length > 0) {
          enrichedPrompt += `\n\nServiços Disponíveis:
${context.companyData.services.map(s => `- ${s.name}: ${s.description || 'Sem descrição'}`).join('\n')}`;
        }
      }
    }

    enrichedPrompt += `\n\nInstruções:
1. Seja sempre amigável e prestativo
2. Use o nome do cliente quando apropriado
3. Se não souber algo, sugira escalar para um humano
4. Mantenha respostas concisas mas informativas
5. Identifique a intenção do cliente e responda adequadamente
6. Se for uma pergunta sobre produtos/serviços, use a base de conhecimento
7. Se for uma reclamação, demonstre empatia e ofereça soluções
8. Considere o histórico de conversas do cliente
9. Personalize respostas baseado nas preferências do cliente
10. Se o cliente for recorrente, reconheça isso`;

    return enrichedPrompt;
  }

  private async callOpenAI(messages: AIMessage[]): Promise<AIResponse> {
    const response = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-4',
        messages,
        max_tokens: 500,
        temperature: 0.7,
        presence_penalty: 0.1,
        frequency_penalty: 0.1
      },
      {
        headers: {
          'Authorization': `Bearer ${this.openaiApiKey}`,
          'Content-Type': 'application/json'
        }
      }
    );

    return {
      message: response.data.choices[0].message.content,
      confidence: 0.8,
      intent: 'general'
    };
  }

  private async callOpenRouter(messages: AIMessage[]): Promise<AIResponse> {
    const response = await axios.post(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        model: 'anthropic/claude-3-sonnet',
        messages,
        max_tokens: 500,
        temperature: 0.7
      },
      {
        headers: {
          'Authorization': `Bearer ${this.openrouterApiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://your-app.com',
          'X-Title': 'WhatsApp AI Assistant'
        }
      }
    );

    return {
      message: response.data.choices[0].message.content,
      confidence: 0.8,
      intent: 'general'
    };
  }

  private async analyzeResponse(
    message: string,
    context?: ConversationContext
  ): Promise<{ intent: string; entities: any[]; suggestedActions: string[] }> {
    // Análise avançada de intenção baseada em palavras-chave e contexto
    const lowerMessage = message.toLowerCase();
    
    let intent = 'general';
    const entities: any[] = [];
    const suggestedActions: string[] = [];

    // Detectar intenções mais específicas
    if (lowerMessage.includes('produto') || lowerMessage.includes('serviço') || lowerMessage.includes('o que vocês vendem')) {
      intent = 'product_inquiry';
      suggestedActions.push('fornecer_catalogo_produtos', 'explicar_servicos');
    } else if (lowerMessage.includes('preço') || lowerMessage.includes('valor') || lowerMessage.includes('quanto custa')) {
      intent = 'pricing_inquiry';
      suggestedActions.push('fornecer_precos', 'enviar_orcamento');
    } else if (lowerMessage.includes('problema') || lowerMessage.includes('erro') || lowerMessage.includes('não funciona')) {
      intent = 'technical_support';
      suggestedActions.push('diagnosticar_problema', 'escalar_para_suporte');
    } else if (lowerMessage.includes('reclamação') || lowerMessage.includes('insatisfeito') || lowerMessage.includes('péssimo')) {
      intent = 'complaint';
      suggestedActions.push('demonstrar_empatia', 'escalar_para_supervisor', 'oferecer_compensacao');
    } else if (lowerMessage.includes('agradecimento') || lowerMessage.includes('obrigado') || lowerMessage.includes('valeu')) {
      intent = 'gratitude';
      suggestedActions.push('responder_cordialmente', 'agradecer_feedback');
    } else if (lowerMessage.includes('comprar') || lowerMessage.includes('adquirir') || lowerMessage.includes('quero comprar')) {
      intent = 'purchase_intent';
      suggestedActions.push('guiar_para_vendas', 'explicar_processo_compra');
    } else if (lowerMessage.includes('cancelar') || lowerMessage.includes('devolver') || lowerMessage.includes('desistir')) {
      intent = 'cancellation';
      suggestedActions.push('escalar_para_atendimento', 'explicar_politica_cancelamento');
    } else if (lowerMessage.includes('horário') || lowerMessage.includes('funcionamento') || lowerMessage.includes('aberto')) {
      intent = 'business_hours';
      suggestedActions.push('fornecer_horarios', 'explicar_funcionamento');
    } else if (lowerMessage.includes('endereço') || lowerMessage.includes('localização') || lowerMessage.includes('onde fica')) {
      intent = 'location_inquiry';
      suggestedActions.push('fornecer_endereco', 'enviar_mapa');
    }

    // Extrair entidades mais avançadas
    const phoneRegex = /(\+55\s?)?\(?([0-9]{2})\)?\s?([0-9]{4,5})-?([0-9]{4})/g;
    const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
    const cpfRegex = /(\d{3}\.?\d{3}\.?\d{3}-?\d{2})/g;
    const cnpjRegex = /(\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2})/g;
    
    const phones = message.match(phoneRegex);
    const emails = message.match(emailRegex);
    const cpfs = message.match(cpfRegex);
    const cnpjs = message.match(cnpjRegex);

    if (phones) {
      entities.push(...phones.map(phone => ({ type: 'phone', value: phone })));
    }
    if (emails) {
      entities.push(...emails.map(email => ({ type: 'email', value: email })));
    }
    if (cpfs) {
      entities.push(...cpfs.map(cpf => ({ type: 'cpf', value: cpf })));
    }
    if (cnpjs) {
      entities.push(...cnpjs.map(cnpj => ({ type: 'cnpj', value: cnpj })));
    }

    // Detectar produtos/serviços mencionados
    if (context?.companyData?.products) {
      const mentionedProducts = context.companyData.products.filter(product =>
        lowerMessage.includes(product.name.toLowerCase())
      );
      entities.push(...mentionedProducts.map(p => ({ type: 'product', value: p.name })));
    }

    return { intent, entities, suggestedActions };
  }

  private async analyzeSentiment(message: string): Promise<'positive' | 'negative' | 'neutral'> {
    const lowerMessage = message.toLowerCase();
    
    const positiveWords = [
      'obrigado', 'valeu', 'ótimo', 'excelente', 'maravilhoso', 'perfeito',
      'gostei', 'satisfeito', 'feliz', 'contento', 'agradecido'
    ];
    
    const negativeWords = [
      'péssimo', 'ruim', 'horrível', 'terrível', 'insatisfeito', 'frustrado',
      'irritado', 'chateado', 'revoltado', 'indignado', 'decepcionado'
    ];

    const positiveCount = positiveWords.filter(word => lowerMessage.includes(word)).length;
    const negativeCount = negativeWords.filter(word => lowerMessage.includes(word)).length;

    if (positiveCount > negativeCount) return 'positive';
    if (negativeCount > positiveCount) return 'negative';
    return 'neutral';
  }

  private async getCompanyKnowledgeBase(companyName: string): Promise<any[]> {
    try {
      const knowledgeBase = await prisma.knowledgeBase.findMany({
        where: {
          company: {
            name: companyName
          },
          isActive: true
        },
        take: 10,
        orderBy: { views: 'desc' }
      });

      return knowledgeBase;
    } catch (error: any) {
      logger.error('Erro ao buscar base de conhecimento', { error: error.message });
      return [];
    }
  }

  async shouldEscalateToHuman(
    conversationHistory: AIMessage[],
    customerSentiment: string
  ): Promise<boolean> {
    // Lógica mais sofisticada para escalação
    const recentMessages = conversationHistory.slice(-5);
    const customerMessages = recentMessages.filter(msg => msg.role === 'user');
    
    // Escalar se:
    // 1. Cliente está insatisfeito
    if (customerSentiment === 'negative') return true;
    
    // 2. Muitas mensagens sem resolução
    if (customerMessages.length >= 4) return true;
    
    // 3. Palavras-chave que indicam necessidade de humano
    const escalationKeywords = [
      'supervisor', 'gerente', 'humano', 'pessoa', 'falar com alguém',
      'reclamação', 'problema', 'erro', 'insatisfeito', 'frustrado',
      'cancelar', 'devolver', 'processar', 'queixa', 'denúncia'
    ];
    
    const hasEscalationKeywords = customerMessages.some(msg =>
      escalationKeywords.some(keyword => 
        msg.content.toLowerCase().includes(keyword)
      )
    );
    
    // 4. Cliente recorrente com problemas
    if (customerMessages.length >= 2 && customerSentiment === 'negative') return true;
    
    return hasEscalationKeywords;
  }

  async generateEscalationMessage(customerName: string): Promise<string> {
    return `Entendo sua situação, ${customerName}. Vou conectar você com um de nossos especialistas que poderá ajudá-lo melhor. Em instantes você será atendido por um humano.`;
  }

  async updateCustomerPreferences(
    customerId: string,
    preferences: any
  ): Promise<void> {
    try {
      await prisma.customer.update({
        where: { id: customerId },
        data: {
          metadata: {
            ...preferences
          }
        }
      });
    } catch (error: any) {
      logger.error('Erro ao atualizar preferências do cliente', { error: error.message });
    }
  }

  async trackConversationAnalytics(
    conversationId: string,
    data: {
      intent: string;
      sentiment: string;
      escalationNeeded: boolean;
      responseTime: number;
      customerSatisfaction?: number;
    }
  ): Promise<void> {
    try {
      await prisma.analytics.create({
        data: {
          date: new Date(),
          metric: 'conversation_analysis',
          value: 1,
          metadata: {
            conversationId,
            ...data
          }
        }
      });
    } catch (error: any) {
      logger.error('Erro ao salvar analytics da conversa', { error: error.message });
    }
  }
}

export default new AIService(); 