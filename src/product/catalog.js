/**
 * Gerenciamento do catálogo de produtos
 */

const Product = require('../models/product');
const db = require('../utils/db');
const cache = require('../utils/cache');
const { logger } = require('../utils/helpers');

// Chave de cache para produtos
const CACHE_KEY_PRODUCTS = 'products:all';
const CACHE_KEY_PRODUCT = 'product:';
const CACHE_TTL = 300; // 5 minutos

/**
 * Obtém todos os produtos disponíveis
 * @param {number} limit - Limite de produtos a retornar
 * @param {Object} filters - Filtros a aplicar
 * @returns {Promise<Array>} - Lista de produtos
 */
async function getAvailableProducts(limit = 100, filters = {}) {
  try {
    // Verificar cache se não houver filtros específicos
    if (Object.keys(filters).length === 0) {
      const cachedProducts = await cache.get(CACHE_KEY_PRODUCTS);
      if (cachedProducts) {
        return cachedProducts.slice(0, limit);
      }
    }

    // Construir consulta
    const query = { disponivel: true, vendido: false };

    // Aplicar filtros adicionais
    if (filters.tipo) query.tipo = filters.tipo;
    if (filters.precoMin) query.preco = { $gte: filters.precoMin };
    if (filters.precoMax) {
      if (query.preco) {
        query.preco.$lte = filters.precoMax;
      } else {
        query.preco = { $lte: filters.precoMax };
      }
    }

    // Filtros para detalhes específicos
    if (filters.rank) query['detalhes.rank'] = filters.rank;
    if (filters.skinsMin) query['detalhes.skins'] = { $gte: filters.skinsMin };
    if (filters.region) query['detalhes.region'] = filters.region;

    // Opções de ordenação
    const sortOption = {};
    if (filters.orderBy === 'preco') {
      sortOption.preco = filters.orderDirection === 'desc' ? -1 : 1;
    } else if (filters.orderBy === 'data') {
      sortOption.dataCriacao = filters.orderDirection === 'desc' ? -1 : 1;
    } else if (filters.orderBy === 'visualizacoes') {
      sortOption.visualizacoes = -1;
    } else {
      // Ordenação padrão: mais recentes primeiro
      sortOption.dataCriacao = -1;
    }

    // Executar consulta
    const produtos = await Product.find(query)
      .sort(sortOption)
      .limit(limit);

    // Atualizar cache apenas para consulta padrão
    if (Object.keys(filters).length === 0) {
      await cache.set(CACHE_KEY_PRODUCTS, produtos, CACHE_TTL);
    }

    return produtos;
  } catch (error) {
    logger.error('Erro ao buscar produtos disponíveis:', error);
    return [];
  }
}

/**
 * Obtém todos os produtos (incluindo indisponíveis)
 * @returns {Promise<Array>} - Lista de todos os produtos
 */
async function getAllProducts() {
  try {
    return await Product.find().sort({ dataCriacao: -1 });
  } catch (error) {
    logger.error('Erro ao buscar todos os produtos:', error);
    return [];
  }
}

/**
 * Obtém um produto pelo ID
 * @param {string} productId - ID do produto
 * @returns {Promise<Object>} - Dados do produto
 */
async function getProductById(productId) {
  try {
    // Verificar cache
    const cacheKey = `${CACHE_KEY_PRODUCT}${productId}`;
    const cachedProduct = await cache.get(cacheKey);
    if (cachedProduct) {
      return cachedProduct;
    }

    // Buscar produto
    const produto = await Product.findById(productId);

    if (!produto) {
      return null;
    }

    // Incrementar visualizações
    produto.visualizacoes += 1;
    await produto.save();

    // Atualizar cache
    await cache.set(cacheKey, produto, CACHE_TTL);

    return produto;
  } catch (error) {
    logger.error(`Erro ao buscar produto ${productId}:`, error);
    return null;
  }
}

/**
 * Cria um novo produto
 * @param {Object} productData - Dados do produto
 * @returns {Promise<Object>} - Produto criado
 */
async function createProduct(productData) {
  try {
    const newProduct = new Product({
      nome: productData.nome || `${productData.tipo} #${Math.floor(Math.random() * 10000)}`,
      tipo: productData.tipo,
      preco: productData.preco,
      descricao: productData.descricao,
      detalhes: productData.detalhes || {},
      disponivel: productData.disponivel !== undefined ? productData.disponivel : true,
      dataCriacao: productData.dataCriacao || new Date(),
      criadoPor: productData.criadoPor,
      origem: productData.origem || 'MANUAL',
      origemId: productData.origemId,
      imagens: productData.imagens || []
    });

    await newProduct.save();

    // Invalidar cache
    await cache.del(CACHE_KEY_PRODUCTS);

    logger.info(`Novo produto criado: ${newProduct._id}`);
    return newProduct;
  } catch (error) {
    logger.error('Erro ao criar produto:', error);
    throw error;
  }
}

/**
 * Atualiza um produto existente
 * @param {string} productId - ID do produto
 * @param {Object} updateData - Dados para atualização
 * @returns {Promise<Object>} - Produto atualizado
 */
