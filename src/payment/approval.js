/**
 * Sistema de aprovação de pagamentos
 */

const Payment = require('../models/payment');
const Product = require('../models/product');
const userService = require('../user/profile');
const marketingService = require('../marketing/loyalty');
const { logger } = require('../utils/helpers');
const auditLogger = require('../audit/logger');
const config = require('../config');
const crypto = require('crypto');

/**
 * Gera credenciais de acesso para uma conta
 * @returns {Object} - Credenciais geradas
 * @private
 */
function _generateAccountCredentials() {
  // Gerar login e senha aleatórios
  const login = `user_${crypto.randomBytes(4).toString('hex')}`;
  const password = crypto.randomBytes(8).toString('base64').replace(/[\/\+=]/g, '');

  return {
    login,
    password
  };
}

/**
 * Aprova um pagamento pendente
 * @param {string} paymentId - ID do pagamento
 * @param {string} adminId - ID do administrador que aprovou
 * @returns {Promise<Object>} - Resultado da operação
 */
async function approvePayment(paymentId, adminId) {
  try {
    const payment = await Payment.findById(paymentId);

    if (!payment) {
      return {
        success: false,
        message: 'Pagamento não encontrado',
        payment: null
      };
    }

    // Verificar se já está aprovado ou rejeitado
    if (payment.status === 'COMPLETED') {
      return {
        success: false,
        message: 'Pagamento já foi aprovado anteriormente',
        payment
      };
    }

    if (payment.status === 'REJECTED') {
      return {
        success: false,
        message: 'Pagamento já foi rejeitado e não pode ser aprovado',
        payment
      };
    }

    if (payment.status === 'EXPIRED') {
      return {
        success: false,
        message: 'Pagamento expirado e não pode ser aprovado',
        payment
      };
    }

    // Verificar se o produto ainda está disponível
    const product = await Product.findById(payment.productId);

    if (!product) {
      payment.status = 'REJECTED';
      payment.rejectedAt = new Date();
      payment.rejectionReason = 'Produto não encontrado';
      await payment.save();

      return {
        success: false,
        message: 'Produto não encontrado ou não está mais disponível',
        payment
      };
    }

    if (!product.disponivel || product.vendido) {
      payment.status = 'REJECTED';
      payment.rejectedAt = new Date();
      payment.rejectionReason = 'Produto não está mais disponível';
      await payment.save();

      return {
        success: false,
        message: 'Produto não está mais disponível',
        payment
      };
    }

    // Gerar credenciais da conta
    const accountCredentials = _generateAccountCredentials();

    // Atualizar pagamento
    payment.status = 'COMPLETED';
    payment.completedAt = new Date();
    payment.approvedBy = adminId;
    payment.deliveryData = accountCredentials;

    await payment.save();

    // Marcar produto como vendido
    product.vendido = true;
    product.disponivel = false;
    product.dataVenda = new Date();
    product.compradoPor = payment.userId;
    await product.save();

    // Registrar atividade para o usuário
    await userService.recordActivity(payment.userId, 'PRODUCT_PURCHASE', {
      productId: product._id,
      productName: product.nome,
      paymentId: payment._id,
      amount: payment.amount
    });

    // Adicionar pontos de fidelidade
    const loyaltyPoints = Math.floor(payment.amount);
    await marketingService.addPoints(payment.userId, loyaltyPoints, 'PURCHASE', {
      paymentId: payment._id,
      productId: product._id
    });

    // Registrar na auditoria
    await auditLogger.log({
      action: 'PAYMENT_APPROVED',
      category: 'TRANSACTION',
      severity: 'INFO',
      status: 'SUCCESS',
      user: {
        id: adminId
      },
      target: {
        id: payment.userId,
        username: payment.userName
      },
      payment: {
        id: payment._id,
        amount: payment.amount
      },
      product: {
        id: product._id,
        name: product.nome
      }
    });

    logger.info(`Pagamento ${paymentId} aprovado por ${adminId}`);
    return {
      success: true,
      payment,
      accountCredentials
    };
  } catch (error) {
    logger.error(`Erro ao aprovar pagamento ${paymentId}:`, error);
    return {
      success: false,
      message: 'Erro ao processar aprovação',
      payment: null
    };
  }
}

/**
 * Rejeita um pagamento pendente
 * @param {string} paymentId - ID do pagamento
 * @param {string} reason - Motivo da rejeição
 * @param {string} adminId - ID do administrador que rejeitou
 * @returns {Promise<Object>} - Resultado da operação
 */
async function rejectPayment(paymentId, reason, adminId) {
  try {
    const payment = await Payment.findById(paymentId);

    if (!payment) {
      return {
        success: false,
        message: 'Pagamento não encontrado',
        payment: null
      };
    }

    // Verificar se já está aprovado ou rejeitado
    if (payment.status === 'COMPLETED') {
      return {
        success: false,
        message: 'Pagamento já foi aprovado e não pode ser rejeitado',
        payment
      };
    }

    if (payment.status === 'REJECTED') {
      return {
        success: false,
        message: 'Pagamento já foi rejeitado anteriormente',
        payment
      };
    }

    // Atualizar pagamento
    payment.status = 'REJECTED';
    payment.rejectedAt = new Date();
    payment.rejectionReason = reason;
    payment.rejectedBy = adminId;

    await payment.save();

    // Registrar atividade para o usuário
    await userService.recordActivity(payment.userId, 'PAYMENT_REJECTED', {
      paymentId: payment._id,
      productId: payment.productId,
      reason
    });

    // Registrar na auditoria
    await auditLogger.log({
      action: 'PAYMENT_REJECTED',
      category: 'TRANSACTION',
      severity: 'WARNING',
      status: 'SUCCESS',
      user: {
        id: adminId
      },
      target: {
        id: payment.userId,
        username: payment.userName
      },
      payment: {
        id: payment._id,
        amount: payment.amount
      },
      product: {
        id: payment.productId,
        name: payment.productName
      },
      details: {
        reason
      }
    });

    logger.info(`Pagamento ${paymentId} rejeitado por ${adminId}: ${reason}`);
    return {
      success: true,
      payment
    };
  } catch (error) {
    logger.error(`Erro ao rejeitar pagamento ${paymentId}:`, error);
    return {
      success: false,
      message: 'Erro ao processar rejeição',
      payment: null
    };
  }
}

/**
 * Obtém pagamentos pendentes para aprovação
 * @returns {Promise<Array>} - Lista de pagamentos pendentes
 */
async function getPendingApprovals() {
  try {
    const pendingPayments = await Payment.find({
      status: 'PENDING',
      expiresAt: { $gt: new Date() }
    })
    .sort({ createdAt: -1 })
    .populate('productId', 'nome tipo preco');

    return pendingPayments;
  } catch (error) {
    logger.error('Erro ao obter pagamentos pendentes para aprovação:', error);
    return [];
  }
}

/**
 * Obtém detalhes de um pagamento específico
 * @param {string} paymentId - ID do pagamento
 * @returns {Promise<Object>} - Dados do pagamento
 */
async function getPaymentDetails(paymentId) {
  try {
    const payment = await Payment.findById(paymentId)
      .populate('productId', 'nome tipo preco detalhes disponivel vendido');

    if (!payment) {
      return null;
    }

    return payment;
  } catch (error) {
    logger.error(`Erro ao obter detalhes do pagamento ${paymentId}:`, error);
    return null;
  }
}

module.exports = {
  approvePayment,
  rejectPayment,
  getPendingApprovals,
  getPaymentDetails
};
