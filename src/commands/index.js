/**
 * Gerenciamento centralizado de comandos
 */
const fs = require('fs');
const path = require('path');
const { Collection } = require('discord.js');
const { SlashCommandBuilder } = require('@discordjs/builders');
const { logger } = require('../utils/helpers');

// Coleções para comandos
const userCommands = new Collection();
const adminCommands = new Collection();

/**
 * Carrega todos os comandos de um diretório
 * @param {string} dirPath - Caminho do diretório
 * @param {boolean} isAdmin - Se são comandos de administrador
 * @returns {number} - Quantidade de comandos carregados
 */
function loadCommandsFromDirectory(dirPath, isAdmin = false) {
  let count = 0;

  if (!fs.existsSync(dirPath)) {
    logger.warn(`Diretório de comandos não encontrado: ${dirPath}`);
    return count;
  }

  const commandFiles = fs.readdirSync(dirPath)
    .filter(file => file.endsWith('.js'));

  for (const file of commandFiles) {
    try {
      const filePath = path.join(dirPath, file);
      const command = require(filePath);

      // Verificar se possui os métodos necessários
      if (!command.data || !command.execute) {
        logger.warn(`Comando inválido em ${filePath}: falta data ou execute`);
        continue;
      }

      // Modificar comando de administrador
      if (isAdmin && !command.data.default_member_permissions) {
        command.data.setDefaultMemberPermissions(0);
      }

      // Adicionar à coleção correta
      if (isAdmin) {
        adminCommands.set(command.data.name, command);
      } else {
        userCommands.set(command.data.name, command);
      }

      logger.info(`Comando ${isAdmin ? 'admin' : 'user'} carregado: ${command.data.name}`);
      count++;
    } catch (error) {
      logger.error(`Erro ao carregar comando ${file}:`, error);
    }
  }

  return count;
}

/**
 * Inicializa e carrega todos os comandos do sistema
 */
function initialize() {
  // Limpar coleções
  userCommands.clear();
  adminCommands.clear();

  // Carregar comandos de usuário
  const userCommandsPath = path.join(__dirname, 'user');
  const userCount = loadCommandsFromDirectory(userCommandsPath, false);

  // Carregar comandos de administrador
  const adminCommandsPath = path.join(__dirname, 'admin');
  const adminCount = loadCommandsFromDirectory(adminCommandsPath, true);

  logger.info(`Comandos carregados: ${userCount} usuário, ${adminCount} admin`);
  return { userCount, adminCount };
}

// Exportar funções e coleções
module.exports = {
  initialize,
  getUserCommands: () => userCommands,
  getAdminCommands: () => adminCommands,

  // Registrar comandos no cliente Discord
  registerCommands: (client) => {
    if (!client.commands) client.commands = new Collection();
    if (!client.adminCommands) client.adminCommands = new Collection();

    userCommands.forEach((cmd, name) => client.commands.set(name, cmd));
    adminCommands.forEach((cmd, name) => client.adminCommands.set(name, cmd));

    return {
      userCount: userCommands.size,
      adminCount: adminCommands.size
    };
  },

  // Obter todos os comandos para registro na API
  getAllSlashCommands: () => {
    const commands = [];

    userCommands.forEach(cmd => {
      if (cmd.data) commands.push(cmd.data.toJSON());
    });

    adminCommands.forEach(cmd => {
      if (cmd.data) commands.push(cmd.data.toJSON());
    });

    return commands;
  }
};
