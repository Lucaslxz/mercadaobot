// src/user/profile.js
const User = require('../models/user');
const db = require('../utils/db');
const { logger } = require('../utils/helpers');

/**
 * Cria ou atualiza o perfil de um usuário
 * @param {Object} userData - Dados do usuário
 * @returns {Promise<Object>} - Perfil do usuário
 */
async function createUserProfile(userData) {
  try {
    // Verificar se o usuário já existe
    const existingUser = await User.findOne({ userId: userData.userId });

    if (existingUser) {
      // Atualizar dados existentes
      Object.assign(existingUser, {
        username: userData.username,
        lastActive: new Date()
      });

      // Atualizar outros campos se fornecidos
      if (userData.email) existingUser.email = userData.email;
      if (userData.preferences) existingUser.preferences = userData.preferences;

      await existingUser.save();
      logger.debug(`Perfil do usuário ${userData.userId} atualizado`);
      return existingUser;
    }

    // Criar novo usuário
    const newUser = new User({
      userId: userData.userId,
      username: userData.username,
      email: userData.email,
      createdAt: userData.createdAt || new Date(),
      preferences: userData.preferences || {}
    });

    await newUser.save();
    logger.info(`Novo perfil de usuário criado para ${userData.userId}`);
    return newUser;
  } catch (error) {
    logger.error(`Erro ao criar/atualizar perfil de usuário ${userData.userId}:`, error);
    throw error;
  }
}

/**
 * Obtém o perfil de um usuário
 * @param {string} userId - ID do usuário
 * @returns {Promise<Object>} - Perfil do usuário
 */
async function getUserProfile(userId) {
  try {
    const user = await User.findOne({ userId })
      .select('-activities'); // Exclui o histórico para performance

    if (user) {
      // Atualizar última atividade
      user.lastActive = new Date();
      await user.save();
    }

    return user;
  } catch (error) {
    logger.error(`Erro ao obter perfil do usuário ${userId}:`, error);
    throw error;
  }
}

/**
 * Registra uma atividade no histórico do usuário
 * @param {string} userId - ID do usuário
 * @param {string} action - Tipo de ação
 * @param {Object} data - Dados da ação
 * @returns {Promise<boolean>} - Status da operação
 */
async function recordActivity(userId, action, data = {}) {
  try {
    // Verificar se o usuário existe
    let user = await User.findOne({ userId });

    if (!user) {
      // Criar perfil caso não exista
      user = await createUserProfile({
        userId,
        username: userId, // Placeholder até obter o username real
        createdAt: new Date()
      });
    }

    // Adicionar atividade ao histórico
    const activity = {
      action,
      timestamp: new Date(),
      data
    };

    // Adicionar à array de atividades
    user.activities.push(activity);

    // Limitar tamanho do histórico (manter últimas 100 atividades)
    if (user.activities.length > 100) {
      user.activities = user.activities.slice(-100);
    }

    // Atualizar timestamp de última atividade
    user.lastActive = new Date();

    await user.save();
    logger.debug(`Atividade ${action} registrada para usuário ${userId}`);
    return true;
  } catch (error) {
    logger.error(`Erro ao registrar atividade ${action} para usuário ${userId}:`, error);
    return false;
  }
}

/**
 * Obtém o histórico de atividades de um usuário
 * @param {string} userId - ID do usuário
 * @param {number} limit - Limite de atividades para retornar
 * @returns {Promise<Array>} - Histórico de atividades
 */
async function getUserHistory(userId, limit = 50) {
  try {
    const user = await User.findOne({ userId })
      .select('activities')
      .sort({ 'activities.timestamp': -1 });

    if (!user) return [];

    // Retornar atividades com limite e ordenadas por data (mais recentes primeiro)
    return user.activities
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit);
  } catch (error) {
    logger.error(`Erro ao obter histórico do usuário ${userId}:`, error);
    throw error;
  }
}

/**
 * Obtém o histórico de compras de um usuário
 * @param {string} userId - ID do usuário
 * @returns {Promise<Array>} - Histórico de compras
 */
async function getPurchaseHistory(userId) {
  try {
    const Payment = require('../models/payment');

    // Buscar pagamentos aprovados
    const payments = await Payment.find({
      userId,
      status: 'COMPLETED'
    }).sort({ completedAt: -1 });

    // Transformar em formato mais amigável
    return payments.map(payment => ({
      paymentId: payment._id,
      productId: payment.productId,
      productName: payment.productName,
      amount: payment.amount,
      date: payment.completedAt || payment.createdAt,
      method: payment.method
    }));
  } catch (error) {
    logger.error(`Erro ao obter histórico de compras do usuário ${userId}:`, error);
    return [];
  }
}

