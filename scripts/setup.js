// scripts/setup.js
/**
 * Script de inicialização do sistema
 * Configura a estrutura inicial do banco de dados e recursos necessários
 */
require('dotenv').config();
const mongoose = require('mongoose');
const { logger } = require('../src/utils/helpers');
const config = require('../src/config');

// Modelos
const User = require('../src/models/user');
const Product = require('../src/models/product');
const Payment = require('../src/models/payment');
const AuditLog = require('../src/models/audit');
const Promotion = require('../src/models/promotion');
const Loyalty = require('../src/models/loyalty');

async function setup() {
  try {
    logger.info('Iniciando configuração do sistema...');

    // Conectar ao banco de dados
    logger.info('Conectando ao banco de dados...');
    await mongoose.connect(config.database.uri, config.database.options);
    logger.info('Conexão com o banco de dados estabelecida');

    // Criar índices nos modelos
    logger.info('Criando índices no banco de dados...');
    await User.createIndexes();
    await Product.createIndexes();
    await Payment.createIndexes();
    await AuditLog.createIndexes();
    await Promotion.createIndexes();
    await Loyalty.createIndexes();
    logger.info('Índices criados com sucesso');

    // Criar usuário admin inicial se não existir
    const adminExists = await User.findOne({ username: 'admin' });

    if (!adminExists) {
      logger.info('Criando usuário administrador inicial...');

      const adminUser = new User({
        userId: 'admin',
        username: 'admin',
        isAdmin: true,
        createdAt: new Date()
      });

      await adminUser.save();
      logger.info('Usuário administrador criado com sucesso');
    }

    // Verificar se há produtos
    const productCount = await Product.countDocuments();

    if (productCount === 0) {
      logger.info('Criando produtos de exemplo...');

      // Criar alguns produtos de exemplo
      const exampleProducts = [
        {
          nome: 'Conta Valorant - Bronze',
          tipo: 'valorant',
          preco: 35.90,
          descricao: 'Conta Valorant Rank Bronze com 10 skins básicas. Acesso completo e email alterável.',
          detalhes: {
            rank: 'Bronze',
            skins: 10,
            region: 'BR',
            level: 25,
            verification: true
          },
          disponivel: true,
          dataCriacao: new Date(),
          origem: 'MANUAL'
        },
        {
          nome: 'Conta Valorant - Prata',
          tipo: 'valorant',
          preco: 59.90,
          descricao: 'Conta Valorant Rank Prata com 15 skins. Acesso completo e email alterável.',
          detalhes: {
            rank: 'Prata',
            skins: 15,
            region: 'BR',
            level: 40,
            verification: true
          },
          disponivel: true,
          dataCriacao: new Date(),
          origem: 'MANUAL'
        },
        {
          nome: 'Conta Valorant - Ouro',
          tipo: 'valorant',
          preco: 89.90,
          descricao: 'Conta Valorant Rank Ouro com 25 skins. Acesso completo e email alterável.',
          detalhes: {
            rank: 'Ouro',
            skins: 25,
            region: 'BR',
            level: 65,
            verification: true
          },
          disponivel: true,
          dataCriacao: new Date(),
          origem: 'MANUAL'
        }
      ];

      await Product.insertMany(exampleProducts);
      logger.info(`${exampleProducts.length} produtos de exemplo criados com sucesso`);
    }

    // Criar promoção de exemplo se não existir
    const promoExists = await Promotion.countDocuments();

    if (promoExists === 0) {
      logger.info('Criando promoção de exemplo...');

      const now = new Date();
      const nextWeek = new Date(now.getTime() + (7 * 24 * 60 * 60 * 1000));

      const examplePromo = new Promotion({
        titulo: 'Promoção de Boas-Vindas',
        descricao: 'Desconto especial para novos usuários! Aproveite 10% OFF em qualquer produto.',
        tipo: 'season',
        desconto: 10,
        dataInicio: now,
        dataFim: nextWeek,
        duracao: 168, // 7 dias em horas
        ativa: true,
        criadoPor: 'admin'
      });

      await examplePromo.save();
      logger.info('Promoção de exemplo criada com sucesso');
    }

    logger.info('Configuração do sistema concluída com sucesso!');

    // Encerrar conexão
    await mongoose.connection.close();

    return { success: true };
  } catch (error) {
    logger.error('Erro durante a configuração inicial:', error);

    // Tentar fechar conexão
    try {
      await mongoose.connection.close();
    } catch (closeError) {
      // Ignorar erro de fechamento
    }

    return {
      success: false,
      error: error.message
    };
  }
}

// Executar se chamado diretamente
if (require.main === module) {
  setup()
    .then(result => {
      if (result.success) {
        console.log('✅ Configuração concluída com sucesso!');
      } else {
        console.error('❌ Erro na configuração:', result.error);
        process.exit(1);
      }

      process.exit(0);
    })
    .catch(error => {
      console.error('❌ Erro fatal:', error);
      process.exit(1);
    });
}

module.exports = setup;

// scripts/deploy-commands.js
/**
 * Script para registrar os comandos slash no Discord
 */
