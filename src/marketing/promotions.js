/**
 * Sistema de promoções e descontos
 */

const Promotion = require('../models/promotion');
const Product = require('../models/product');
const { logger } = require('../utils/helpers');
const config = require('../config');
const auditLogger = require('../audit/logger');
const cache = require('../utils/cache');

// Chave de cache para promoções ativas
const CACHE_KEY_ACTIVE_PROMOS = 'promotions:active';
const CACHE_TTL = 300; // 5 minutos

/**
 * Cria uma nova promoção
 * @param {Object} promoData - Dados da promoção
 * @returns {Promise<Object>} - Promoção criada
 */
async function createPromotion(promoData) {
  try {
    // Validar desconto
    if (promoData.desconto < config.marketing.discountLimits.min ||
        promoData.desconto > config.marketing.discountLimits.max) {
      return {
        success: false,
        message: `Desconto deve estar entre ${config.marketing.discountLimits.min}% e ${config.marketing.discountLimits.max}%`
      };
    }

    // Validar duração
    if (!promoData.duracao || promoData.duracao <= 0) {
      return {
        success: false,
        message: 'Duração deve ser maior que zero'
      };
    }

    // Validar tipo
    if (!config.marketing.promotionTypes.includes(promoData.tipo)) {
      return {
        success: false,
        message: `Tipo inválido. Tipos permitidos: ${config.marketing.promotionTypes.join(', ')}`
      };
    }

    // Calcular data de fim
    const dataInicio = promoData.dataInicio || new Date();
    const dataFim = new Date(dataInicio.getTime() + (promoData.duracao * 60 * 60 * 1000));

    // Criar promoção
    const newPromo = new Promotion({
      titulo: promoData.titulo || `Promoção ${promoData.tipo.toUpperCase()}`,
      descricao: promoData.descricao,
      tipo: promoData.tipo,
      desconto: promoData.desconto,
      dataInicio: dataInicio,
      dataFim: dataFim,
      duracao: promoData.duracao,
      ativa: true,
      criadoPor: promoData.criadoPor,
      produtos: promoData.produtos || [],
      categorias: promoData.categorias || [],
      codigoPromo: promoData.codigoPromo,
      usoLimitado: promoData.usoLimitado || false,
      limiteUsos: promoData.limiteUsos,
      imageUrl: promoData.imageUrl
    });

    await newPromo.save();

    // Invalidar cache
    await cache.del(CACHE_KEY_ACTIVE_PROMOS);

    // Registrar na auditoria
    await auditLogger.log({
      action: 'PROMOTION_CREATED',
      category: 'MARKETING',
      severity: 'INFO',
      status: 'SUCCESS',
      user: {
        id: promoData.criadoPor
      },
      details: {
        promotionId: newPromo._id,
        type: newPromo.tipo,
        discount: newPromo.desconto,
        duration: newPromo.duracao
      }
    });

    logger.info(`Promoção criada: ${newPromo._id}`);
    return {
      success: true,
      promotion: newPromo
    };
  } catch (error) {
    logger.error('Erro ao criar promoção:', error);
    return {
      success: false,
      message: error.message
    };
  }
}

/**
 * Atualiza uma promoção existente
 * @param {string} promoId - ID da promoção
 * @param {Object} updateData - Dados para atualização
 * @param {string} adminId - ID do administrador
 * @returns {Promise<Object>} - Resultado da operação
 */
async function updatePromotion(promoId, updateData, adminId) {
  try {
    const promotion = await Promotion.findById(promoId);

    if (!promotion) {
      return {
        success: false,
        message: 'Promoção não encontrada'
      };
    }

    // Campos que podem ser atualizados
    const allowedFields = [
      'titulo', 'descricao', 'desconto', 'dataInicio', 'dataFim',
      'duracao', 'ativa', 'produtos', 'categorias', 'codigoPromo',
      'usoLimitado', 'limiteUsos', 'imageUrl'
    ];

    // Atualizar campos permitidos
    for (const field of allowedFields) {
      if (updateData[field] !== undefined) {
        promotion[field] = updateData[field];
      }
    }

    // Validar desconto
    if (promotion.desconto < config.marketing.discountLimits.min ||
        promotion.desconto > config.marketing.discountLimits.max) {
      return {
        success: false,
        message: `Desconto deve estar entre ${config.marketing.discountLimits.min}% e ${config.marketing.discountLimits.max}%`
      };
    }

    // Recalcular dataFim se necessário
    if (updateData.dataInicio || updateData.duracao) {
      const inicio = promotion.dataInicio;
      const duracao = promotion.duracao;
      promotion.dataFim = new Date(inicio.getTime() + (duracao * 60 * 60 * 1000));
    }

    await promotion.save();

    // Invalidar cache
    await cache.del(CACHE_KEY_ACTIVE_PROMOS);

    // Registrar na auditoria
    await auditLogger.log({
      action: 'PROMOTION_UPDATED',
      category: 'MARKETING',
      severity: 'INFO',
      status: 'SUCCESS',
      user: {
        id: adminId
      },
      details: {
        promotionId: promotion._id,
        updatedFields: Object.keys(updateData)
      }
    });

    logger.info(`Promoção ${promoId} atualizada por ${adminId}`);
    return {
      success: true,
      promotion
    };
  } catch (error) {
    logger.error(`Erro ao atualizar promoção ${promoId}:`, error);
    return {
      success: false,
      message: error.message
    };
  }
}

