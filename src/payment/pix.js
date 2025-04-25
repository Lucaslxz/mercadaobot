/**
 * Sistema de pagamento via PIX
 */
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const QRCode = require('qrcode');
const config = require('../config');
const Payment = require('../models/payment');
const { logger } = require('../utils/helpers');
const auditLogger = require('../audit/logger');

/**
 * Gera uma chave PIX única para o pagamento
 * @private
 */
function _generatePixKey() {
  // Gerar identificador único para a transação
  const transactionId = uuidv4().replace(/-/g, '').substring(0, 16);

  // Adicionar prefixo para identificar no sistema
  return `DISCBOT${transactionId}`;
}

/**
 * Gera o código PIX para pagamento
 * @param {Object} paymentData - Dados do pagamento
 * @returns {string} - Código PIX no formato "Copia e Cola"
 * @private
 */
function _generatePixCode(paymentData) {
  // Esta é uma implementação simplificada
  // Em produção, deve seguir o padrão EMV do Banco Central
  const pixData = {
    keyType: config.payment.pix.keyType,
    keyValue: config.payment.pix.keyValue,
    name: "Bot de Vendas Discord",
    city: "São Paulo",
    txId: paymentData._id.toString().substring(0, 25),
    amount: paymentData.amount.toFixed(2),
    description: `Compra: ${paymentData.productName.substring(0, 30)}`
  };

  // Criar String do PIX (formato simplificado)
  return Buffer.from(JSON.stringify(pixData)).toString('base64');
}

/**
 * Gera URL de um QR Code para o pagamento PIX
 * @param {string} pixCode - Código PIX
 * @returns {Promise<string>} - URL do QR Code em data:image/png;base64
 * @private
 */
async function _generateQRCode(pixCode) {
  try {
    // Gerar QR code como data URL
    return await QRCode.toDataURL(pixCode, {
      errorCorrectionLevel: 'H',
      margin: 1,
      width: 300
    });
  } catch (error) {
    logger.error('Erro ao gerar QR Code:', error);
    // Retornar URL de um QR code genérico em caso de erro
    return 'https://i.imgur.com/placeholder-qr.png';
  }
}

/**
 * Cria um novo pagamento
 * @param {Object} paymentData - Dados do pagamento
 * @returns {Promise<Object>} - Dados do pagamento criado
 */
async function createPayment(paymentData) {
  try {
    // Calcular data de expiração
    const expirationTime = config.payment.expiration; // em segundos
    const expiresAt = new Date(Date.now() + expirationTime * 1000);

    // Verificar modelo de Payment a ser usado
    let newPayment;

    if (Payment.schema.obj.pixDetails) {
      // Usar modelo novo
      newPayment = new Payment({
        userId: paymentData.userId,
        userName: paymentData.userName,
        productId: paymentData.productId,
        productName: paymentData.productName,
        amount: paymentData.amount,
        method: 'PIX',
        status: 'PENDING',
        expiresAt: expiresAt,
        metadata: {
          ipAddress: paymentData.ipAddress,
          userAgent: paymentData.userAgent
        }
      });
    } else {
      // Usar modelo antigo
      newPayment = new Payment({
        userId: paymentData.userId,
        userName: paymentData.userName,
        productId: paymentData.productId,
        productName: paymentData.productName,
        amount: paymentData.amount,
        method: 'PIX',
        status: 'PENDING',
        expiresAt: expiresAt
      });
    }

    // Salvar para obter o ID
    await newPayment.save();

    // Gerar código PIX
    const pixCode = _generatePixCode(newPayment);

    // Gerar QR Code
    const qrCodeUrl = await _generateQRCode(pixCode);

    // Atualizar modelo com informações do PIX
    if (Payment.schema.obj.pixDetails) {
      // Modelo novo
      newPayment.pixDetails = {
        code: pixCode,
        qrCode: qrCodeUrl,
        transactionId: _generatePixKey()
      };
    } else {
      // Modelo antigo
      newPayment.pixCode = pixCode;
      newPayment.qrCodeUrl = qrCodeUrl;
    }

    // Salvar com as informações adicionais
    await newPayment.save();

    // Registrar na auditoria
    await auditLogger.log({
      action: 'PAYMENT_CREATED',
      category: 'TRANSACTION',
      severity: 'INFO',
      status: 'SUCCESS',
      user: {
        id: paymentData.userId,
        username: paymentData.userName
      },
      payment: {
        id: newPayment._id,
        amount: newPayment.amount,
        method: 'PIX'
      },
      product: {
        id: paymentData.productId,
        name: paymentData.productName
      }
    });

    logger.info(`Novo pagamento PIX criado: ${newPayment._id}`);
    return newPayment;
  } catch (error) {
    logger.error('Erro ao criar pagamento PIX:', error);
    throw error;
  }
}

