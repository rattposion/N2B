const OpenAI = require('openai')
const { logger } = require('../utils/logger')

let openai = null

const initializeAI = () => {
  try {
    if (process.env.OPENAI_API_KEY) {
      openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY
      })
      logger.info('OpenAI initialized successfully')
    } else {
      logger.warn('OpenAI API key not found')
    }
  } catch (error) {
    logger.error('OpenAI initialization error:', error)
  }
}

const generateResponse = async (prompt, context = '') => {
  try {
    if (!openai) {
      throw new Error('OpenAI not initialized')
    }

    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4',
      messages: [
        {
          role: 'system',
          content: `Você é um atendente de IA profissional e amigável. 
          Responda de forma clara, concisa e útil. 
          Contexto: ${context}`
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      max_tokens: 500,
      temperature: 0.7
    })

    return completion.choices[0].message.content
  } catch (error) {
    logger.error('AI response generation error:', error)
    throw error
  }
}

module.exports = {
  initializeAI,
  generateResponse
} 