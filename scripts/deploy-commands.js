/**
 * Script para registrar comandos slash no Discord
 */

const { REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');
const config = require('./config');
const { logger } = require('./utils/helpers');

// Obter comandos do módulo commands
const commandsModule = require('./commands');

// Função principal
async function deployCommands() {
  try {
    logger.info('Iniciando registro de comandos...');

    const rest = new REST({ version: '10' }).setToken(config.discord.token);

    // Obter comandos de usuário
    const userCommands = commandsModule.getUserCommands();
    const userCommandsData = Array.from(userCommands.values()).map(cmd => cmd.data.toJSON());

    // Obter comandos de administração
    const adminCommands = commandsModule.getAdminCommands();
    const adminCommandsData = Array.from(adminCommands.values()).map(cmd => cmd.data.toJSON());

    // Todos os comandos
    const allCommands = [...userCommandsData, ...adminCommandsData];

    logger.info(`Registrando ${allCommands.length} comandos slash...`);

    // Registrar comandos globalmente
    const data = await rest.put(
      Routes.applicationCommands(config.discord.clientId),
      { body: allCommands },
    );

    logger.info(`${data.length} comandos registrados com sucesso!`);
  } catch (error) {
    logger.error('Erro ao registrar comandos:', error);
  }
}

// Função para registrar comandos em um servidor específico (para testes)
async function deployCommandsToGuild(guildId) {
  try {
    logger.info(`Iniciando registro de comandos no servidor ${guildId}...`);

    const rest = new REST({ version: '10' }).setToken(config.discord.token);

    // Obter comandos de usuário
    const userCommands = commandsModule.getUserCommands();
    const userCommandsData = Array.from(userCommands.values()).map(cmd => cmd.data.toJSON());

    // Obter comandos de administração
    const adminCommands = commandsModule.getAdminCommands();
    const adminCommandsData = Array.from(adminCommands.values()).map(cmd => cmd.data.toJSON());

    // Todos os comandos
    const allCommands = [...userCommandsData, ...adminCommandsData];

    logger.info(`Registrando ${allCommands.length} comandos slash no servidor...`);

    // Registrar comandos apenas no servidor especificado (mais rápido para testes)
    const data = await rest.put(
      Routes.applicationGuildCommands(config.discord.clientId, guildId),
      { body: allCommands },
    );

    logger.info(`${data.length} comandos registrados com sucesso no servidor!`);
  } catch (error) {
    logger.error(`Erro ao registrar comandos no servidor ${guildId}:`, error);
  }
}

// Executar o script
if (require.main === module) {
  // Verificar argumentos
  const args = process.argv.slice(2);

  if (args.includes('--guild') || args.includes('-g')) {
    // Índice do argumento com o ID do servidor
    const index = args.indexOf('--guild') !== -1
      ? args.indexOf('--guild')
      : args.indexOf('-g');

    // Obter ID do servidor
    const guildId = args[index + 1];

    if (!guildId) {
      logger.error('ID do servidor não fornecido. Use: node deploy-commands.js --guild ID_DO_SERVIDOR');
      process.exit(1);
    }

    // Registrar comandos no servidor específico
    deployCommandsToGuild(guildId);
  } else {
    // Registrar comandos globalmente
    deployCommands();
  }
}

module.exports = {
  deployCommands,
  deployCommandsToGuild
};
