/**
 * Sistema de detecção de fraudes para compras
 */

const { logger } = require('../utils/helpers');
const userService = require('../user/profile');
const cache = require('../utils/cache');

/**
 * Sistema de detecção de fraudes que utiliza regras e padrões
 * para identificar tentativas de compra suspeitas
 */
class FraudDetectionSystem {
  constructor() {
    this.riskThresholds = {
      low: 30,
      medium: 60,
      high: 80
    };

    this.cacheKey = 'fraud:assessment:';
    this.cacheTTL = 3600; // 1 hora

    // Lista de domínios de email suspeitos
    this.suspiciousEmailDomains = [
      'tempmail.com', 'disposable.com', 'mailinator.com',
      'guerrillamail.com', 'yopmail.com', 'throwawaymail.com'
    ];

    // Lista de padrões de compra suspeitos
    this.suspiciousPatterns = [
      'multiple_accounts_short_time',
      'rapid_purchases',
      'payment_failed_retry',
      'vpn_usage',
      'location_mismatch',
      'unusual_time'
    ];
  }

  /**
   * Avalia o risco de fraude para um usuário
   * @param {string} userId - ID do usuário
   * @returns {Promise<Object>} - Avaliação de risco
   */
  async assessUserRisk(userId) {
    try {
      // Verificar cache
      const cacheKey = `${this.cacheKey}${userId}`;
      const cachedAssessment = await cache.get(cacheKey);

      if (cachedAssessment) {
        logger.debug(`Usando avaliação de risco em cache para usuário ${userId}`);
        return cachedAssessment;
      }

      // Obter dados do usuário
      const userProfile = await userService.getUserProfile(userId);

      if (!userProfile) {
        // Usuário novo ou não encontrado, considerar risco médio
        const assessment = {
          risk: 'medium',
          score: 50,
          factors: ['new_user', 'unknown_profile'],
          timestamp: new Date()
        };

        await cache.set(cacheKey, assessment, this.cacheTTL);
        return assessment;
      }

      // Obter histórico de atividades do usuário
      const userHistory = await userService.getUserHistory(userId, 100); // últimas 100 ações

      // Calcular pontuação de risco
      const riskScore = this._calculateRiskScore(userProfile, userHistory);

      // Determinar nível de risco
      let riskLevel;
      if (riskScore >= this.riskThresholds.high) {
        riskLevel = 'high';
      } else if (riskScore >= this.riskThresholds.medium) {
        riskLevel = 'medium';
      } else {
        riskLevel = 'low';
      }

      // Identificar fatores de risco
      const riskFactors = this._identifyRiskFactors(userProfile, userHistory, riskScore);

      // Criar avaliação de risco
      const assessment = {
        risk: riskLevel,
        score: riskScore,
        factors: riskFactors,
        timestamp: new Date()
      };

      // Salvar em cache
      await cache.set(cacheKey, assessment, this.cacheTTL);

      return assessment;
    } catch (error) {
      logger.error('Erro ao avaliar risco de fraude:', error);

      // Em caso de erro, retornar risco baixo para não bloquear usuários indevidamente
      return {
        risk: 'low',
        score: 0,
        factors: ['assessment_error'],
        timestamp: new Date()
      };
    }
  }