/**
 * Verifica o status de um pagamento
 * @param {string} paymentId - ID do pagamento
 * @returns {Promise<Object>} - Status do pagamento
 */
async function checkPaymentStatus(paymentId) {
  try {
    const payment = await Payment.findById(paymentId);

    if (!payment) {
      return {
        success: false,
        message: 'Pagamento não encontrado'
      };
    }

    // Verificar se expirou
    if (payment.status === 'PENDING' && new Date() > payment.expiresAt) {
      payment.status = 'EXPIRED';
      await payment.save();

      // Registrar na auditoria
      await auditLogger.log({
        action: 'PAYMENT_EXPIRED',
        category: 'TRANSACTION',
        severity: 'INFO',
        status: 'SUCCESS',
        payment: {
          id: payment._id,
          amount: payment.amount
        }
      });
    }

    return {
      success: true,
      payment: {
        id: payment._id,
        status: payment.status,
        expiresAt: payment.expiresAt,
        amount: payment.amount,
        productName: payment.productName
      }
    };
  } catch (error) {
    logger.error(`Erro ao verificar status do pagamento ${paymentId}:`, error);
    return {
      success: false,
      message: 'Erro ao verificar pagamento'
    };
  }
}

/**
 * Cancela um pagamento pendente
 * @param {string} paymentId - ID do pagamento
 * @param {string} userId - ID do usuário
 * @returns {Promise<Object>} - Resultado da operação
 */
async function cancelPayment(paymentId, userId) {
  try {
    const payment = await Payment.findById(paymentId);

    if (!payment) {
      return {
        success: false,
        message: 'Pagamento não encontrado'
      };
    }

    // Verificar se o pagamento pertence ao usuário
    if (payment.userId !== userId) {
      return {
        success: false,
        message: 'Você não tem permissão para cancelar este pagamento'
      };
    }

    // Verificar se já está aprovado ou rejeitado
    if (payment.status === 'COMPLETED') {
      return {
        success: false,
        message: 'Pagamento já foi aprovado e não pode ser cancelado'
      };
    }

    if (payment.status === 'REJECTED' || payment.status === 'CANCELLED') {
      return {
        success: false,
        message: 'Pagamento já foi cancelado ou rejeitado'
      };
    }

    // Atualizar status
    payment.status = 'CANCELLED';

    // Atualizar informações de rejeição/cancelamento
    if (Payment.schema.obj.approvalInfo) {
      payment.approvalInfo = {
        ...payment.approvalInfo,
        rejectedAt: new Date(),
        rejectionReason: 'Cancelado pelo usuário'
      };
    } else {
      payment.rejectedAt = new Date();
      payment.rejectionReason = 'Cancelado pelo usuário';
    }

    await payment.save();

    // Registrar na auditoria
    await auditLogger.log({
      action: 'PAYMENT_CANCELLED',
      category: 'TRANSACTION',
      severity: 'INFO',
      status: 'SUCCESS',
      user: {
        id: userId
      },
      payment: {
        id: payment._id,
        amount: payment.amount,
        method: 'PIX'
      },
      product: {
        id: payment.productId,
        name: payment.productName
      }
    });

    logger.info(`Pagamento ${paymentId} cancelado por ${userId}`);
    return { success: true };
  } catch (error) {
    logger.error(`Erro ao cancelar pagamento ${paymentId}:`, error);
    return {
      success: false,
      message: 'Erro ao cancelar pagamento'
    };
  }
}

