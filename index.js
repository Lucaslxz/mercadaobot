/**
 * Sistema de Bot para Vendas Automatizadas no Discord 3.0
 * Arquivo principal de inicialização
 */

require('dotenv').config();
const { Client, GatewayIntentBits, Collection, Events, InteractionType } = require('discord.js');
const { REST } = require('@discordjs/rest');
const { Routes } = require('discord-api-types/v9');
const { logger } = require('./src/utils/helpers');
const config = require('./src/config');
const db = require('./src/utils/db');
const cache = require('./src/utils/cache');
const userService = require('./src/user/profile');
const embeds = require('./src/bot/embeds');
const commandsManager = require('./src/commands');
const interactions = require('./src/bot/interactions');

// Inicialização do cliente Discord
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.DirectMessages,
  ]
});

async function main() {
  try {
    // Conectar ao banco de dados
    logger.info('Conectando ao banco de dados...');
    await db.connect();
    logger.info('Conexão com o banco de dados estabelecida');

    // Inicializar cache
    logger.info('Inicializando cache...');
    await cache.initCache();
    logger.info('Cache inicializado');

    // Inicializar e carregar comandos
    logger.info('Carregando comandos do bot...');
    const { userCount, adminCount } = commandsManager.initialize();
    logger.info(`Comandos carregados: ${userCount} usuário, ${adminCount} admin`);

    // Registrar comandos no cliente
    const registration = commandsManager.registerCommands(client);
    logger.info(`Comandos registrados no cliente: ${registration.userCount} usuário, ${registration.adminCount} admin`);

    // Registrar comandos slash na API do Discord
    logger.info('Registrando comandos slash na API do Discord...');
    const slashCommands = commandsManager.getAllSlashCommands();

    const rest = new REST({ version: '9' }).setToken(config.discord.token);
    await rest.put(
      Routes.applicationCommands(config.discord.clientId),
      { body: slashCommands }
    );
    logger.info(`${slashCommands.length} comandos slash registrados com sucesso`);

    // Configurar eventos

    // Evento: Bot pronto
    client.once(Events.ClientReady, () => {
      logger.info(`Bot está online como ${client.user.tag}`);

      // Definir status do bot
      client.user.setPresence({
        activities: [{ name: '/ajuda | Mercadão das Contas', type: 3 }],
        status: 'online'
      });
    });

    // Evento: Novo membro
    client.on(Events.GuildMemberAdd, async (member) => {
      try {
        // Criar perfil para o novo usuário
        await userService.createUserProfile({
          userId: member.id,
          username: member.user.tag,
          createdAt: new Date()
        });

        // Enviar mensagem de boas-vindas
        const welcomeEmbed = embeds.welcomeEmbed(member.user.username);

        try {
          await member.send({ embeds: [welcomeEmbed] });
        } catch (dmError) {
          logger.warn(`Não foi possível enviar DM para ${member.user.tag}: ${dmError.message}`);

          // Tentar enviar no canal de boas-vindas
          const welcomeChannel = member.guild.channels.cache.find(
            channel => channel.name === 'bem-vindo' || channel.name === 'welcome' || channel.name === 'geral'
          );

          if (welcomeChannel) {
            await welcomeChannel.send({
              content: `Bem-vindo, <@${member.id}>!`,
              embeds: [welcomeEmbed]
            });
          }
        }
      } catch (error) {
        logger.error(`Erro ao processar novo membro ${member.user.tag}:`, error);
      }
    });

    // Evento: Interações (comandos, botões, etc)
    client.on(Events.InteractionCreate, async (interaction) => {
      try {
        // Comandos slash
        if (interaction.isChatInputCommand()) {
          const command = client.commands.get(interaction.commandName) ||
                         client.adminCommands.get(interaction.commandName);

          if (!command) {
            logger.warn(`Comando não encontrado: ${interaction.commandName}`);
            return await interaction.reply({
              content: 'Comando não encontrado ou não está disponível.',
              ephemeral: true
            });
          }

          // Verificar permissões para comandos admin
          if (interaction.commandName.startsWith('admin_') &&
              !interaction.memberPermissions?.has('ADMINISTRATOR')) {
            return await interaction.reply({
              content: 'Você não tem permissão para executar este comando.',
              ephemeral: true
            });
          }

          await command.execute(interaction);
        }
        // Botões
        else if (interaction.isButton()) {
          await interactions.handleButtonInteraction(interaction);
        }
        // Menus de seleção
        else if (interaction.isStringSelectMenu()) {
          await interactions.handleSelectMenuInteraction(interaction);
        }
        // Modais
        else if (interaction.type === InteractionType.ModalSubmit) {
          await interactions.handleModalSubmitInteraction(interaction);
        }
      } catch (error) {
        logger.error(`Erro ao processar interação ${interaction.id}:`, error);

        try {
          if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({
              content: 'Ocorreu um erro ao processar esta interação.',
              ephemeral: true
            });
          } else {
            await interaction.followUp({
              content: 'Ocorreu um erro ao processar esta interação.',
              ephemeral: true
            });
          }
        } catch (replyError) {
          logger.error('Erro ao responder sobre erro de interação:', replyError);
        }
      }
    });

    // Iniciar o bot
    logger.info('Iniciando o bot Discord...');
    await client.login(config.discord.token);
    logger.info(`Bot iniciado com sucesso como ${client.user.tag}`);

    // Iniciar tarefas agendadas
    startScheduledTasks();

  } catch (error) {
    logger.error('Erro ao iniciar o sistema:', error);
    process.exit(1);
  }
}

/**
 * Inicia tarefas agendadas
 */
function startScheduledTasks() {
  try {
    // Sincronização de produtos do LZT Market
    const lztService = require('./src/product/lzt');
    const syncInterval = config.lzt.syncInterval || 900000; // 15 minutos

    // Executar sincronização inicial após 5 segundos
    setTimeout(async () => {
      try {
        logger.info('Executando sincronização inicial com LZT Market...');
        const result = await lztService.syncProducts();
        logger.info(`Sincronização inicial concluída: ${result.added} adicionados, ${result.updated} atualizados`);
      } catch (error) {
        logger.error('Erro na sincronização inicial:', error);
      }

      // Configurar sincronização periódica
      setInterval(async () => {
        try {
          logger.info('Executando sincronização periódica com LZT Market...');
          const result = await lztService.syncProducts();
          logger.info(`Sincronização periódica concluída: ${result.added} adicionados, ${result.updated} atualizados`);
        } catch (error) {
          logger.error('Erro na sincronização periódica:', error);
        }
      }, syncInterval);
    }, 5000);

    // Limpeza de logs antigos (diariamente à 1h)
    const auditLogger = require('./src/audit/logger');
    const cronJob = require('node-cron');

    cronJob.schedule('0 1 * * *', async () => {
      try {
        logger.info('Executando limpeza de logs antigos...');
        const result = await auditLogger.cleanupOldLogs();
        logger.info(`Limpeza de logs concluída: ${result.deletedCount} logs removidos`);
      } catch (error) {
        logger.error('Erro na limpeza de logs:', error);
      }
    });

    logger.info('Tarefas agendadas iniciadas com sucesso');
  } catch (error) {
    logger.error('Erro ao iniciar tarefas agendadas:', error);
  }
}

// Iniciar o sistema
main();

// Tratamento de erros não capturados
process.on('unhandledRejection', (error) => {
  logger.error('Erro não tratado:', error);
});

process.on('SIGINT', async () => {
  logger.info('Desligando o sistema...');
  await db.disconnect();
  process.exit(0);
});