  /**
   * Verifica se uma transação específica é suspeita
   * @param {object} transaction - Detalhes da transação
   * @returns {Promise<Object>} - Resultado da verificação
   */
  async checkTransaction(transaction) {
    try {
      const { userId, productId, amount, paymentMethod, ipAddress } = transaction;

      // Obter avaliação de risco do usuário
      const userRisk = await this.assessUserRisk(userId);

      // Se o usuário já é de alto risco, bloquear transação
      if (userRisk.risk === 'high') {
        return {
          approved: false,
          score: userRisk.score,
          reasons: userRisk.factors
        };
      }

      // Verificar padrões específicos da transação
      const transactionRiskFactors = [];

      // Verificar valor anômalo (muito acima do histórico do usuário)
      const userHistory = await userService.getPurchaseHistory(userId);
      if (userHistory.length > 0) {
        const avgAmount = userHistory.reduce((sum, purchase) => sum + purchase.amount, 0) / userHistory.length;
        if (amount > avgAmount * 3) {
          transactionRiskFactors.push('amount_much_higher_than_average');
        }
      }

      // Verificar se é uma compra repetida
      const recentPurchases = userHistory.filter(p =>
        p.productId === productId &&
        (new Date() - new Date(p.date)) < 1000 * 60 * 60 * 24 * 7 // 7 dias
      );

      if (recentPurchases.length > 0) {
        transactionRiskFactors.push('repeated_purchase');
      }

      // Verificar métodos de pagamento suspeitos
      // (exemplo: usuário que sempre usa PIX agora tenta outro método)
      if (paymentMethod !== 'PIX' && userHistory.length > 0) {
        const hasOnlyPixPayments = userHistory.every(p => p.method === 'PIX');
        if (hasOnlyPixPayments) {
          transactionRiskFactors.push('unusual_payment_method');
        }
      }

      // Verificar IP suspeito
      if (ipAddress) {
        // Verificar se o IP é diferente dos últimos usados
        const userActivities = await userService.getUserHistory(userId, 50);
        const previousIPs = new Set();

        userActivities.forEach(activity => {
          if (activity.data && activity.data.ipAddress) {
            previousIPs.add(activity.data.ipAddress);
          }
        });

        if (previousIPs.size > 0 && !previousIPs.has(ipAddress)) {
          transactionRiskFactors.push('new_ip_address');
        }
      }

      // Combinar fatores de risco do usuário e da transação
      const allFactors = [...userRisk.factors, ...transactionRiskFactors];

      // Calcular pontuação final
      const finalScore = userRisk.score + (transactionRiskFactors.length * 15);

      // Determinar se deve aprovar
      const approved = finalScore < this.riskThresholds.high;

      return {
        approved,
        score: finalScore,
        reasons: allFactors
      };
    } catch (error) {
      logger.error('Erro ao verificar transação:', error);

      // Em caso de erro, aprovar para não prejudicar usuários legítimos
      return {
        approved: true,
        score: 0,
        reasons: ['verification_error']
      };
    }
  }

  /**
   * Registra uma transação fraudulenta confirmada
   * @param {object} fraudData - Dados da fraude
   * @returns {Promise<boolean>} - Status da operação
   */
  async reportFraud(fraudData) {
    try {
      const { userId, transactionId, fraudType, evidence } = fraudData;

      // Registrar fraude para o usuário
      await userService.recordActivity(userId, 'FRAUD_DETECTED', {
        transactionId,
        fraudType,
        evidence,
        timestamp: new Date()
      });

      // Invalidar cache de avaliação de risco
      await cache.del(`${this.cacheKey}${userId}`);

      // Adicionar usuário à lista negra
      await this._addToBlacklist(userId, fraudType, evidence);

      logger.info(`Fraude registrada: usuário ${userId}, transação ${transactionId}, tipo ${fraudType}`);
      return true;
    } catch (error) {
      logger.error('Erro ao registrar fraude:', error);
      return false;
    }
  }

  // Métodos privados auxiliares

  /**
   * Calcula uma pontuação de risco para o usuário
   * @param {Object} userProfile - Perfil do usuário
   * @param {Array} userHistory - Histórico de atividades
   * @returns {number} - Pontuação de risco
   * @private
   */
  _calculateRiskScore(userProfile, userHistory) {
    let score = 0;

    // Fator: idade da conta
    const accountAge = (new Date() - new Date(userProfile.createdAt)) / (1000 * 60 * 60 * 24); // em dias
    if (accountAge < 1) {
      score += 30; // Conta muito nova (menos de 1 dia)
    } else if (accountAge < 7) {
      score += 20; // Conta nova (menos de 1 semana)
    } else if (accountAge < 30) {
      score += 10; // Conta relativamente nova (menos de 1 mês)
    }

    // Fator: email suspeito
    if (userProfile.email) {
      const emailDomain = userProfile.email.split('@')[1].toLowerCase();
      if (this.suspiciousEmailDomains.includes(emailDomain)) {
        score += 25;
      }
    }

    // Fator: atividade do usuário
    if (!userHistory || userHistory.length === 0) {
      score += 15; // Sem histórico de atividades
    } else {
      // Fator: histórico de tentativas de compra
      const purchaseAttempts = userHistory.filter(action =>
        action.action === 'PAYMENT_INITIATED'
      );

      const successfulPurchases = userHistory.filter(action =>
        action.action === 'PAYMENT_COMPLETED' ||
        action.action === 'PRODUCT_PURCHASE'
      );

      // Muitas tentativas, poucas compras concluídas
      if (purchaseAttempts.length > 5 && successfulPurchases.length / purchaseAttempts.length < 0.3) {
        score += 15;
      }

      // Fator: histórico de feedback negativo
      const negativeReports = userHistory.filter(action =>
        action.action === 'REPORTED_BY_ADMIN'
      );

      if (negativeReports.length > 0) {
        score += 40; // Usuário já foi reportado antes
      }

      // Fator: compras em curto intervalo de tempo
      const recentPurchases = purchaseAttempts.filter(action =>
        (new Date() - new Date(action.timestamp)) < 1000 * 60 * 60 // última hora
      );

      if (recentPurchases.length >= 3) {
        score += 20; // 3 ou mais tentativas na última hora
      }
    }

    // Fator: usuário bloqueado
    if (userProfile.isBlocked) {
      score += 100; // Conta bloqueada = risco máximo
    }

    return Math.min(score, 100); // Máximo 100
  }

