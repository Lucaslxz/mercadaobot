const cron = require('node-cron');
const mongoose = require('mongoose');
const { logger } = require('./src/utils/helpers');
const config = require('./src/config');
const lztService = require('./src/product/lzt');
const auditLogger = require('./src/audit/logger');
const paymentService = require('./src/payment/pix');
const productService = require('./src/product/catalog');

class CronJobManager {
  constructor() {
    this.jobs = [];
  }

  /**
   * Inicializa todas as tarefas agendadas
   */
  async start() {
    try {
      // Conectar ao banco de dados
      await mongoose.connect(config.database.uri, config.database.options);
      logger.info('Conexão com o banco de dados estabelecida para tarefas agendadas');

      // Sincronização de produtos do LZT Market (a cada 15 minutos)
      this.scheduleJob('*/15 * * * *', async () => {
        logger.info('Executando sincronização de produtos do LZT Market...');
        try {
          const result = await lztService.syncProducts();
          logger.info(`Sincronização concluída: ${result.added} adicionados, ${result.updated} atualizados`);
        } catch (error) {
          logger.error('Erro na sincronização de produtos:', error);
        }
      });

      // Limpeza de logs antigos (diariamente à 1h)
      this.scheduleJob('0 1 * * *', async () => {
        logger.info('Executando limpeza de logs antigos...');
        try {
          const result = await auditLogger.cleanupOldLogs();
          logger.info(`Limpeza de logs concluída: ${result.deletedCount} logs removidos`);
        } catch (error) {
          logger.error('Erro na limpeza de logs:', error);
        }
      });

      // Verificação e expiração de pagamentos pendentes (a cada hora)
      this.scheduleJob('0 * * * *', async () => {
        logger.info('Verificando pagamentos pendentes e expirados...');
        try {
          const Payment = require('./src/models/payment');
          const now = new Date();

          // Buscar pagamentos pendentes expirados
          const expiredPayments = await Payment.find({
            status: 'PENDING',
            expiresAt: { $lt: now }
          });

          logger.info(`${expiredPayments.length} pagamentos expirados encontrados`);

          // Processar pagamentos expirados
          for (const payment of expiredPayments) {
            try {
              payment.status = 'EXPIRED';
              await payment.save();

              // Registrar no log de auditoria
              await auditLogger.log({
                action: 'PAYMENT_EXPIRED',
                category: 'TRANSACTION',
                severity: 'WARNING',
                status: 'SUCCESS',
                payment: {
                  id: payment._id,
                  amount: payment.amount
                }
              });

              logger.debug(`Pagamento ${payment._id} marcado como expirado`);
            } catch (processError) {
              logger.error(`Erro ao processar pagamento expirado ${payment._id}:`, processError);
            }
          }
        } catch (error) {
          logger.error('Erro ao processar pagamentos expirados:', error);
        }
      });

      // Verificação de produtos próximos de esgotar (diariamente)
      this.scheduleJob('0 9 * * *', async () => {
        logger.info('Verificando produtos com estoque baixo...');
        try {
          const lowStockProducts = await productService.getLowStockProducts();

          if (lowStockProducts.length > 0) {
            logger.warn(`Produtos com estoque baixo: ${lowStockProducts.length}`);

            // Enviar notificação para administradores
            await this.sendLowStockNotification(lowStockProducts);
          }
        } catch (error) {
          logger.error('Erro ao verificar produtos com estoque baixo:', error);
        }
      });

      logger.info('Todas as tarefas agendadas inicializadas com sucesso');
    } catch (error) {
      logger.error('Erro fatal ao inicializar tarefas agendadas:', error);
      process.exit(1);
    }
  }

  /**
   * Agenda uma tarefa
   * @param {string} schedule - Expressão cron
   * @param {Function} job - Função a ser executada
   */
  scheduleJob(schedule, job) {
    const scheduledJob = cron.schedule(schedule, job, {
      scheduled: true,
      timezone: "America/Sao_Paulo"
    });
    this.jobs.push(scheduledJob);
  }

  /**
   * Envia notificação de produtos com estoque baixo
   * @param {Array} lowStockProducts - Lista de produtos com estoque baixo
   */
  async sendLowStockNotification(lowStockProducts) {
    try {
      // Implementar lógica de notificação (e-mail, Discord, etc)
      logger.info('Notificação de estoque baixo enviada');

      // Log de auditoria
      await auditLogger.log({
        action: 'LOW_STOCK_ALERT',
        category: 'INVENTORY',
        severity: 'WARNING',
        status: 'INFO',
        details: {
          productCount: lowStockProducts.length,
          products: lowStockProducts.map(p => ({
            id: p._id,
            name: p.nome,
            currentStock: p.quantidade
          }))
        }
      });
    } catch (error) {
      logger.error('Erro ao enviar notificação de estoque baixo:', error);
    }
  }

  /**
   * Encerra todas as tarefas agendadas
   */
  async stop() {
    try {
      // Parar todos os jobs
      this.jobs.forEach(job => job.stop());

      // Fechar conexão com banco de dados
      await mongoose.connection.close();

      logger.info('Tarefas agendadas encerradas com sucesso');
    } catch (error) {
      logger.error('Erro ao encerrar tarefas agendadas:', error);
    }
  }
}

// Instanciar e iniciar o gerenciador de jobs
const cronJobManager = new CronJobManager();

// Exportar para permitir inicialização programática
module.exports = cronJobManager;

// Se rodado diretamente, iniciar jobs
if (require.main === module) {
  cronJobManager.start().catch(error => {
    console.error('Erro ao iniciar tarefas agendadas:', error);
    process.exit(1);
  });
}
