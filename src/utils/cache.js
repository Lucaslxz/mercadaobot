// Estrutura correta para o cache
const Redis = require('redis');
const config = require('../config');
const { logger } = require('./helpers');

let redisClient = null;
let usingMockCache = false;

/**
 * Inicializa o cliente Redis
 * @returns {Promise} - Promessa da inicialização
 */
async function initCache() {
  try {
    // Se já existe cliente e está pronto, retorna
    if (redisClient && redisClient.isReady) {
      return redisClient;
    }

    // Verificar se devemos usar cache mock
    if (process.env.USE_MOCK_CACHE === 'true') {
      logger.info('Usando mock cache para desenvolvimento');
      usingMockCache = true;
      return require('./mockCache').initCache();
    }

    // Criar novo cliente Redis
    redisClient = Redis.createClient({
      url: config.redis.uri
    });

    // Configurar eventos
    redisClient.on('error', (error) => {
      logger.error('Erro no Redis:', error);
    });

    redisClient.on('connect', () => {
      logger.info('Conexão com Redis estabelecida');
    });

    // Conectar cliente
    await redisClient.connect();
    return redisClient;
  } catch (error) {
    logger.error('Erro ao inicializar cache Redis:', error);
    // Fallback para mock
    logger.info('Usando mock cache como fallback');
    usingMockCache = true;
    return require('./mockCache').initCache();
  }
}

// Funções públicas com tratamento unificado
async function get(key) {
  try {
    if (!redisClient || !redisClient.isReady) {
      if (usingMockCache) {
        return await require('./mockCache').get(key);
      }
      await initCache();
    }
    const data = await redisClient.get(key);
    return data ? JSON.parse(data) : null;
  } catch (error) {
    logger.error(`Erro ao obter valor do cache para chave ${key}:`, error);
    return null;
  }
}

async function set(key, value, ttl = 3600) {
  try {
    if (!redisClient || !redisClient.isReady) {
      if (usingMockCache) {
        return await require('./mockCache').set(key, value, ttl);
      }
      await initCache();
    }
    const stringValue = JSON.stringify(value);

    if (ttl > 0) {
      await redisClient.setEx(key, ttl, stringValue);
    } else {
      await redisClient.set(key, stringValue);
    }
    return true;
  } catch (error) {
    logger.error(`Erro ao armazenar valor no cache para chave ${key}:`, error);
    return false;
  }
}

async function del(key) {
  try {
    if (!redisClient || !redisClient.isReady) {
      if (usingMockCache) {
        return await require('./mockCache').del(key);
      }
      await initCache();
    }
    await redisClient.del(key);
    return true;
  } catch (error) {
    logger.error(`Erro ao remover valor do cache para chave ${key}:`, error);
    return false;
  }
}

async function clear() {
  try {
    if (!redisClient || !redisClient.isReady) {
      if (usingMockCache) {
        return await require('./mockCache').clear();
      }
      await initCache();
    }
    await redisClient.flushAll();
    logger.info('Cache limpo com sucesso');
    return true;
  } catch (error) {
    logger.error('Erro ao limpar cache:', error);
    return false;
  }
}

async function keys(pattern) {
  try {
    if (!redisClient || !redisClient.isReady) {
      if (usingMockCache) {
        return await require('./mockCache').keys(pattern);
      }
      await initCache();
    }
    return await redisClient.keys(pattern);
  } catch (error) {
    logger.error(`Erro ao obter chaves com padrão ${pattern}:`, error);
    return [];
  }
}

module.exports = {
  initCache,
  get,
  set,
  del,
  clear,
  keys,
  client: () => redisClient
};