/**
 * Obtém pagamentos pendentes de um usuário
 * @param {string} userId - ID do usuário
 * @returns {Promise<Array>} - Lista de pagamentos pendentes
 */
async function getPendingPayments(userId) {
  try {
    const payments = await Payment.find({
      userId,
      status: 'PENDING',
      expiresAt: { $gt: new Date() }
    }).sort({ createdAt: -1 });

    return payments;
  } catch (error) {
    logger.error(`Erro ao obter pagamentos pendentes do usuário ${userId}:`, error);
    return [];
  }
}

/**
 * Atualiza o status de um pagamento após confirmação bancária
 * @param {string} paymentId - ID do pagamento
 * @param {Object} bankData - Dados bancários da confirmação
 * @returns {Promise<Object>} - Resultado da operação
 */
async function updatePaymentFromBank(paymentId, bankData) {
  try {
    const payment = await Payment.findById(paymentId);

    if (!payment) {
      return {
        success: false,
        message: 'Pagamento não encontrado'
      };
    }

    // Verificar se o pagamento já foi processado
    if (payment.status !== 'PENDING') {
      return {
        success: false,
        message: `Pagamento já está com status ${payment.status}`
      };
    }

    // Atualizar status baseado na resposta do banco
    if (bankData.status === 'approved' || bankData.status === 'completed') {
      // Pagamento confirmado pelo banco
      payment.status = 'PROCESSING'; // Aguardando aprovação manual

      if (Payment.schema.obj.bankInfo) {
        payment.bankInfo = bankData;
      }

      // Registrar na auditoria
      await auditLogger.log({
        action: 'PAYMENT_BANK_CONFIRMED',
        category: 'TRANSACTION',
        severity: 'INFO',
        status: 'SUCCESS',
        payment: {
          id: payment._id,
          amount: payment.amount
        },
        details: {
          transactionId: bankData.transactionId || '',
          receiptId: bankData.receiptId || ''
        }
      });

      logger.info(`Pagamento ${paymentId} confirmado pelo banco`);
    } else {
      // Pagamento rejeitado pelo banco
      payment.status = 'FAILED';

      if (Payment.schema.obj.approvalInfo) {
        payment.approvalInfo = {
          ...payment.approvalInfo,
          rejectedAt: new Date(),
          rejectionReason: `Rejeitado pelo banco: ${bankData.reason || 'Motivo não especificado'}`
        };
      } else {
        payment.rejectedAt = new Date();
        payment.rejectionReason = `Rejeitado pelo banco: ${bankData.reason || 'Motivo não especificado'}`;
      }

      // Registrar na auditoria
      await auditLogger.log({
        action: 'PAYMENT_BANK_REJECTED',
        category: 'TRANSACTION',
        severity: 'WARNING',
        status: 'ERROR',
        payment: {
          id: payment._id,
          amount: payment.amount
        },
        details: {
          reason: bankData.reason || 'Motivo não especificado'
        }
      });

      logger.warn(`Pagamento ${paymentId} rejeitado pelo banco: ${bankData.reason || 'Motivo não especificado'}`);
    }

    await payment.save();

    return {
      success: true,
      status: payment.status
    };
  } catch (error) {
    logger.error(`Erro ao atualizar pagamento ${paymentId} com dados bancários:`, error);
    return {
      success: false,
      message: 'Erro ao processar dados bancários'
    };
  }
}

module.exports = {
  createPayment,
  checkPaymentStatus,
  cancelPayment,
  getPendingPayments,
  updatePaymentFromBank
};
