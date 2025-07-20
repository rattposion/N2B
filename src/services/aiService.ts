import OpenAI from 'openai';
import { OpenAIMessage, AIResponse } from '../types';
import logger from '../utils/logger';
import openRouterService from './openrouter';
import prisma from '../utils/database';

export enum AIProvider {
  OPENAI = 'OPENAI',
  OPENROUTER = 'OPENROUTER',
  ANTHROPIC = 'ANTHROPIC',
  GOOGLE = 'GOOGLE',
  AZURE = 'AZURE'
}

interface AIServiceConfig {
  provider: AIProvider;
  model: string;
  apiKey?: string;
  temperature?: number;
  maxTokens?: number;
}

export class AIService {
  private openai: OpenAI | null = null;

  constructor() {
    if (process.env.OPENAI_API_KEY) {
      this.openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
      });
    } else {
      logger.warn('OPENAI_API_KEY não configurada. Serviços de IA estarão limitados.');
    }
  }

  async generateResponse(
    messages: OpenAIMessage[],
    assistantId: string,
    context?: string,
    tone: string = 'friendly'
  ): Promise<AIResponse> {
    try {
      // Buscar configuração do assistente
      const assistant = await prisma.aIAssistant.findUnique({
        where: { id: assistantId }
      });

      if (!assistant) {
        throw new Error('Assistente não encontrado');
      }

      const config: AIServiceConfig = {
        provider: (assistant as any).provider as AIProvider || AIProvider.OPENAI,
        model: (assistant as any).model || 'gpt-3.5-turbo',
        apiKey: (assistant as any).apiKey || undefined,
        temperature: 0.7,
        maxTokens: 1000
      };

      // Escolher provedor baseado na configuração
      switch (config.provider) {
        case AIProvider.OPENAI:
          return await this.generateOpenAIResponse(messages, assistant.personality, context, tone);
        
        case AIProvider.OPENROUTER:
          return await this.generateOpenRouterResponse(messages, assistant.personality, config);
        
        case AIProvider.ANTHROPIC:
          return await this.generateOpenRouterResponse(messages, assistant.personality, {
            ...config,
            model: 'anthropic/claude-3.5-sonnet'
          });
        
        default:
          // Fallback para OpenAI
          return await this.generateOpenAIResponse(messages, assistant.personality, context, tone);
      }
    } catch (error: any) {
      logger.error('Erro no AI Service', { error: error.message, assistantId });
      return {
        message: 'Desculpe, estou com dificuldades técnicas no momento. Tente novamente em alguns instantes.',
        confidence: 0.1,
        intent: 'error'
      };
    }
  }

  private async generateOpenAIResponse(
    messages: OpenAIMessage[],
    personality: string,
    context?: string,
    tone: string = 'friendly'
  ): Promise<AIResponse> {
    try {
      if (!this.openai) {
        logger.warn('OpenAI não configurado. Retornando resposta padrão.');
        return {
          message: 'Desculpe, o serviço de IA não está configurado no momento. Entre em contato com o suporte.',
          confidence: 0.1,
          intent: 'general'
        };
      }

      const systemMessage: OpenAIMessage = {
        role: 'system',
        content: `Você é um assistente de atendimento especializado em vendas e suporte ao cliente.

${personality}

Instruções importantes:
- Seja sempre cordial e profissional
- Foque em resolver o problema do cliente
- Ofereça soluções práticas e relevantes
- Se não souber algo, seja honesto e sugira contato humano
- Mantenha o tom de voz consistente com a personalidade definida
- Use linguagem clara e acessível
- Evite jargões técnicos desnecessários

Tom: ${tone}
${context ? `Contexto adicional: ${context}` : ''}`
      };

      const completion = await this.openai.chat.completions.create({
        model: 'gpt-4',
        messages: [systemMessage, ...messages],
        max_tokens: 1000,
        temperature: 0.7,
      });

      const response = completion.choices[0]?.message?.content || 'Desculpe, não consegui processar sua mensagem.';

      return {
        message: response,
        confidence: 0.9,
        intent: this.extractIntent(messages[messages.length - 1]?.content || ''),
      };
    } catch (error: any) {
      logger.error('Erro no OpenAI', { error: error.message });
      return {
        message: 'Desculpe, estou com dificuldades técnicas no momento. Tente novamente em alguns instantes.',
        confidence: 0.1,
        intent: 'error'
      };
    }
  }

  private async generateOpenRouterResponse(
    messages: OpenAIMessage[],
    personality: string,
    config: AIServiceConfig
  ): Promise<AIResponse> {
    try {
      // Converter mensagens para formato OpenRouter
      const openRouterMessages = messages.map(msg => ({
        role: msg.role as 'system' | 'user' | 'assistant',
        content: msg.content
      }));

      // Criar serviço OpenRouter com API key específica se fornecida
      const openRouter = config.apiKey 
        ? new (await import('./openrouter')).OpenRouterService(config.apiKey)
        : openRouterService;

      const response = await openRouter.generateAssistantResponse(
        personality,
        messages[messages.length - 1]?.content || '',
        openRouterMessages.slice(0, -1), // Histórico sem a última mensagem
        config.model
      );

      return {
        message: response,
        confidence: 0.9,
        intent: this.extractIntent(messages[messages.length - 1]?.content || ''),
      };
    } catch (error: any) {
      logger.error('Erro no OpenRouter', { error: error.message });
      throw error;
    }
  }

  private extractIntent(message: string): string {
    const lowerMessage = message.toLowerCase();
    
    if (lowerMessage.includes('preço') || lowerMessage.includes('valor') || lowerMessage.includes('custo')) {
      return 'pricing';
    }
    if (lowerMessage.includes('ajuda') || lowerMessage.includes('suporte') || lowerMessage.includes('problema')) {
      return 'support';
    }
    if (lowerMessage.includes('comprar') || lowerMessage.includes('adquirir') || lowerMessage.includes('contratar')) {
      return 'purchase';
    }
    if (lowerMessage.includes('cancelar') || lowerMessage.includes('encerrar')) {
      return 'cancel';
    }
    if (lowerMessage.includes('informação') || lowerMessage.includes('detalhes') || lowerMessage.includes('sobre')) {
      return 'information';
    }
    
    return 'general';
  }

  async generateEmbedding(text: string): Promise<number[]> {
    try {
      if (!this.openai) {
        logger.warn('OpenAI não configurado. Retornando embedding vazio.');
        return new Array(1536).fill(0); // Embedding padrão
      }

      const response = await this.openai.embeddings.create({
        model: 'text-embedding-ada-002',
        input: text,
      });

      return response.data[0].embedding;
    } catch (error: any) {
      logger.error('Erro ao gerar embedding', { error: error.message });
      return new Array(1536).fill(0); // Embedding padrão em caso de erro
    }
  }

  // Método para validar configuração de um provedor
  async validateProvider(provider: AIProvider, apiKey?: string): Promise<boolean> {
    try {
      switch (provider) {
        case AIProvider.OPENAI:
          if (!this.openai) {
            logger.warn('OpenAI não configurado.');
            return false;
          }
          // Testar OpenAI
          const testResponse = await this.openai.chat.completions.create({
            model: 'gpt-3.5-turbo',
            messages: [{ role: 'user', content: 'Teste' }],
            max_tokens: 10
          });
          return (testResponse.choices[0]?.message?.content?.length || 0) > 0;

        case AIProvider.OPENROUTER:
        case AIProvider.ANTHROPIC:
          // Testar OpenRouter
          const openRouter = apiKey 
            ? new (await import('./openrouter')).OpenRouterService(apiKey)
            : openRouterService;
          return await openRouter.validateConfig();

        default:
          return false;
      }
    } catch (error: any) {
      logger.error('Erro na validação do provedor', { provider, error: error.message });
      return false;
    }
  }

  // Método para obter modelos disponíveis por provedor
  async getAvailableModels(provider: AIProvider): Promise<any[]> {
    try {
      switch (provider) {
        case AIProvider.OPENAI:
          // OpenAI tem modelos fixos
          return [
            { id: 'gpt-4', name: 'GPT-4' },
            { id: 'gpt-4-turbo', name: 'GPT-4 Turbo' },
            { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo' }
          ];

        case AIProvider.OPENROUTER:
        case AIProvider.ANTHROPIC:
          // Buscar modelos do OpenRouter
          const models = await openRouterService.getAvailableModels();
          return models || [];

        default:
          return [];
      }
    } catch (error: any) {
      logger.error('Erro ao buscar modelos', { provider, error: error.message });
      return [];
    }
  }

  // Método para obter informações de uso
  async getUsageInfo(provider: AIProvider, apiKey?: string): Promise<any> {
    try {
      switch (provider) {
        case AIProvider.OPENAI:
          // OpenAI não fornece endpoint de uso gratuito
          return { provider: 'OpenAI', status: 'active' };

        case AIProvider.OPENROUTER:
        case AIProvider.ANTHROPIC:
          const openRouter = apiKey 
            ? new (await import('./openrouter')).OpenRouterService(apiKey)
            : openRouterService;
          return await openRouter.getUsage();

        default:
          return null;
      }
    } catch (error: any) {
      logger.error('Erro ao buscar informações de uso', { provider, error: error.message });
      return null;
    }
  }
}

export default new AIService(); 