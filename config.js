/**
 * Configurações centralizadas do sistema
 */

require('dotenv').config();

module.exports = {
  // Configurações do Discord
  discord: {
    token: process.env.DISCORD_TOKEN,
    clientId: process.env.DISCORD_CLIENT_ID,
    prefix: process.env.DISCORD_PREFIX || '!',
    adminRoles: ['Admin', 'Moderador'],
    adminUsers: [], // IDs de usuários com permissões administrativas
    channels: {
      sales: 'vendas',
      announcements: 'anuncios',
      support: 'suporte'
    },
    embedColors: {
      primary: '#4F46E5',
      success: '#10B981',
      error: '#EF4444',
      warning: '#F59E0B'
    }
  },

  // Configurações do banco de dados
  database: {
    uri: process.env.DB_URI,
    options: {
      useNewUrlParser: true,
      useUnifiedTopology: true
    }
  },

  // Configurações do Redis
  redis: {
    uri: process.env.REDIS_URI,
    ttl: {
      products: 300, // 5 minutos
      user: 1800, // 30 minutos
      session: 3600 // 1 hora
    }
  },

  // Configurações do LZT Market
  lzt: {
    apiKey: process.env.LZT_API_KEY,
    apiSecret: process.env.LZT_API_SECRET,
    baseUrl: 'https://api.lzt.market/v1',
    syncInterval: 900000, // 15 minutos em milissegundos
  },

  // Configurações de pagamento
  payment: {
    pix: {
      keyType: 'random', // tipo de chave PIX (email, cpf, telefone, random)
      keyValue: 'chave-pix-aqui',
      provider: '99pay', // provedor de pagamento
      manualApproval: true, // requer aprovação manual de administradores
      blockedBanks: ['Inter', 'PicPay'] // bancos bloqueados por histórico de fraudes
    },
    expiration: 1800 // tempo de expiração do pagamento em segundos (30 minutos)
  },

  // Configurações do sistema de auditoria
  audit: {
    logLevels: ['info', 'warning', 'error', 'critical'],
    retentionPeriod: {
      critical: 157680000, // 5 anos em segundos
      error: 63072000, // 2 anos em segundos
      warning: 31536000, // 1 ano em segundos
      info: 15768000 // 6 meses em segundos
    }
  },

  // Configurações do sistema de marketing
  marketing: {
    promotionTypes: ['flash', 'season', 'combo', 'limited'],
    discountLimits: {
      max: 50, // desconto máximo permitido (%)
      min: 5 // desconto mínimo permitido (%)
    },
    loyaltyPoints: {
      conversionRate: 0.01, // 1 ponto = R$ 0,01 de desconto
      expirationDays: 90 // pontos expiram após 90 dias
    }
  },

  // Configurações da interface web
  web: {
    adminPort: 3000,
    clientPort: 3001,
    sessionSecret: 'sua-chave-secreta-aqui',
    jwtSecret: 'sua-jwt-secreta-aqui',
    jwtExpiration: '24h'
  }
};
