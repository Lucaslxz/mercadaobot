// src/audit/logger.js
const AuditLog = require('../models/audit');
const config = require('../config');
const { logger } = require('../utils/helpers');
const mongoose = require('mongoose');

/**
 * Registra uma entrada no log de auditoria
 * @param {Object} logData - Dados para o log
 * @returns {Promise<Object>} - Entrada de log criada
 */
async function log(logData) {
  try {
    // Verificar campos obrigatórios
    if (!logData.action || !logData.category || !logData.severity || !logData.status) {
      logger.error('Dados incompletos para log de auditoria:', logData);
      return null;
    }

    // Criar registro de log
    const auditEntry = new AuditLog({
      action: logData.action,
      category: logData.category,
      severity: logData.severity,
      status: logData.status,
      timestamp: logData.timestamp || new Date(),
      user: logData.user,
      target: logData.target,
      product: logData.product,
      payment: logData.payment,
      details: logData.details,
      ip: logData.ip
    });

    await auditEntry.save();

    // Se for um log crítico ou erro, registrar também no logger
    if (logData.severity === 'critical') {
      logger.error(`[AUDIT CRITICAL] ${logData.action}: ${JSON.stringify(logData.details || {})}`);
    } else if (logData.severity === 'error') {
      logger.error(`[AUDIT ERROR] ${logData.action}: ${JSON.stringify(logData.details || {})}`);
    }

    return auditEntry;
  } catch (error) {
    logger.error('Erro ao registrar log de auditoria:', error);
    // Em caso de erro, tentar um registro básico como fallback
    try {
      const basicLog = new AuditLog({
        action: 'AUDIT_ERROR',
        category: 'SYSTEM',
        severity: 'error',
        status: 'ERROR',
        details: {
          originalAction: logData?.action || 'unknown',
          errorMessage: error.message
        }
      });

      await basicLog.save();
      return basicLog;
    } catch (fallbackError) {
      logger.error('Falha completa no sistema de auditoria:', fallbackError);
      return null;
    }
  }
}

/**
 * Busca logs de auditoria com filtros
 * @param {Object} filters - Filtros a serem aplicados
 * @param {Object} options - Opções adicionais (limit, skip, sort)
 * @returns {Promise<Array>} - Logs encontrados
 */
async function searchLogs(filters = {}, options = {}) {
  try {
    // Construir consulta
    const query = {};

    // Aplicar filtros
    if (filters.action) query.action = filters.action;
    if (filters.category) query.category = filters.category;
    if (filters.severity) query.severity = filters.severity;
    if (filters.status) query.status = filters.status;

    // Filtro por usuário
    if (filters.userId) query['user.id'] = filters.userId;

    // Filtro por alvo
    if (filters.targetId) query['target.id'] = filters.targetId;

    // Filtro por produto
    if (filters.productId) query['product.id'] = mongoose.Types.ObjectId(filters.productId);

    // Filtro por pagamento
    if (filters.paymentId) query['payment.id'] = mongoose.Types.ObjectId(filters.paymentId);

    // Filtros de data
    if (filters.startDate || filters.endDate) {
      query.timestamp = {};

      if (filters.startDate) {
        query.timestamp.$gte = new Date(filters.startDate);
      }

      if (filters.endDate) {
        query.timestamp.$lte = new Date(filters.endDate);
      }
    }

    // Opções da consulta
    const limit = options.limit || 100;
    const skip = options.skip || 0;
    const sort = options.sort || { timestamp: -1 };

    // Executar consulta
    const logs = await AuditLog.find(query)
      .sort(sort)
      .skip(skip)
      .limit(limit);

    // Contar total de resultados (para paginação)
    const total = await AuditLog.countDocuments(query);

    return {
      logs,
      total,
      page: Math.floor(skip / limit) + 1,
      pageSize: limit,
      totalPages: Math.ceil(total / limit)
    };
  } catch (error) {
    logger.error('Erro ao buscar logs de auditoria:', error);
    return {
      logs: [],
      total: 0,
      page: 1,
      pageSize: options.limit || 100,
      totalPages: 0
    };
  }
}

