// src/product/lzt.js
const axios = require('axios');
const crypto = require('crypto');
const config = require('../config');
const Product = require('../models/product');
const { logger } = require('../utils/helpers');
const auditLogger = require('../audit/logger');

// Cliente para API do LZT Market
class LZTMarketClient {
  constructor() {
    this.apiKey = config.lzt.apiKey;
    this.apiSecret = config.lzt.apiSecret;
    this.baseUrl = config.lzt.baseUrl;
    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: 30000 // 30 segundos
    });
  }

  /**
   * Assina a requisição com as credenciais da API
   * @private
   */
  _signRequest(method, endpoint, data = {}, timestamp = Date.now()) {
    // Formato: METHOD|endpoint|timestamp|payload
    const payload = `${method.toUpperCase()}|${endpoint}|${timestamp}|${JSON.stringify(data)}`;

    // Gerar assinatura usando o secret
    const signature = crypto
      .createHmac('sha256', this.apiSecret)
      .update(payload)
      .digest('hex');

    return {
      'X-API-KEY': this.apiKey,
      'X-API-SIGNATURE': signature,
      'X-API-TIMESTAMP': timestamp
    };
  }

  /**
   * Faz uma requisição para a API
   * @param {string} method - Método HTTP
   * @param {string} endpoint - Endpoint da API
   * @param {Object} data - Dados da requisição
   * @returns {Promise<Object>} - Resposta da API
   */
  async request(method, endpoint, data = {}) {
    try {
      const timestamp = Date.now();
      const headers = this._signRequest(method, endpoint, data, timestamp);

      const response = await this.client({
        method,
        url: endpoint,
        data: method !== 'get' ? data : undefined,
        params: method === 'get' ? data : undefined,
        headers
      });

      return response.data;
    } catch (error) {
      logger.error(`Erro na requisição LZT: ${method.toUpperCase()} ${endpoint}`, error);
      throw error;
    }
  }

  /**
   * Busca produtos disponíveis
   * @param {Object} filters - Filtros para busca
   * @returns {Promise<Array>} - Lista de produtos
   */
  async getProducts(filters = {}) {
    return await this.request('get', '/products', filters);
  }

  /**
   * Busca detalhes de um produto
   * @param {string} productId - ID do produto no LZT Market
   * @returns {Promise<Object>} - Detalhes do produto
   */
  async getProductDetails(productId) {
    return await this.request('get', `/products/${productId}`);
  }

  /**
   * Reserva um produto para compra
   * @param {string} productId - ID do produto no LZT Market
   * @returns {Promise<Object>} - Dados da reserva
   */
  async reserveProduct(productId) {
    return await this.request('post', `/products/${productId}/reserve`, {});
  }

  /**
   * Finaliza a compra de um produto reservado
   * @param {string} reservationId - ID da reserva
   * @param {Object} paymentData - Dados do pagamento
   * @returns {Promise<Object>} - Status da compra
   */
  async purchaseProduct(reservationId, paymentData) {
    return await this.request('post', `/reservations/${reservationId}/purchase`, paymentData);
  }

  /**
   * Cancela uma reserva
   * @param {string} reservationId - ID da reserva
   * @returns {Promise<Object>} - Status do cancelamento
   */
  async cancelReservation(reservationId) {
    return await this.request('post', `/reservations/${reservationId}/cancel`, {});
  }
}

// Instanciar cliente LZT
const lztClient = new LZTMarketClient();

/**
 * Sincroniza produtos do LZT Market com o banco de dados local
 * @returns {Promise<Object>} - Resultado da sincronização
 */
async function syncProducts() {
  try {
    logger.info('Iniciando sincronização com LZT Market...');

    // Registrar início na auditoria
    await auditLogger.log({
      action: 'LZT_SYNC_STARTED',
      category: 'INTEGRATION',
      severity: 'INFO',
      status: 'SUCCESS'
    });

    // Buscar produtos disponíveis no LZT
    const lztProducts = await lztClient.getProducts({
      status: 'available',
      limit: 100
    });

    if (!lztProducts || !lztProducts.data || !Array.isArray(lztProducts.data)) {
      logger.error('Formato inválido na resposta do LZT Market');
      return {
        success: false,
        message: 'Formato de resposta inválido',
        added: 0,
        updated: 0,
        errors: 1
      };
    }

    logger.info(`${lztProducts.data.length} produtos encontrados no LZT Market`);

    // Contadores para resultado
    let added = 0;
    let updated = 0;
    let errors = 0;

    // Processar cada produto
    for (const lztProduct of lztProducts.data) {
      try {
        // Verificar se o produto já existe no banco de dados
        const existingProduct = await Product.findOne({ origemId: lztProduct.id, origem: 'LZT' });

        if (existingProduct) {
          // Atualizar produto existente
          existingProduct.nome = lztProduct.title || `Conta ${lztProduct.type || 'Valorant'}`;
          existingProduct.preco = lztProduct.price || 0;
          existingProduct.descricao = lztProduct.description || '';
          existingProduct.disponivel = lztProduct.status === 'available';
          existingProduct.ultimaAtualizacao = new Date();

          // Atualizar detalhes
          if (lztProduct.details) {
            existingProduct.detalhes = {
              ...existingProduct.detalhes,
              ...mapLZTDetails(lztProduct)
            };
          }

          // Atualizar imagens
          if (lztProduct.images && Array.isArray(lztProduct.images)) {
            existingProduct.imagens = lztProduct.images;
          }

          await existingProduct.save();
          updated++;

          logger.debug(`Produto atualizado: ${existingProduct._id} (LZT: ${lztProduct.id})`);
        } else {
          // Criar novo produto
          const newProduct = new Product({
            nome: lztProduct.title || `Conta ${lztProduct.type || 'Valorant'}`,
            tipo: lztProduct.type || 'valorant',
            preco: lztProduct.price || 0,
            descricao: lztProduct.description || '',
            detalhes: mapLZTDetails(lztProduct),
            disponivel: lztProduct.status === 'available',
            dataCriacao: new Date(),
            origem: 'LZT',
            origemId: lztProduct.id,
            imagens: lztProduct.images || []
          });

          await newProduct.save();
          added++;

          logger.debug(`Novo produto adicionado: ${newProduct._id} (LZT: ${lztProduct.id})`);
        }
      } catch (productError) {
        logger.error(`Erro ao processar produto LZT ${lztProduct.id}:`, productError);
        errors++;
      }
    }

    logger.info(`Sincronização concluída: ${added} adicionados, ${updated} atualizados, ${errors} erros`);

    // Registrar conclusão na auditoria
    await auditLogger.log({
      action: 'LZT_SYNC_COMPLETED',
      category: 'INTEGRATION',
      severity: 'INFO',
      status: 'SUCCESS',
      details: {
        added,
        updated,
        errors
      }
    });

    return {
      success: true,
      added,
      updated,
      errors
    };
  } catch (error) {
    logger.error('Erro ao sincronizar com LZT Market:', error);

    // Registrar erro na auditoria
    await auditLogger.log({
      action: 'LZT_SYNC_FAILED',
      category: 'INTEGRATION',
      severity: 'ERROR',
      status: 'ERROR',
      details: {
        message: error.message
      }
    });

    return {
      success: false,
      message: error.message,
      added: 0,
      updated: 0,
      errors: 1
    };
  }
}

