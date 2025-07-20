const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🚀 Configurando ambiente WhatsApp...');

// Criar diretório de sessões se não existir
const sessionsDir = path.join(__dirname, '..', 'sessions');
if (!fs.existsSync(sessionsDir)) {
  fs.mkdirSync(sessionsDir, { recursive: true });
  console.log('✅ Diretório de sessões criado');
}

// Executar migração do banco
try {
  console.log('📊 Executando migração do banco de dados...');
  execSync('npx prisma migrate dev --name add_whatsapp_sessions', { 
    stdio: 'inherit',
    cwd: path.join(__dirname, '..')
  });
  console.log('✅ Migração executada com sucesso');
} catch (error) {
  console.error('❌ Erro na migração:', error.message);
}

// Gerar cliente Prisma
try {
  console.log('🔧 Gerando cliente Prisma...');
  execSync('npx prisma generate', { 
    stdio: 'inherit',
    cwd: path.join(__dirname, '..')
  });
  console.log('✅ Cliente Prisma gerado');
} catch (error) {
  console.error('❌ Erro ao gerar cliente Prisma:', error.message);
}

console.log('🎉 Configuração concluída!');
console.log('📱 Sistema WhatsApp pronto para uso'); 