  /**
   * Identifica fatores de risco específicos
   * @param {Object} userProfile - Perfil do usuário
   * @param {Array} userHistory - Histórico de atividades
   * @param {number} riskScore - Pontuação de risco calculada
   * @returns {Array} - Lista de fatores de risco
   * @private
   */
  _identifyRiskFactors(userProfile, userHistory, riskScore) {
    const factors = [];

    // Verificar idade da conta
    const accountAge = (new Date() - new Date(userProfile.createdAt)) / (1000 * 60 * 60 * 24); // em dias
    if (accountAge < 1) {
      factors.push('very_new_account');
    } else if (accountAge < 7) {
      factors.push('new_account');
    }

    // Verificar email suspeito
    if (userProfile.email) {
      const emailDomain = userProfile.email.split('@')[1].toLowerCase();
      if (this.suspiciousEmailDomains.includes(emailDomain)) {
        factors.push('suspicious_email_domain');
      }
    }

    // Verificar se o usuário está bloqueado
    if (userProfile.isBlocked) {
      factors.push('account_blocked');
      factors.push(userProfile.blockReason || 'unknown_block_reason');
    }

    // Verificar histórico (se existir)
    if (userHistory && userHistory.length > 0) {
      // Verificar múltiplas tentativas
      const purchaseAttempts = userHistory.filter(action =>
        action.action === 'PAYMENT_INITIATED'
      );

      const successfulPurchases = userHistory.filter(action =>
        action.action === 'PAYMENT_COMPLETED' ||
        action.action === 'PRODUCT_PURCHASE'
      );

      // Muitas tentativas, poucas compras concluídas
      if (purchaseAttempts.length > 5 && successfulPurchases.length / purchaseAttempts.length < 0.3) {
        factors.push('high_failure_rate');
      }

      // Verificar compras rápidas
      const recentPurchases = purchaseAttempts.filter(action =>
        (new Date() - new Date(action.timestamp)) < 1000 * 60 * 60 // última hora
      );

      if (recentPurchases.length >= 3) {
        factors.push('rapid_purchase_attempts');
      }

      // Verificar se já foi reportado
      const hasReports = userHistory.some(action => action.action === 'REPORTED_BY_ADMIN');
      if (hasReports) {
        factors.push('previously_reported');
      }
    } else {
      factors.push('no_activity_history');
    }

    return factors;
  }

  /**
   * Adiciona um usuário à lista negra
   * @param {string} userId - ID do usuário
   * @param {string} fraudType - Tipo de fraude
   * @param {Object} evidence - Evidências da fraude
   * @returns {Promise<void>}
   * @private
   */
  async _addToBlacklist(userId, fraudType, evidence) {
    try {
      await userService.updateUserStatus(userId, 'BLACKLISTED', {
        reason: fraudType,
        evidence,
        timestamp: new Date()
      });

      logger.info(`Usuário ${userId} adicionado à lista negra. Motivo: ${fraudType}`);
    } catch (error) {
      logger.error(`Erro ao adicionar usuário ${userId} à lista negra:`, error);
    }
  }
}

// Criar instância do sistema de detecção de fraudes
const fraudDetectionSystem = new FraudDetectionSystem();

// Exportar funções públicas
module.exports = {
  /**
   * Avalia o risco de um usuário realizar fraudes
   * @param {string} userId - ID do usuário
   * @returns {Promise<Object>} - Resultado da avaliação {risk, score, factors}
   */
  assessUserRisk: async (userId) => {
    return await fraudDetectionSystem.assessUserRisk(userId);
  },

  /**
   * Verifica se uma transação específica pode ser fraudulenta
   * @param {object} transaction - Dados da transação
   * @returns {Promise<Object>} - Resultado da verificação {approved, score, reasons}
   */
  verifyTransaction: async (transaction) => {
    return await fraudDetectionSystem.checkTransaction(transaction);
  },

  /**
   * Registra uma fraude confirmada
   * @param {object} fraudData - Dados sobre a fraude
   * @returns {Promise<boolean>} - Status da operação
   */
  reportFraud: async (fraudData) => {
    return await fraudDetectionSystem.reportFraud(fraudData);
  }
};