require('dotenv').config();
const { REST } = require('@discordjs/rest');
const { Routes } = require('discord-api-types/v9');
const fs = require('fs');
const path = require('path');
const { logger } = require('../src/utils/helpers');
const config = require('../src/config');

// Obter comandos
const commands = [];
const commandsPath = path.join(__dirname, '../src/bot/commands');

function loadCommands(dir, isAdmin = false) {
  const commandFiles = fs.readdirSync(dir).filter(file => file.endsWith('.js'));

  for (const file of commandFiles) {
    const command = require(path.join(dir, file));

    if (command.data) {
      if (isAdmin) {
        // Marcar como comando administrativo
        command.data.setDefaultMemberPermissions(0); // Requer permissão de administrador
      }

      commands.push(command.data.toJSON());
      logger.info(`Comando carregado: ${command.data.name} ${isAdmin ? '(Admin)' : ''}`);
    } else {
      logger.warn(`Comando inválido encontrado: ${file}`);
    }
  }
}

// Carregar comandos regulares
if (fs.existsSync(path.join(commandsPath, 'user'))) {
  loadCommands(path.join(commandsPath, 'user'), false);
}

// Carregar comandos de administrador
if (fs.existsSync(path.join(commandsPath, 'admin'))) {
  loadCommands(path.join(commandsPath, 'admin'), true);
}

async function deployCommands() {
  try {
    logger.info(`Iniciando deploy de ${commands.length} comandos...`);

    const rest = new REST({ version: '9' }).setToken(config.discord.token);

    // Registrar comandos globalmente
    logger.info('Registrando comandos globalmente...');
    await rest.put(
      Routes.applicationCommands(config.discord.clientId),
      { body: commands }
    );

    logger.info('Comandos registrados com sucesso!');
    return { success: true, commandCount: commands.length };
  } catch (error) {
    logger.error('Erro ao registrar comandos:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

// Executar se chamado diretamente
if (require.main === module) {
  deployCommands()
    .then(result => {
      if (result.success) {
        console.log(`✅ ${result.commandCount} comandos registrados com sucesso!`);
      } else {
        console.error('❌ Erro ao registrar comandos:', result.error);
        process.exit(1);
      }

      process.exit(0);
    })
    .catch(error => {
      console.error('❌ Erro fatal:', error);
      process.exit(1);
    });
}

module.exports = deployCommands;

// scripts/cron.js
/**
 * Script para executar tarefas agendadas
 */
require('dotenv').config();
const cron = require('node-cron');
const mongoose = require('mongoose');
const { logger } = require('../src/utils/helpers');
const config = require('../src/config');
const lztService = require('../src/product/lzt');
const auditLogger = require('../src/audit/logger');

/**
 * Inicializa tarefas agendadas
 */
async function initCronJobs() {
  try {
    // Conectar ao banco de dados
    logger.info('Conectando ao banco de dados para tarefas agendadas...');
    await mongoose.connect(config.database.uri, config.database.options);
    logger.info('Conexão com o banco de dados estabelecida');

    // Sincronização LZT Market (a cada 15 minutos)
    cron.schedule('*/15 * * * *', async () => {
      logger.info('Executando sincronização LZT Market (agendada)...');
      try {
        const result = await lztService.syncProducts();
        logger.info(`Sincronização LZT concluída: ${result.added} adicionados, ${result.updated} atualizados`);
      } catch (error) {
        logger.error('Erro durante sincronização LZT:', error);
      }
    });

    // Limpeza de logs antigos (diariamente às 4h)
    cron.schedule('0 4 * * *', async () => {
      logger.info('Executando limpeza de logs antigos...');
      try {
        const result = await auditLogger.cleanupOldLogs();
        logger.info(`Limpeza de logs concluída: ${result.deletedCount} logs removidos`);
      } catch (error) {
        logger.error('Erro durante limpeza de logs:', error);
      }
    });

    // Verificação de pagamentos expirados (a cada hora)
    cron.schedule('0 * * * *', async () => {
      logger.info('Verificando pagamentos expirados...');
      try {
        const Payment = require('../src/models/payment');

        // Buscar pagamentos pendentes expirados
        const now = new Date();
        const expiredPayments = await Payment.find({
          status: 'PENDING',
          expiresAt: { $lt: now }
        });

        logger.info(`${expiredPayments.length} pagamentos expirados encontrados`);

        // Atualizar status para expirado
        for (const payment of expiredPayments) {
          payment.status = 'EXPIRED';
          await payment.save();

          logger.debug(`Pagamento ${payment._id} marcado como expirado`);
        }
      } catch (error) {
        logger.error('Erro ao processar pagamentos expirados:', error);
      }
    });

    logger.info('Tarefas agendadas inicializadas com sucesso');
    return true;
  } catch (error) {
    logger.error('Erro ao inicializar tarefas agendadas:', error);
    throw error;
  }
}

// Executar se chamado diretamente
if (require.main === module) {
  initCronJobs()
    .then(() => {
      console.log('✅ Tarefas agendadas inicializadas. Pressione Ctrl+C para encerrar.');
    })
    .catch(error => {
      console.error('❌ Erro fatal ao inicializar tarefas agendadas:', error);
      process.exit(1);
    });
}

module.exports = initCronJobs;
