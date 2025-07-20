-- Adicionar campos para múltiplos provedores de IA
ALTER TABLE ai_assistants 
ADD COLUMN provider TEXT DEFAULT 'OPENAI',
ADD COLUMN model TEXT DEFAULT 'gpt-3.5-turbo',
ADD COLUMN api_key TEXT;

-- Criar enum AIProvider
CREATE TYPE "AIProvider" AS ENUM ('OPENAI', 'OPENROUTER', 'ANTHROPIC', 'GOOGLE', 'AZURE');

-- Atualizar coluna provider para usar o enum
ALTER TABLE ai_assistants 
ALTER COLUMN provider TYPE "AIProvider" USING provider::"AIProvider"; 