async function updateProduct(productId, updateData) {
  try {
    const produto = await Product.findById(productId);

    if (!produto) {
        return { success: false, message: 'Produto não encontrado' };
      }

      // Campos que podem ser atualizados
      const allowedFields = [
        'nome', 'preco', 'descricao', 'detalhes',
        'disponivel', 'imagens'
      ];

      // Atualizar campos permitidos
      allowedFields.forEach(field => {
        if (updateData[field] !== undefined) {
          produto[field] = updateData[field];
        }
      });

      // Registrar atualização
      produto.ultimaAtualizacao = new Date();

      await produto.save();

      // Invalidar cache
      await cache.del(CACHE_KEY_PRODUCTS);
      await cache.del(`${CACHE_KEY_PRODUCT}${productId}`);

      logger.info(`Produto ${productId} atualizado`);
      return { success: true, product: produto };
    } catch (error) {
      logger.error(`Erro ao atualizar produto ${productId}:`, error);
      return { success: false, message: error.message };
    }
  }

  /**
   * Marca um produto como vendido
   * @param {string} productId - ID do produto
   * @param {string} userId - ID do comprador
   * @returns {Promise<Object>} - Resultado da operação
   */
  async function markProductAsSold(productId, userId) {
    try {
      const produto = await Product.findById(productId);

      if (!produto) {
        return { success: false, message: 'Produto não encontrado' };
      }

      // Verificar se já está vendido
      if (produto.vendido) {
        return { success: false, message: 'Produto já foi vendido' };
      }

      // Atualizar produto
      produto.vendido = true;
      produto.disponivel = false;
      produto.dataVenda = new Date();
      produto.compradoPor = userId;

      await produto.save();

      // Invalidar cache
      await cache.del(CACHE_KEY_PRODUCTS);
      await cache.del(`${CACHE_KEY_PRODUCT}${productId}`);

      logger.info(`Produto ${productId} marcado como vendido para ${userId}`);
      return { success: true };
    } catch (error) {
      logger.error(`Erro ao marcar produto ${productId} como vendido:`, error);
      return { success: false, message: error.message };
    }
  }

  /**
   * Busca produtos por texto
   * @param {string} searchText - Texto para busca
   * @param {number} limit - Limite de resultados
   * @returns {Promise<Array>} - Resultados da busca
   */
  async function searchProducts(searchText, limit = 20) {
    try {
      if (!searchText || searchText.trim().length < 3) {
        return [];
      }

      // Criar expressão regular para busca
      const searchRegex = new RegExp(searchText.trim(), 'i');

      // Buscar em vários campos
      const produtos = await Product.find({
        $or: [
          { nome: searchRegex },
          { descricao: searchRegex },
          { tipo: searchRegex },
          { 'detalhes.rank': searchRegex }
        ],
        disponivel: true,
        vendido: false
      })
      .sort({ dataCriacao: -1 })
      .limit(limit);

      return produtos;
    } catch (error) {
      logger.error(`Erro ao buscar produtos com texto "${searchText}":`, error);
      return [];
    }
  }

  /**
   * Obtém estatísticas do catálogo
   * @returns {Promise<Object>} - Estatísticas
   */
  async function getCatalogStats() {
    try {
      // Total de produtos disponíveis
      const totalDisponivel = await Product.countDocuments({
        disponivel: true,
        vendido: false
      });

      // Total de produtos por tipo
      const porTipo = await Product.aggregate([
        { $match: { disponivel: true, vendido: false } },
        { $group: { _id: '$tipo', count: { $sum: 1 } } },
        { $sort: { count: -1 } }
      ]);

      // Estatísticas de preço
      const estatisticasPreco = await Product.aggregate([
        { $match: { disponivel: true, vendido: false } },
        {
          $group: {
            _id: null,
            precoMedio: { $avg: '$preco' },
            precoMinimo: { $min: '$preco' },
            precoMaximo: { $max: '$preco' }
          }
        }
      ]);

      // Produtos mais visualizados
      const maisVisualizados = await Product.find({
        disponivel: true,
        vendido: false
      })
      .sort({ visualizacoes: -1 })
      .limit(5)
      .select('nome tipo preco visualizacoes');

      // Produtos mais recentes
      const maisRecentes = await Product.find({
        disponivel: true,
        vendido: false
      })
      .sort({ dataCriacao: -1 })
      .limit(5)
      .select('nome tipo preco dataCriacao');

      // Construir resultado
      return {
        totalDisponivel,
        porTipo: porTipo.map(item => ({
          tipo: item._id,
          quantidade: item.count
        })),
        precos: estatisticasPreco.length > 0 ? {
          medio: estatisticasPreco[0].precoMedio,
          minimo: estatisticasPreco[0].precoMinimo,
          maximo: estatisticasPreco[0].precoMaximo
        } : {
          medio: 0,
          minimo: 0,
          maximo: 0
        },
        maisVisualizados,
        maisRecentes
      };
    } catch (error) {
      logger.error('Erro ao obter estatísticas do catálogo:', error);
      return {
        totalDisponivel: 0,
        porTipo: [],
        precos: { medio: 0, minimo: 0, maximo: 0 },
        maisVisualizados: [],
        maisRecentes: []
      };
    }
  }

  module.exports = {
    getAvailableProducts,
    getAllProducts,
    getProductById,
    createProduct,
    updateProduct,
    markProductAsSold,
    searchProducts,
    getCatalogStats
  };
