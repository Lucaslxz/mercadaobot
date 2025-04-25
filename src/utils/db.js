/**
 * Utilitário para conexão e operações com o banco de dados MongoDB
 */
const mongoose = require('mongoose');
const config = require('../config');
const { logger } = require('./helpers');

let isConnected = false;
let retryCount = 0;
const MAX_RETRIES = 5;

/**
 * Estabelece conexão com o banco de dados MongoDB
 * @returns {Promise<mongoose.Connection>} - Conexão com o banco de dados
 */
async function connect() {
  try {
    if (isConnected) {
      logger.debug('Usando conexão existente com o banco de dados');
      return mongoose.connection;
    }

    logger.info('Estabelecendo conexão com o banco de dados...');

    // Configurar eventos de conexão
    mongoose.connection.on('connected', () => {
      isConnected = true;
      retryCount = 0;
      logger.info('Conexão com o banco de dados MongoDB estabelecida com sucesso');
    });

    mongoose.connection.on('error', (error) => {
      logger.error('Erro na conexão com o MongoDB:', error);
      isConnected = false;
    });

    mongoose.connection.on('disconnected', () => {
      logger.warn('Conexão com o MongoDB perdida');
      isConnected = false;

      // Tentar reconectar se não for um desligamento intencional
      if (retryCount < MAX_RETRIES) {
        retryCount++;
        logger.info(`Tentando reconexão automática (${retryCount}/${MAX_RETRIES})...`);
        setTimeout(() => {
          connect().catch(err => logger.error('Falha na reconexão automática:', err));
        }, 5000 * retryCount); // Backoff exponencial
      }
    });

    // Conectar ao MongoDB
    await mongoose.connect(config.database.uri, {
      ...config.database.options,
      serverSelectionTimeoutMS: 10000, // 10 segundos para selecionar servidor
      heartbeatFrequencyMS: 30000, // 30 segundos entre heartbeats
      socketTimeoutMS: 45000, // 45 segundos para timeout de socket
    });

    isConnected = true;
    return mongoose.connection;
  } catch (error) {
    logger.error('Falha ao conectar ao banco de dados:', error);
    throw error;
  }
}

/**
 * Fecha a conexão com o banco de dados
 * @returns {Promise<void>}
 */
async function disconnect() {
  try {
    if (!isConnected) {
      logger.debug('Nenhuma conexão ativa para fechar');
      return;
    }

    logger.info('Fechando conexão com o banco de dados...');
    await mongoose.connection.close();
    isConnected = false;
    logger.info('Conexão com o banco de dados encerrada com sucesso');
  } catch (error) {
    logger.error('Erro ao fechar conexão com o banco de dados:', error);
    throw error;
  }
}

/**
 * Executa uma operação com o banco de dados com retry automático em caso de falha
 * @param {Function} operation - Função a ser executada
 * @param {number} maxRetries - Número máximo de tentativas
 * @param {number} delay - Atraso inicial entre tentativas (ms)
 * @returns {Promise<any>} - Resultado da operação
 */
async function executeWithRetry(operation, maxRetries = 3, delay = 1000) {
  let lastError;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // Garantir que estamos conectados
      if (!isConnected) {
        await connect();
      }

      // Executar operação
      return await operation();
    } catch (error) {
      lastError = error;
      logger.warn(`Tentativa ${attempt}/${maxRetries} falhou:`, error.message);

      // Se for a última tentativa, não esperar
      if (attempt === maxRetries) break;

      // Calcular atraso com backoff exponencial
      const backoff = delay * Math.pow(2, attempt - 1);
      const jitter = Math.floor(Math.random() * 500); // 0-500ms de jitter
      const waitTime = backoff + jitter;

      logger.debug(`Aguardando ${waitTime}ms antes da próxima tentativa...`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
  }

  // Se chegamos aqui, todas as tentativas falharam
  logger.error(`Todas as ${maxRetries} tentativas falharam. Última erro:`, lastError);
  throw lastError;
}

/**
 * Verifica o status atual da conexão com o banco de dados
 * @returns {Object} - Status da conexão
 */
function getStatus() {
  return {
    isConnected,
    readyState: mongoose.connection.readyState,
    // 0 = desconectado, 1 = conectado, 2 = conectando, 3 = desconectando
    models: Object.keys(mongoose.models),
    retryCount
  };
}

module.exports = {
  connect,
  disconnect,
  executeWithRetry,
  isConnected: () => isConnected,
  getStatus,
  connection: mongoose.connection
};