/**
 * Registra feedback do usuário
 * @param {string} userId - ID do usuário
 * @param {string} feedback - Texto do feedback
 * @returns {Promise<boolean>} - Status da operação
 */
async function recordFeedback(userId, feedback) {
  return await recordActivity(userId, 'FEEDBACK_SUBMITTED', { feedback });
}

/**
 * Bloqueia um usuário
 * @param {string} userId - ID do usuário
 * @param {string} reason - Motivo do bloqueio
 * @param {string} adminId - ID do admin que realizou o bloqueio
 * @returns {Promise<Object>} - Resultado da operação
 */
async function blockUser(userId, reason, adminId) {
  try {
    const user = await User.findOne({ userId });

    if (!user) {
      return { success: false, message: 'Usuário não encontrado' };
    }

    // Atualizar status de bloqueio
    user.isBlocked = true;
    user.blockReason = reason;
    user.blockedBy = adminId;
    user.blockDate = new Date();

    await user.save();

    logger.info(`Usuário ${userId} bloqueado por ${adminId}. Motivo: ${reason}`);
    return {
      success: true,
      user: {
        userId: user.userId,
        username: user.username,
        blockDate: user.blockDate
      }
    };
  } catch (error) {
    logger.error(`Erro ao bloquear usuário ${userId}:`, error);
    return { success: false, message: error.message };
  }
}

/**
 * Desbloqueia um usuário
 * @param {string} userId - ID do usuário
 * @param {string} adminId - ID do admin que realizou o desbloqueio
 * @returns {Promise<Object>} - Resultado da operação
 */
async function unblockUser(userId, adminId) {
  try {
    const user = await User.findOne({ userId });

    if (!user) {
      return { success: false, message: 'Usuário não encontrado' };
    }

    // Verificar se está bloqueado
    if (!user.isBlocked) {
      return { success: false, message: 'Usuário não está bloqueado' };
    }

    // Registrar atividade de desbloqueio
    await recordActivity(userId, 'USER_UNBLOCKED', {
      adminId,
      previousReason: user.blockReason
    });

    // Atualizar status
    user.isBlocked = false;
    user.blockReason = null;
    user.blockDate = null;

    await user.save();

    logger.info(`Usuário ${userId} desbloqueado por ${adminId}`);
    return { success: true };
  } catch (error) {
    logger.error(`Erro ao desbloquear usuário ${userId}:`, error);
    return { success: false, message: error.message };
  }
}

/**
 * Atualiza as preferências de um usuário
 * @param {string} userId - ID do usuário
 * @param {Object} preferences - Novas preferências
 * @returns {Promise<Object>} - Resultado da operação
 */
async function updateUserPreferences(userId, preferences) {
  try {
    const user = await User.findOne({ userId });

    if (!user) {
      return { success: false, message: 'Usuário não encontrado' };
    }

    // Mesclar novas preferências com as existentes
    user.preferences = {
      ...user.preferences,
      ...preferences
    };

    await user.save();

    return {
      success: true,
      preferences: user.preferences
    };
  } catch (error) {
    logger.error(`Erro ao atualizar preferências do usuário ${userId}:`, error);
    return { success: false, message: error.message };
  }
}

/**
 * Atualiza o status de um usuário com dados adicionais
 * @param {string} userId - ID do usuário
 * @param {string} status - Novo status
 * @param {Object} data - Dados adicionais
 * @returns {Promise<Object>} - Resultado da operação
 */
async function updateUserStatus(userId, status, data = {}) {
  try {
    const user = await User.findOne({ userId });

    if (!user) {
      return { success: false, message: 'Usuário não encontrado' };
    }

    // Registrar atividade com o novo status
    await recordActivity(userId, `STATUS_${status}`, data);

    // Casos especiais de status
    if (status === 'BLACKLISTED') {
      user.isBlocked = true;
      user.blockReason = data.reason || 'Adicionado à lista negra';
      user.blockedBy = data.adminId || 'SYSTEM';
      user.blockDate = new Date();
    }

    await user.save();

    logger.info(`Status do usuário ${userId} atualizado para ${status}`);
    return { success: true };
  } catch (error) {
    logger.error(`Erro ao atualizar status do usuário ${userId}:`, error);
    return { success: false, message: error.message };
  }
}

module.exports = {
  createUserProfile,
  getUserProfile,
  recordActivity,
  getUserHistory,
  getPurchaseHistory,
  recordFeedback,
  blockUser,
  unblockUser,
  updateUserPreferences,
  updateUserStatus
};