/**
 * Obtém estatísticas de logs de auditoria
 * @param {Object} filters - Filtros para estatísticas
 * @returns {Promise<Object>} - Estatísticas dos logs
 */
async function getAuditStats(filters = {}) {
  try {
    // Construir consulta de filtro base
    const baseQuery = {};

    // Aplicar filtros de data
    if (filters.startDate || filters.endDate) {
      baseQuery.timestamp = {};

      if (filters.startDate) {
        baseQuery.timestamp.$gte = new Date(filters.startDate);
      }

      if (filters.endDate) {
        baseQuery.timestamp.$lte = new Date(filters.endDate);
      }
    }

    // Contagem por severidade
    const severityStats = await AuditLog.aggregate([
      { $match: baseQuery },
      { $group: { _id: '$severity', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);

    // Contagem por categoria
    const categoryStats = await AuditLog.aggregate([
      { $match: baseQuery },
      { $group: { _id: '$category', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);

    // Contagem por status
    const statusStats = await AuditLog.aggregate([
      { $match: baseQuery },
      { $group: { _id: '$status', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);

    // Ações mais frequentes
    const topActions = await AuditLog.aggregate([
      { $match: baseQuery },
      { $group: { _id: '$action', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 }
    ]);

    // Contagem total
    const totalLogs = await AuditLog.countDocuments(baseQuery);

    // Logs mais recentes
    const recentLogs = await AuditLog.find(baseQuery)
      .sort({ timestamp: -1 })
      .limit(5);

    return {
      total: totalLogs,
      bySeverity: severityStats.map(item => ({
        severity: item._id,
        count: item.count
      })),
      byCategory: categoryStats.map(item => ({
        category: item._id,
        count: item.count
      })),
      byStatus: statusStats.map(item => ({
        status: item._id,
        count: item.count
      })),
      topActions: topActions.map(item => ({
        action: item._id,
        count: item.count
      })),
      recentLogs
    };
  } catch (error) {
    logger.error('Erro ao obter estatísticas de auditoria:', error);
    return {
      total: 0,
      bySeverity: [],
      byCategory: [],
      byStatus: [],
      topActions: [],
      recentLogs: []
    };
  }
}

/**
 * Limpa logs antigos com base na política de retenção
 * @returns {Promise<Object>} - Resultado da operação
 */
async function cleanupOldLogs() {
  try {
    const now = new Date();

    // Deletar logs cuja data de retenção já passou
    const result = await AuditLog.deleteMany({
      retentionDate: { $lt: now }
    });

    logger.info(`Limpeza de logs antigos concluída: ${result.deletedCount} logs removidos`);
    return {
      success: true,
      deletedCount: result.deletedCount
    };
  } catch (error) {
    logger.error('Erro ao limpar logs antigos:', error);
    return {
      success: false,
      message: error.message
    };
  }
}

module.exports = {
  log,
  searchLogs,
  getAuditStats,
  cleanupOldLogs
};

// src/marketing/promotions.js
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

// src/marketing/loyalty.js
const Loyalty = require('../models/loyalty');
const { logger } = require('../utils/helpers');
const config = require('../config');
const auditLogger = require('../audit/logger');
const userService = require('../user/profile');

/**
 * Adiciona pontos de fidelidade a um usuário
 * @param {string} userId - ID do usuário
 * @param {number} points - Quantidade de pontos
 * @param {string} reason - Motivo da adição
 * @param {Object} metadata - Dados adicionais
 * @returns {Promise<Object>} - Resultado da operação
 */
async function addPoints(userId, points, reason, metadata = {}) {
  try {
    // Verificar se é um valor válido
    if (points <= 0) {
      return {
        success: false,
        message: 'Quantidade de pontos deve ser maior que zero'
      };
    }

    // Obter ou criar perfil de fidelidade
    let loyalty = await Loyalty.findOne({ userId });

    if (!loyalty) {
      // Obter dados do usuário
      const userProfile = await userService.getUserProfile(userId);

      if (!userProfile) {
        return {
          success: false,
          message: 'Usuário não encontrado'
        };
      }

      // Criar novo perfil de fidelidade
      loyalty = new Loyalty({
        userId,
        userName: userProfile.username,
        totalPoints: 0,
        lifetimePoints: 0,
        level: 1,
        transactions: []
      });
    }

    // Calcular data de expiração
    const now = new Date();
    const expirationDays = config.marketing.loyaltyPoints.expirationDays;
    const expiresAt = new Date(now.getTime() + (expirationDays * 24 * 60 * 60 * 1000));

    // Adicionar transação
    loyalty.transactions.push({
      amount: points,
      reason,
      createdAt: now,
      expiresAt,
      status: 'ACTIVE',
      relatedProductId: metadata.productId,
      relatedPaymentId: metadata.paymentId
    });

    // Atualizar saldos
    loyalty.totalPoints += points;
    loyalty.lifetimePoints += points;

    // Atualizar nível com base nos pontos acumulados na vida
    loyalty.level = _calculateLoyaltyLevel(loyalty.lifetimePoints);

    // Atualizar timestamp
    loyalty.lastUpdated = now;

    await loyalty.save();

    // Registrar na auditoria
    await auditLogger.log({
      action: 'LOYALTY_POINTS_ADDED',
      category: 'MARKETING',
      severity: 'INFO',
      status: 'SUCCESS',
      user: {
        id: userId,
        username: loyalty.userName
      },
      details: {
        points,
        reason,
        newTotal: loyalty.totalPoints,
        newLevel: loyalty.level,
        metadata
      }
    });

    logger.info(`${points} pontos de fidelidade adicionados para usuário ${userId}: ${reason}`);
    return {
      success: true,
      updatedPoints: loyalty.totalPoints,
      level: loyalty.level
    };
  } catch (error) {
    logger.error(`Erro ao adicionar pontos para usuário ${userId}:`, error);
    return {
      success: false,
      message: error.message
    };
  }
}

/**
 * Utiliza pontos de fidelidade de um usuário
 * @param {string} userId - ID do usuário
 * @param {number} points - Quantidade de pontos
 * @param {string} reason - Motivo da utilização
 * @param {Object} metadata - Dados adicionais
 * @returns {Promise<Object>} - Resultado da operação
 */
async function usePoints(userId, points, reason, metadata = {}) {
  try {
    // Verificar se é um valor válido
    if (points <= 0) {
      return {
        success: false,
        message: 'Quantidade de pontos deve ser maior que zero'
      };
    }

    // Obter perfil de fidelidade
    const loyalty = await Loyalty.findOne({ userId });

    if (!loyalty) {
      return {
        success: false,
        message: 'Usuário não possui pontos de fidelidade'
      };
    }

    // Verificar se tem pontos suficientes
    if (loyalty.totalPoints < points) {
      return {
        success: false,
        message: 'Saldo de pontos insuficiente',
        currentPoints: loyalty.totalPoints,
        requestedPoints: points
      };
    }

    // Adicionar transação negativa
    loyalty.transactions.push({
      amount: -points,
      reason,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + (365 * 24 * 60 * 60 * 1000)), // Não expira
      status: 'USED',
      relatedProductId: metadata.productId,
      relatedPaymentId: metadata.paymentId,
      actionBy: metadata.adminId
    });

    // Atualizar saldo
    loyalty.totalPoints -= points;

    // Atualizar timestamp
    loyalty.lastUpdated = new Date();

    await loyalty.save();

    // Registrar na auditoria
    await auditLogger.log({
      action: 'LOYALTY_POINTS_USED',
      category: 'MARKETING',
      severity: 'INFO',
      status: 'SUCCESS',
      user: {
        id: userId,
        username: loyalty.userName
      },
      details: {
        points,
        reason,
        newTotal: loyalty.totalPoints,
        metadata
      }
    });

    logger.info(`${points} pontos de fidelidade utilizados pelo usuário ${userId}: ${reason}`);
    return {
      success: true,
      remainingPoints: loyalty.totalPoints,
      level: loyalty.level
    };
  } catch (error) {
    logger.error(`Erro ao utilizar pontos do usuário ${userId}:`, error);
    return {
      success: false,
      message: error.message
    };
  }
}

/**
 * Obtém saldo e histórico de pontos de um usuário
 * @param {string} userId - ID do usuário
 * @returns {Promise<Object>} - Dados de fidelidade
 */
async function getUserPoints(userId) {
  try {
    // Obter perfil de fidelidade
    const loyalty = await Loyalty.findOne({ userId });

    if (!loyalty) {
      // Criar perfil vazio
      return {
        amount: 0,
        lifetimePoints: 0,
        level: 1,
        transactions: [],
        valueInMoney: 0
      };
    }

    // Verificar pontos expirados
    await _processExpiredPoints(loyalty);

    // Calcular valor em dinheiro
    const conversionRate = config.marketing.loyaltyPoints.conversionRate;
    const valueInMoney = loyalty.totalPoints * conversionRate;

    // Obter histórico de transações (mais recentes primeiro)
    const transactions = loyalty.transactions
      .sort((a, b) => b.createdAt - a.createdAt)
      .map(tx => ({
        id: tx._id,
        amount: tx.amount,
        reason: tx.reason,
        date: tx.createdAt,
        expiresAt: tx.expiresAt,
        status: tx.status
      }));

    return {
      amount: loyalty.totalPoints,
      lifetimePoints: loyalty.lifetimePoints,
      level: loyalty.level,
      transactions,
      valueInMoney
    };
  } catch (error) {
    logger.error(`Erro ao obter pontos do usuário ${userId}:`, error);
    return {
      amount: 0,
      lifetimePoints: 0,
      level: 1,
      transactions: [],
      valueInMoney: 0
    };
  }
}

/**
 * Calcula um nível de fidelidade com base em pontos
 * @param {number} lifetimePoints - Total de pontos acumulados na vida
 * @returns {number} - Nível calculado
 * @private
 */
function _calculateLoyaltyLevel(lifetimePoints) {
  if (lifetimePoints >= 10000) return 5; // VIP
  if (lifetimePoints >= 5000) return 4;  // Ouro
  if (lifetimePoints >= 2000) return 3;  // Prata
  if (lifetimePoints >= 500) return 2;   // Bronze
  return 1; // Iniciante
}

/**
 * Processa pontos expirados de um perfil
 * @param {Object} loyalty - Perfil de fidelidade
 * @returns {Promise<Object>} - Perfil atualizado
 * @private
 */
async function _processExpiredPoints(loyalty) {
  try {
    const now = new Date();
    let pointsExpired = 0;

    // Identificar transações expiradas
    for (const tx of loyalty.transactions) {
      if (tx.status === 'ACTIVE' && tx.expiresAt <= now) {
        tx.status = 'EXPIRED';
        pointsExpired += tx.amount;
      }
    }

    // Se houve expiração, atualizar saldo
    if (pointsExpired > 0) {
      loyalty.totalPoints -= pointsExpired;
      loyalty.lastUpdated = now;

      // Registrar transação de expiração
      loyalty.transactions.push({
        amount: -pointsExpired,
        reason: 'EXPIRATION',
        createdAt: now,
        expiresAt: new Date(now.getTime() + (365 * 24 * 60 * 60 * 1000)), // Não expira
        status: 'USED'
      });

      await loyalty.save();

      logger.info(`${pointsExpired} pontos expiraram para o usuário ${loyalty.userId}`);
    }

    return loyalty;
  } catch (error) {
    logger.error(`Erro ao processar pontos expirados para usuário ${loyalty.userId}:`, error);
    return loyalty;
  }
}

module.exports = {
  addPoints,
  usePoints,
  getUserPoints
};
