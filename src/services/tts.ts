import axios from 'axios';
import { TTSResponse } from '../types';
import logger from '../utils/logger';

export class TTSService {
  private elevenLabsApiKey: string;

  constructor() {
    this.elevenLabsApiKey = process.env.ELEVENLABS_API_KEY || '';
  }

  async generateSpeech(text: string, voiceId: string = 'default'): Promise<TTSResponse> {
    try {
      if (!this.elevenLabsApiKey) {
        throw new Error('ElevenLabs API key não configurada');
      }

      const response = await axios.post(
        `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
        {
          text,
          model_id: 'eleven_monolingual_v1',
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.5,
          },
        },
        {
          headers: {
            'Accept': 'audio/mpeg',
            'Content-Type': 'application/json',
            'xi-api-key': this.elevenLabsApiKey,
          },
          responseType: 'arraybuffer',
        }
      );

      // In a real implementation, you would save the audio file and return the URL
      const audioBuffer = Buffer.from(response.data);
      const audioUrl = `data:audio/mpeg;base64,${audioBuffer.toString('base64')}`;

      return {
        audioUrl,
        duration: Math.ceil(text.length / 10), // Rough estimation
      };
    } catch (error: any) {
      logger.error('Erro no TTS Service', { error: error.message });
      throw error;
    }
  }

  async getAvailableVoices(): Promise<any[]> {
    try {
      const response = await axios.get('https://api.elevenlabs.io/v1/voices', {
        headers: {
          'xi-api-key': this.elevenLabsApiKey,
        },
      });

      return response.data.voices;
    } catch (error: any) {
      logger.error('Erro ao buscar vozes disponíveis', { error: error.message });
      return [];
    }
  }
}

export default new TTSService();