/**
 * Mapeia os detalhes do produto do formato LZT para o formato interno
 * @param {Object} lztProduct - Produto do LZT Market
 * @returns {Object} - Detalhes mapeados
 * @private
 */
function mapLZTDetails(lztProduct) {
  // Implementação de mapeamento de campos específicos
  // Esta função deve ser adaptada conforme o formato de dados do LZT
  const details = {};

  // Extrair detalhes específicos do LZT
  if (lztProduct.details) {
    // Mapear rank
    if (lztProduct.details.rank) {
      details.rank = lztProduct.details.rank;
    }

    // Mapear quantidade de skins
    if (lztProduct.details.skins_count) {
      details.skins = parseInt(lztProduct.details.skins_count) || 0;
    }

    // Mapear região
    if (lztProduct.details.region) {
      details.region = lztProduct.details.region;
    }

    // Mapear agentes
    if (lztProduct.details.agents_count) {
      details.agents = parseInt(lztProduct.details.agents_count) || 0;
    }

    // Mapear level
    if (lztProduct.details.level) {
      details.level = parseInt(lztProduct.details.level) || 0;
    }

    // Mapear email verificado
    if (lztProduct.details.email_verified !== undefined) {
      details.verification = !!lztProduct.details.email_verified;
    }

    // Mapear pontos valorant
    if (lztProduct.details.valorant_points) {
      details.valorantPoints = parseInt(lztProduct.details.valorant_points) || 0;
    }

    // Incluir todos os outros campos disponíveis
    for (const [key, value] of Object.entries(lztProduct.details)) {
      if (!details[key]) {
        details[key] = value;
      }
    }
  }

  return details;
}

/**
 * Compra um produto do LZT Market
 * @param {string} lztProductId - ID do produto no LZT
 * @param {string} internalPaymentId - ID do pagamento interno
 * @returns {Promise<Object>} - Resultado da compra
 */
async function purchaseLZTProduct(lztProductId, internalPaymentId) {
  try {
    logger.info(`Iniciando compra do produto LZT ${lztProductId}`);

    // Reservar o produto
    const reservation = await lztClient.reserveProduct(lztProductId);

    if (!reservation || !reservation.success || !reservation.data || !reservation.data.id) {
      logger.error('Erro ao reservar produto:', reservation);
      return {
        success: false,
        message: 'Falha ao reservar produto no LZT Market',
        product: null
      };
    }

    logger.info(`Produto LZT ${lztProductId} reservado: ${reservation.data.id}`);

    // Simular dados de pagamento (em um sistema real, isso viria do processador de pagamento)
    const paymentData = {
      payment_id: internalPaymentId,
      payment_method: 'pix',
      amount: reservation.data.price
    };

    // Finalizar a compra
    const purchase = await lztClient.purchaseProduct(reservation.data.id, paymentData);

    if (!purchase || !purchase.success || !purchase.data) {
      // Cancelar reserva em caso de falha
      await lztClient.cancelReservation(reservation.data.id);

      logger.error('Erro ao finalizar compra:', purchase);
      return {
        success: false,
        message: 'Falha ao finalizar compra no LZT Market',
        product: null
      };
    }

    logger.info(`Compra do produto LZT ${lztProductId} concluída com sucesso`);

    // Retornar dados da conta
    return {
      success: true,
      product: purchase.data,
      accountData: {
        login: purchase.data.account.login,
        password: purchase.data.account.password,
        additionalInfo: purchase.data.account.additional_info
      }
    };
  } catch (error) {
    logger.error(`Erro ao comprar produto LZT ${lztProductId}:`, error);
    return {
      success: false,
      message: error.message,
      product: null
    };
  }
}

module.exports = {
  client: lztClient,
  syncProducts,
  purchaseLZTProduct
};