/**
 * Encerra uma promoção
 * @param {string} promoId - ID da promoção
 * @param {string} adminId - ID do administrador
 * @returns {Promise<Object>} - Resultado da operação
 */
async function endPromotion(promoId, adminId) {
  try {
    const promotion = await Promotion.findById(promoId);

    if (!promotion) {
      return {
        success: false,
        message: 'Promoção não encontrada'
      };
    }

    // Verificar se já está inativa
    if (!promotion.ativa) {
      return {
        success: false,
        message: 'Promoção já está inativa'
      };
    }

    // Encerrar promoção
    promotion.ativa = false;
    promotion.dataFim = new Date(); // Encerra imediatamente

    await promotion.save();

    // Invalidar cache
    await cache.del(CACHE_KEY_ACTIVE_PROMOS);

    // Registrar na auditoria
    await auditLogger.log({
      action: 'PROMOTION_ENDED',
      category: 'MARKETING',
      severity: 'INFO',
      status: 'SUCCESS',
      user: {
        id: adminId
      },
      details: {
        promotionId: promotion._id,
        type: promotion.tipo,
        discount: promotion.desconto
      }
    });

    logger.info(`Promoção ${promoId} encerrada por ${adminId}`);
    return {
      success: true
    };
  } catch (error) {
    logger.error(`Erro ao encerrar promoção ${promoId}:`, error);
    return {
      success: false,
      message: error.message
    };
  }
}

/**
 * Obtém promoções ativas
 * @returns {Promise<Array>} - Lista de promoções ativas
 */
async function getActivePromotions() {
  try {
    // Verificar cache
    const cachedPromos = await cache.get(CACHE_KEY_ACTIVE_PROMOS);
    if (cachedPromos) {
      return cachedPromos;
    }

    const now = new Date();

    // Buscar promoções ativas
    const promotions = await Promotion.find({
      ativa: true,
      dataInicio: { $lte: now },
      dataFim: { $gt: now }
    }).sort({ dataFim: 1 });

    // Atualizar cache
    await cache.set(CACHE_KEY_ACTIVE_PROMOS, promotions, CACHE_TTL);

    return promotions;
  } catch (error) {
    logger.error('Erro ao obter promoções ativas:', error);
    return [];
  }
}

/**
 * Calcula o preço promocional de um produto
 * @param {string} productId - ID do produto
 * @param {number} originalPrice - Preço original
 * @param {string} productType - Tipo do produto
 * @returns {Promise<Object>} - Informações de preço promocional
 */
async function getPromotionalPrice(productId, originalPrice, productType) {
  try {
    // Obter promoções ativas
    const activePromotions = await getActivePromotions();

    if (activePromotions.length === 0) {
      return {
        hasDiscount: false,
        originalPrice,
        discountedPrice: originalPrice,
        discountPercentage: 0,
        promotion: null
      };
    }

    // Encontrar a melhor promoção (maior desconto) aplicável a este produto
    let bestPromotion = null;
    let highestDiscount = 0;

    for (const promo of activePromotions) {
      // Verificar se a promoção se aplica ao produto
      if (promo.produtos.length > 0) {
        // Promoção específica para produtos selecionados
        if (!promo.produtos.some(p => p.toString() === productId.toString())) {
          continue;
        }
      } else if (promo.categorias.length > 0) {
        // Promoção específica para categorias selecionadas
        if (!promo.categorias.includes(productType)) {
          continue;
        }
      }

      // Se chegou aqui, a promoção é aplicável
      if (promo.desconto > highestDiscount) {
        highestDiscount = promo.desconto;
        bestPromotion = promo;
      }
    }

    // Se não encontrou promoção aplicável
    if (!bestPromotion) {
      return {
        hasDiscount: false,
        originalPrice,
        discountedPrice: originalPrice,
        discountPercentage: 0,
        promotion: null
      };
    }

    // Calcular preço com desconto
    const discount = bestPromotion.desconto / 100;
    const discountedPrice = Math.round((originalPrice * (1 - discount)) * 100) / 100;

    return {
      hasDiscount: true,
      originalPrice,
      discountedPrice,
      discountPercentage: bestPromotion.desconto,
      promotion: {
        id: bestPromotion._id,
        title: bestPromotion.titulo,
        description: bestPromotion.descricao,
        expiresAt: bestPromotion.dataFim
      }
    };
  } catch (error) {
    logger.error(`Erro ao calcular preço promocional para ${productId}:`, error);
    return {
      hasDiscount: false,
      originalPrice,
      discountedPrice: originalPrice,
      discountPercentage: 0,
      promotion: null
    };
  }
}

module.exports = {
  createPromotion,
  updatePromotion,
  endPromotion,
  getActivePromotions,
  getPromotionalPrice
};
