import OpenAI from 'openai';
import { OpenAIMessage, AIResponse } from '../types';
import logger from '../utils/logger';

// Criar instância OpenAI apenas se a chave estiver disponível
let openai: OpenAI | null = null;

if (process.env.OPENAI_API_KEY) {
  openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });
} else {
  logger.warn('OPENAI_API_KEY não configurada. Serviços de IA estarão limitados.');
}

export class OpenAIService {
  async generateResponse(
    messages: OpenAIMessage[],
    context?: string,
    tone: string = 'friendly'
  ): Promise<AIResponse> {
    try {
      if (!openai) {
        logger.warn('OpenAI não configurado. Retornando resposta padrão.');
        return {
          message: 'Desculpe, o serviço de IA não está configurado no momento. Entre em contato com o suporte.',
          confidence: 0.1,
          intent: 'general'
        };
      }

      const systemMessage: OpenAIMessage = {
        role: 'system',
        content: `Você é um assistente virtual inteligente e prestativo. 
        Tom: ${tone}. 
        ${context ? `Contexto adicional: ${context}` : ''}
        Responda de forma clara, objetiva e útil. Mantenha as respostas concisas mas informativas.`
      };

      const completion = await openai.chat.completions.create({
        model: 'gpt-4',
        messages: [systemMessage, ...messages],
        max_tokens: 500,
        temperature: 0.7,
      });

      const response = completion.choices[0]?.message?.content || 'Desculpe, não consegui processar sua mensagem.';

      return {
        message: response,
        confidence: 0.9, // Placeholder - could implement confidence scoring
        intent: this.extractIntent(messages[messages.length - 1]?.content || ''),
      };
    } catch (error: any) {
      logger.error('Erro no OpenAI Service', { error: error.message });
      return {
        message: 'Desculpe, estou com dificuldades técnicas no momento. Tente novamente em alguns instantes.',
        confidence: 0.1,
        intent: 'general'
      };
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
    
    return 'general';
  }

  async generateEmbedding(text: string): Promise<number[]> {
    try {
      if (!openai) {
        logger.warn('OpenAI não configurado. Retornando embedding vazio.');
        return new Array(1536).fill(0); // Embedding padrão
      }

      const response = await openai.embeddings.create({
        model: 'text-embedding-ada-002',
        input: text,
      });

      return response.data[0].embedding;
    } catch (error: any) {
      logger.error('Erro ao gerar embedding', { error: error.message });
      return new Array(1536).fill(0); // Embedding padrão em caso de erro
    }
  }
}

export default new OpenAIService();