/**
 * Manipulador centralizado de interações do Discord (botões, menus, modais)
 * Versão otimizada para melhor performance e manutenção
 */

const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ChannelType,
  PermissionFlagsBits
} = require('discord.js');

const config = require('../config');
const productService = require('../product/catalog');
const paymentService = require('../payment/pix');
const approvalService = require('../payment/approval');
const userService = require('../user/profile');
const assistantService = require('../ai/assistant');
const recommendationService = require('../ai/recommendation');
const auditLogger = require('../audit/logger');
const loyaltyService = require('../marketing/loyalty');
const { logger } = require('../utils/helpers');

/**
 * Manipulador central para todas as interações
 */
class InteractionHandler {
  constructor() {
    // Mapeamento de tipos de interação para seus handlers
    this.handlers = {
      button: this.handleButtonInteraction.bind(this),
      selectMenu: this.handleSelectMenuInteraction.bind(this),
      modal: this.handleModalSubmitInteraction.bind(this)
    };

    // Mapeamento de IDs de botões para suas funções handlers
    this.buttonHandlers = new Map([
      // Produtos
      ['view_product_', this.showProductDetails.bind(this)],
      ['buy_', this.handleBuyProduct.bind(this)],
      ['recommend_similar_', this.showSimilarProducts.bind(this)],
      ['browse_all_products', this.handleBrowseProducts.bind(this)],
      ['filter_', this.handleProductFilter.bind(this)],

      // Pagamentos
      ['pix_tutorial', this.showPixTutorial.bind(this)],
      ['cancel_payment_', this.cancelPayment.bind(this)],
      ['approve_payment_', this.approvePayment.bind(this)],
      ['reject_payment_', this.showRejectPaymentModal.bind(this)],

      // Admin produtos
      ['confirm_remove_', this.confirmRemoveProduct.bind(this)],
      ['cancel_remove', this.cancelRemoveProduct.bind(this)],
      ['add_details_', this.showAddDetailsModal.bind(this)],

      // Assistente
      ['assistant_helpful_', this.assistantFeedbackPositive.bind(this)],
      ['assistant_not_helpful_', this.assistantFeedbackNegative.bind(this)],
      ['assistant_talk_human', this.createSupportTicket.bind(this)],

      // Tickets
      ['create_ticket', this.createSupportTicket.bind(this)],
      ['close_ticket', this.closeTicket.bind(this)],

      // Perfil e fidelidade
      ['view_profile', this.showProfile.bind(this)],
      ['view_all_purchases', this.showFullPurchaseHistory.bind(this)],
      ['view_points_history', this.showPointsHistory.bind(this)],
      ['redeem_points', this.showRedeemPointsOptions.bind(this)],
      ['redeem_discount', this.handleRedeemDiscount.bind(this)],
      ['redeem_products', this.handleRedeemProducts.bind(this)],
      ['redeem_vip', this.handleRedeemVIP.bind(this)]
    ]);

    // Mapeamento de IDs de menus de seleção para suas funções handlers
    this.selectMenuHandlers = new Map([
      ['select_product', this.handleProductSelect.bind(this)]
    ]);

    // Mapeamento de IDs de modais para suas funções handlers
    this.modalHandlers = new Map([
      ['reject_payment_modal_', this.rejectPayment.bind(this)],
      ['ticket_create_modal', this.processTicketCreation.bind(this)],
      ['product_details_', this.processProductDetails.bind(this)]
    ]);
  }

  /**
   * Função de entrada principal para processar qualquer interação
   * @param {Interaction} interaction - Interação do Discord
   */
  async processInteraction(interaction) {
    try {
      // Identificar tipo de interação
      let type = null;

      if (interaction.isButton()) type = 'button';
      else if (interaction.isStringSelectMenu()) type = 'selectMenu';
      else if (interaction.isModalSubmit()) type = 'modal';

      // Se o tipo for reconhecido, delegar para o handler correto
      if (type && this.handlers[type]) {
        await this.handlers[type](interaction);
      }
    } catch (error) {
      logger.error(`Erro no processamento de interação: ${error.message}`, error);
      this.handleInteractionError(interaction, error);
    }
  }

  /**
   * Tratamento centralizado de erros de interação
   * @private
   */
  async handleInteractionError(interaction, error) {
    try {
      const errorMessage = 'Ocorreu um erro ao processar sua interação. Por favor, tente novamente.';

      if (interaction.deferred) {
        await interaction.editReply({ content: errorMessage, ephemeral: true });
      } else if (!interaction.replied) {
        await interaction.reply({ content: errorMessage, ephemeral: true });
      } else {
        await interaction.followUp({ content: errorMessage, ephemeral: true });
      }
    } catch (replyError) {
      logger.error('Erro ao enviar mensagem de erro:', replyError);
    }
  }

  /**
   * Handler principal para interações de botão
   * @private
   */
  async handleButtonInteraction(interaction) {
    const customId = interaction.customId;

    // Registrar interação para análise
    await userService.recordActivity(interaction.user.id, 'BUTTON_INTERACTION', {
      buttonId: customId
    });

    // Percorrer handlers de botão e encontrar o correspondente
    for (const [prefix, handler] of this.buttonHandlers.entries()) {
      if (customId === prefix || customId.startsWith(prefix)) {
        const param = customId === prefix ? null : customId.replace(prefix, '');
        return await handler(interaction, param);
      }
    }

    // Se não encontrou handler específico
    await interaction.reply({
      content: 'Este botão não está mais disponível ou ocorreu um erro.',
      ephemeral: true
    });
  }

  /**
   * Handler principal para interações de menu de seleção
   * @private
   */
  async handleSelectMenuInteraction(interaction) {
    const customId = interaction.customId;
    const selectedValue = interaction.values[0];

    // Registrar interação para análise
    await userService.recordActivity(interaction.user.id, 'SELECT_INTERACTION', {
      selectId: customId,
      selectedValue
    });

    // Verificar se existe um handler para este menu
    const handler = this.selectMenuHandlers.get(customId);

    if (handler) {
      return await handler(interaction, selectedValue);
    }

    // Se não encontrou handler específico
    await interaction.reply({
      content: 'Este menu não está mais disponível ou ocorreu um erro.',
      ephemeral: true
    });
  }

  /**
   * Handler principal para interações de modal
   * @private
   */
  async handleModalSubmitInteraction(interaction) {
    const customId = interaction.customId;

    // Registrar interação para análise
    await userService.recordActivity(interaction.user.id, 'MODAL_INTERACTION', {
      modalId: customId
    });

    // Procurar handler pelo prefixo
    for (const [prefix, handler] of this.modalHandlers.entries()) {
      if (customId === prefix || customId.startsWith(prefix)) {
        const param = customId === prefix ? null : customId.replace(prefix, '');
        return await handler(interaction, param);
      }
    }

    // Se não encontrou handler específico
    await interaction.reply({
      content: 'Este formulário não está mais disponível ou ocorreu um erro.',
      ephemeral: true
    });
  }

  /* ===== HANDLERS DE PRODUTOS ===== */

  /**
   * Mostra detalhes de um produto
   * @param {Interaction} interaction - Interação
   * @param {string} productId - ID do produto
   */
  async showProductDetails(interaction, productId) {
    await interaction.deferUpdate();

    try {
      // Buscar produto
      const produto = await productService.getProductById(productId);

      if (!produto) {
        return await interaction.editReply({
          content: 'Produto não encontrado.',
          embeds: [],
          components: []
        });
      }

      // Registrar visualização
      await userService.recordActivity(interaction.user.id, 'PRODUCT_VIEW', { productId });

      // Criar embed com os detalhes do produto
      const embed = new EmbedBuilder()
        .setTitle(`🛍️ ${produto.nome}`)
        .setColor(config.discord.embedColors.primary)
        .setDescription(produto.descricao)
        .addFields(
          { name: 'Preço', value: `💰 R$ ${produto.preco.toFixed(2)}`, inline: true },
          { name: 'Tipo', value: produto.tipo, inline: true },
          { name: 'Disponibilidade', value: produto.disponivel ? '✅ Disponível' : '❌ Indisponível', inline: true }
        );

      // Adicionar detalhes específicos do produto
      if (produto.detalhes && Object.keys(produto.detalhes).length > 0) {
        this.addProductDetailsToEmbed(embed, produto);
      }

      // Botões de ação
      const row = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId(`buy_${produto._id}`)
            .setLabel('Comprar')
            .setStyle(ButtonStyle.Success)
            .setDisabled(!produto.disponivel),

          new ButtonBuilder()
            .setCustomId(`recommend_similar_${produto._id}`)
            .setLabel('Produtos Similares')
            .setStyle(ButtonStyle.Secondary)
        );

      await interaction.editReply({
        embeds: [embed],
        components: [row]
      });
    } catch (error) {
      logger.error('Erro ao mostrar detalhes do produto:', error);
      await interaction.editReply({
        content: 'Ocorreu um erro ao buscar os detalhes do produto.',
        embeds: [],
        components: []
      });
    }
  }

  /**
   * Adiciona campos de detalhes do produto ao embed
   * @private
   */
  addProductDetailsToEmbed(embed, produto) {
    const detalhesFields = [];

    if (produto.tipo === 'valorant') {
      if (produto.detalhes.rank) detalhesFields.push({ name: 'Rank', value: produto.detalhes.rank, inline: true });
      if (produto.detalhes.skins) detalhesFields.push({ name: 'Skins', value: String(produto.detalhes.skins), inline: true });
      if (produto.detalhes.region) detalhesFields.push({ name: 'Região', value: produto.detalhes.region, inline: true });
      if (produto.detalhes.level) detalhesFields.push({ name: 'Nível', value: String(produto.detalhes.level), inline: true });
      if (produto.detalhes.agents) detalhesFields.push({ name: 'Agentes', value: String(produto.detalhes.agents), inline: true });
      if (produto.detalhes.verification !== undefined) {
        detalhesFields.push({ name: 'Email Verificado', value: produto.detalhes.verification ? 'Sim' : 'Não', inline: true });
      }
    } else {
      // Para outros tipos de produtos, adicionar detalhes genéricos
      Object.entries(produto.detalhes).forEach(([chave, valor]) => {
        detalhesFields.push({ name: chave, value: String(valor), inline: true });
      });
    }

    // Adicionar campos de detalhes ao embed se houver algum
    if (detalhesFields.length > 0) {
      embed.addFields(...detalhesFields);
    }
  }

  /**
   * Manipula a compra de um produto
   * @param {Interaction} interaction - Interação
   * @param {string} productId - ID do produto
   */
  async handleBuyProduct(interaction, productId) {
    await interaction.deferReply({ ephemeral: true });

    try {
      // Buscar produto
      const produto = await productService.getProductById(productId);

      if (!produto) {
        return await interaction.editReply({
          content: 'Produto não encontrado.'
        });
      }

      if (!produto.disponivel || produto.vendido) {
        return await interaction.editReply({
          content: 'Este produto não está mais disponível para compra.'
        });
      }

      // Verificar fraude
      const fraudDetectionService = require('../ai/fraud');
      const riskAssessment = await fraudDetectionService.assessUserRisk(interaction.user.id);

      if (riskAssessment.risk === 'high') {
        // Registrar tentativa suspeita
        await auditLogger.log({
          action: 'SUSPICIOUS_PURCHASE_ATTEMPT',
          category: 'SECURITY',
          severity: 'WARNING',
          status: 'BLOCKED',
          user: {
            id: interaction.user.id,
            username: interaction.user.tag
          },
          product: {
            id: produto._id,
            name: produto.nome,
            price: produto.preco
          },
          details: {
            riskScore: riskAssessment.score,
            riskFactors: riskAssessment.factors
          }
        });

        return await interaction.editReply({
          content: 'Não foi possível iniciar sua compra. Por favor, entre em contato com o suporte.'
        });
      }

      // Verificar se existe promoção aplicável e calcular preço final
      const marketingService = require('../marketing/promotions');
      const pricing = await marketingService.getPromotionalPrice(productId, produto.preco, produto.tipo);
      const precoFinal = pricing.discountedPrice;

      // Criar pagamento
      const payment = await paymentService.createPayment({
        userId: interaction.user.id,
        userName: interaction.user.tag,
        productId: produto._id,
        productName: produto.nome,
        amount: precoFinal,
        ipAddress: interaction.member?.presence?.clientStatus ? Object.keys(interaction.member.presence.clientStatus)[0] : null
      });

      // Registrar iniciação de pagamento
      await userService.recordActivity(interaction.user.id, 'PAYMENT_INITIATED', {
        productId: produto._id,
        paymentId: payment._id,
        amount: precoFinal
      });

      // Criar embed com instruções de pagamento
      const embed = this.createPaymentEmbed(payment, produto, pricing);

      // Botões para instruções e cancelamento
      const row = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId('pix_tutorial')
            .setLabel('Ver Tutorial de Pagamento')
            .setStyle(ButtonStyle.Primary),

          new ButtonBuilder()
            .setCustomId(`cancel_payment_${payment._id}`)
            .setLabel('Cancelar Pagamento')
            .setStyle(ButtonStyle.Danger)
        );

      await interaction.editReply({
        embeds: [embed],
        components: [row]
      });
    } catch (error) {
      logger.error('Erro ao processar compra:', error);
      await interaction.editReply({
        content: 'Ocorreu um erro ao processar sua compra.'
      });
    }
  }

  /**
   * Cria o embed de instruções de pagamento
   * @private
   */
  createPaymentEmbed(payment, produto, pricing) {
    const embed = new EmbedBuilder()
      .setTitle('💰 Pagamento PIX')
      .setColor(config.discord.embedColors.primary)
      .setDescription(`**Instruções para pagamento:**\n\nVocê está comprando: **${produto.nome}**`)
      .addFields(
        { name: 'Valor', value: `R$ ${pricing.discountedPrice.toFixed(2)}${pricing.hasDiscount ? ` (com ${pricing.discountPercentage}% de desconto)` : ''}`, inline: true },
        { name: 'Código da compra', value: payment._id.toString().substring(0, 8), inline: true },
        { name: '⚠️ Importante', value: 'Após o pagamento, um administrador irá verificar e aprovar sua compra manualmente. Os dados de acesso serão enviados por mensagem privada.' },
        { name: '📲 Como pagar', value: 'Escaneie o QR Code ou utilize o código PIX abaixo para realizar o pagamento.' },
        { name: '📋 Código PIX (Copia e Cola)', value: '```' + payment.pixCode + '```' }
      )
      .setImage(payment.qrCodeUrl)
      .setFooter({ text: '⚠️ Política de Não-Estorno: Ao realizar o pagamento, você concorda que não haverá estorno sob nenhuma circunstância.' })
      .setTimestamp();

    // Se houver promoção, destacar
    if (pricing.hasDiscount) {
      embed.addFields({
        name: '🔥 Promoção Aplicada!',
        value: `${pricing.promotion.title}: ${pricing.promotion.description}\nValor original: R$ ${pricing.originalPrice.toFixed(2)}`
      });
    }

    return embed;
  }

  /**
   * Mostra produtos similares a um produto
   * @param {Interaction} interaction - Interação
   * @param {string} productId - ID do produto
   */
  async showSimilarProducts(interaction, productId) {
    await interaction.deferUpdate();

    try {
      // Obter produtos similares
      const similarProducts = await recommendationService.getSimilarProducts(productId, 5);

      if (similarProducts.length === 0) {
        return await interaction.editReply({
          content: 'Não foram encontrados produtos similares a este.',
          embeds: [],
          components: []
        });
      }

      // Obter produto original para referência
      const originalProduct = await productService.getProductById(productId);

      // Criar embed com os produtos similares
      const embed = new EmbedBuilder()
        .setTitle('🔍 Produtos Similares')
        .setColor(config.discord.embedColors.primary)
        .setDescription(`Produtos similares a **${originalProduct ? originalProduct.nome : 'Produto Selecionado'}**:`)
        .setTimestamp();

      // Adicionar produtos ao embed
      similarProducts.forEach((produto, index) => {
        embed.addFields({
          name: `${index + 1}. ${produto.nome}`,
          value: `💰 R$ ${produto.preco.toFixed(2)}\n${produto.descricao.substring(0, 100)}${produto.descricao.length > 100 ? '...' : ''}`
        });
      });

      // Botões para cada produto
      const row = new ActionRowBuilder();

      // Adicionar botões para os primeiros 5 produtos
      similarProducts.slice(0, 5).forEach((produto, index) => {
        row.addComponents(
          new ButtonBuilder()
            .setCustomId(`view_product_${produto._id}`)
            .setLabel(`Ver ${index + 1}`)
            .setStyle(ButtonStyle.Primary)
        );
      });

      await interaction.editReply({
        embeds: [embed],
        components: [row]
      });
    } catch (error) {
      logger.error('Erro ao buscar produtos similares:', error);
      await interaction.editReply({
        content: 'Ocorreu um erro ao buscar produtos similares.',
        embeds: [],
        components: []
      });
    }
  }

  /**
   * Manipula navegação pelo catálogo de produtos
   * @param {Interaction} interaction - Interação
   */
  async handleBrowseProducts(interaction) {
    await interaction.deferUpdate();

    try {
      // Buscar produtos disponíveis
      const produtos = await productService.getAvailableProducts();

      if (produtos.length === 0) {
        return await interaction.editReply({
          content: 'Não há produtos disponíveis no momento.',
          embeds: [],
          components: []
        });
      }

      // Criar embed com a lista de produtos
      const embed = new EmbedBuilder()
        .setTitle('🏪 Produtos Disponíveis')
        .setColor(config.discord.embedColors.primary)
        .setDescription('Escolha um produto para ver mais detalhes:')
        .setTimestamp();

      // Adicionar produtos ao embed (até 10)
      produtos.slice(0, 10).forEach((produto, index) => {
        embed.addFields({
          name: `${index + 1}. ${produto.nome}`,
          value: `💰 R$ ${produto.preco.toFixed(2)}\n${produto.descricao.substring(0, 100)}${produto.descricao.length > 100 ? '...' : ''}`
        });
      });

      // Criar menu de seleção
      const selectMenu = {
        type: 3, // SelectMenu
        custom_id: 'select_product',
        placeholder: 'Selecione um produto para ver detalhes',
        options: produtos.slice(0, 25).map((produto, index) => ({
          label: `${produto.nome.substring(0, 25)} - R$ ${produto.preco.toFixed(2)}`,
          description: produto.descricao.substring(0, 50) + (produto.descricao.length > 50 ? '...' : ''),
          value: produto._id.toString()
        }))
      };

      // Botões para filtrar produtos
      const filterRow = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId('filter_valorant')
            .setLabel('Valorant')
            .setStyle(ButtonStyle.Primary),

          new ButtonBuilder()
            .setCustomId('filter_steam')
            .setLabel('Steam')
            .setStyle(ButtonStyle.Secondary),

          new ButtonBuilder()
            .setCustomId('filter_lol')
            .setLabel('League of Legends')
            .setStyle(ButtonStyle.Secondary),

          new ButtonBuilder()
            .setCustomId('filter_preco_asc')
            .setLabel('Ordenar por Preço ↑')
            .setStyle(ButtonStyle.Success)
        );

      await interaction.editReply({
        embeds: [embed],
        components: [
          { type: 1, components: [selectMenu] },
          filterRow
        ]
      });
    } catch (error) {
      logger.error('Erro ao navegar pelo catálogo:', error);
      await interaction.editReply({
        content: 'Ocorreu um erro ao buscar produtos.',
        embeds: [],
        components: []
      });
    }
  }

  /**
   * Filtra produtos no catálogo
   * @param {Interaction} interaction - Interação
   * @param {string} filter - Filtro a aplicar
   */
  async handleProductFilter(interaction, filter) {
    await interaction.deferUpdate();

    try {
      // Definir filtros
      const filters = {};

      if (filter === 'valorant' || filter === 'steam' || filter === 'lol') {
        filters.tipo = filter;
      }

      // Definir ordenação
      let orderBy = 'dataCriacao';
      let orderDirection = 'desc';

      if (filter === 'preco_asc') {
        orderBy = 'preco';
        orderDirection = 'asc';
      } else if (filter === 'preco_desc') {
        orderBy = 'preco';
        orderDirection = 'desc';
      }

      // Buscar produtos com os filtros
      const produtos = await productService.getAvailableProducts(20, {
        ...filters,
        orderBy,
        orderDirection
      });

      if (produtos.length === 0) {
        return await interaction.editReply({
          content: 'Não foram encontrados produtos com os filtros especificados.',
          embeds: [],
          components: []
        });
      }

      // Criar embed com a lista filtrada
      const embed = new EmbedBuilder()
        .setTitle(`🏪 Produtos: ${filter.charAt(0).toUpperCase() + filter.slice(1)}`)
        .setColor(config.discord.embedColors.primary)
        .setDescription(`${produtos.length} produtos encontrados com o filtro aplicado.`)
        .setTimestamp();

      // Adicionar produtos ao embed (até 10)
      produtos.slice(0, 10).forEach((produto, index) => {
        embed.addFields({
          name: `${index + 1}. ${produto.nome}`,
          value: `💰 R$ ${produto.preco.toFixed(2)}\n${produto.descricao.substring(0, 100)}${produto.descricao.length > 100 ? '...' : ''}`
        });
      });

      // Criar menu de seleção atualizado
      const selectMenu = {
        type: 3, // SelectMenu
        custom_id: 'select_product',
        placeholder: 'Selecione um produto para ver detalhes',
        options: produtos.slice(0, 25).map((produto, index) => ({
          label: `${produto.nome.substring(0, 25)} - R$ ${produto.preco.toFixed(2)}`,
          description: produto.descricao.substring(0, 50) + (produto.descricao.length > 50 ? '...' : ''),
          value: produto._id.toString()
        }))
      };

      // Botões para filtrar produtos
      const filterRow = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId('filter_valorant')
            .setLabel('Valorant')
            .setStyle(filter === 'valorant' ? ButtonStyle.Success : ButtonStyle.Secondary),

          new ButtonBuilder()
            .setCustomId('filter_steam')
            .setLabel('Steam')
            .setStyle(filter === 'steam' ? ButtonStyle.Success : ButtonStyle.Secondary),

          new ButtonBuilder()
            .setCustomId('filter_lol')
            .setLabel('League of Legends')
            .setStyle(filter === 'lol' ? ButtonStyle.Success : ButtonStyle.Secondary),

          new ButtonBuilder()
            .setCustomId('filter_reset')
            .setLabel('Limpar Filtros')
            .setStyle(ButtonStyle.Danger)
        );

      await interaction.editReply({
        embeds: [embed],
        components: [
          { type: 1, components: [selectMenu] },
          filterRow
        ]
      });
    } catch (error) {
      logger.error('Erro ao aplicar filtro de produtos:', error);
      await interaction.editReply({
        content: 'Ocorreu um erro ao aplicar o filtro.',
        embeds: [],
        components: []
      });
    }
  }

  /**
   * Manipula seleção de produto no menu dropdown
   * @param {Interaction} interaction - Interação
   * @param {string} productId - ID do produto selecionado
   */
  async handleProductSelect(interaction, productId) {
    // Redirecionar para exibição de detalhes do produto
    await this.showProductDetails(interaction, productId);
  }

  /* ===== HANDLERS DE PAGAMENTO ===== */

  /**
   * Mostra tutorial de pagamento PIX
   * @param {Interaction} interaction - Interação
   */
  async showPixTutorial(interaction) {
    try {
      const embed = new EmbedBuilder()
        .setTitle('📱 Tutorial de Pagamento PIX')
        .setColor(config.discord.embedColors.primary)
        .setDescription('Siga os passos abaixo para completar seu pagamento via PIX:')
        .addFields(
          { name: '1. Abra seu aplicativo bancário', value: 'Acesse o aplicativo do seu banco ou instituição financeira.' },
          { name: '2. Acesse a área PIX', value: 'Procure pela opção "PIX" ou "Pagamentos > PIX" no menu.' },
          { name: '3. Escolha como pagar', value: 'Você pode escanear o QR Code ou copiar e colar o código PIX fornecido.' },
          { name: '4. Confira os dados', value: 'Verifique se o valor e o destinatário estão corretos antes de confirmar.' },
          { name: '5. Confirme o pagamento', value: 'Siga as instruções do seu banco para autenticar e concluir a transferência.' },
          { name: '6. Aguarde a confirmação', value: 'Após o pagamento, um administrador irá verificar e liberar seu produto em breve!' }
        )
        .setFooter({ text: 'Caso tenha dificuldades, entre em contato com nossa equipe de suporte.' });

      await interaction.reply({
        embeds: [embed],
        ephemeral: true
      });
    } catch (error) {
      logger.error('Erro ao mostrar tutorial PIX:', error);
      await interaction.reply({
        content: 'Ocorreu um erro ao mostrar o tutorial de pagamento.',
        ephemeral: true
      });
    }
  }

  /**
   * Cancela um pagamento pendente
   * @param {Interaction} interaction - Interação
   * @param {string} paymentId - ID do pagamento
   */
  async cancelPayment(interaction, paymentId) {
    await interaction.deferReply({ ephemeral: true });

    try {
      // Cancelar pagamento
      const result = await paymentService.cancelPayment(paymentId, interaction.user.id);

      if (!result.success) {
        return await interaction.editReply({
          content: `❌ Erro ao cancelar pagamento: ${result.message}`
        });
      }

      await interaction.editReply({
        content: '✅ Pagamento cancelado com sucesso!'
      });
    } catch (error) {
      logger.error(`Erro ao cancelar pagamento ${paymentId}:`, error);
      await interaction.editReply({
        content: 'Ocorreu um erro ao cancelar o pagamento.'
      });
    }
  }

  /**
   * Aprova um pagamento (admin)
   * @param {Interaction} interaction - Interação
   * @param {string} paymentId - ID do pagamento
   */
  async approvePayment(interaction, paymentId) {
    // Verificar permissões de administrador
    if (!interaction.memberPermissions || !interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
      return await interaction.reply({
        content: 'Você não tem permissão para aprovar pagamentos.',
        ephemeral: true
      });
    }

    await interaction.deferReply({ ephemeral: true });

    try {
      // Aprovar pagamento
      const result = await approvalService.approvePayment(paymentId, interaction.user.id);

      if (!result.success) {
        return await interaction.editReply({
          content: `❌ Erro ao aprovar pagamento: ${result.message}`
        });
      }

      // Notificar o usuário
      try {
        const user = await interaction.client.users.fetch(result.payment.userId);

        // Criar embed com confirmação
        const embed = new EmbedBuilder()
          .setTitle('✅ Compra Aprovada!')
          .setColor(config.discord.embedColors.success)
          .setDescription(`Sua compra foi aprovada e processada com sucesso!`)
          .addFields(
            { name: 'Produto', value: result.payment.productName, inline: true },
            { name: 'Valor pago', value: `R$ ${result.payment.amount.toFixed(2)}`, inline: true },
            { name: 'Data', value: `${new Date().toLocaleDateString()}`, inline: true },
            { name: '📋 Dados de Acesso', value: '```' +
              `Login: ${result.accountCredentials.login}\nSenha: ${result.accountCredentials.password}` +
              '```' },
            { name: '⚠️ Importante', value: 'Recomendamos que você altere a senha imediatamente após o primeiro acesso.' }
          )
          .setTimestamp();

        await user.send({ embeds: [embed] }).catch(err => {
          logger.error(`Erro ao enviar DM para ${user.tag}:`, err);
        });
      } catch (dmError) {
        logger.error(`Erro ao notificar usuário sobre aprovação:`, dmError);
      }

      await interaction.editReply({
        content: `✅ Pagamento ${paymentId} aprovado com sucesso!`
      });
    } catch (error) {
      logger.error(`Erro ao aprovar pagamento ${paymentId}:`, error);
      await interaction.editReply({
        content: 'Ocorreu um erro ao aprovar o pagamento.'
      });
    }
  }

  /**
   * Mostra modal para rejeitar pagamento
   * @param {Interaction} interaction - Interação
   * @param {string} paymentId - ID do pagamento
   */
  async showRejectPaymentModal(interaction, paymentId) {
    // Verificar permissões de administrador
    if (!interaction.memberPermissions || !interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
      return await interaction.reply({
        content: 'Você não tem permissão para rejeitar pagamentos.',
        ephemeral: true
      });
    }

    try {
      // Criar modal
      const modal = new ModalBuilder()
        .setCustomId(`reject_payment_modal_${paymentId}`)
        .setTitle('Rejeitar Pagamento');

      // Adicionar campo para motivo
      const reasonInput = new TextInputBuilder()
        .setCustomId('rejection_reason')
        .setLabel('Motivo da rejeição')
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder('Explique o motivo da rejeição para o usuário')
        .setMinLength(5)
        .setMaxLength(500)
        .setRequired(true);

      // Criar componente com o campo
      const reasonRow = new ActionRowBuilder().addComponents(reasonInput);

      // Adicionar componente ao modal
      modal.addComponents(reasonRow);

      // Mostrar modal
      await interaction.showModal(modal);
    } catch (error) {
      logger.error(`Erro ao mostrar modal de rejeição para ${paymentId}:`, error);
      await interaction.reply({
        content: 'Ocorreu um erro ao preparar o formulário de rejeição.',
        ephemeral: true
      });
    }
  }

  /**
   * Rejeita um pagamento
   * @param {Interaction} interaction - Interação
   * @param {string} paymentId - ID do pagamento
   */
  async rejectPayment(interaction, paymentId) {
    await interaction.deferReply({ ephemeral: true });

    // Obter motivo do modal
    const reason = interaction.fields.getTextInputValue('rejection_reason');

    try {
      // Rejeitar pagamento
      const result = await approvalService.rejectPayment(paymentId, reason, interaction.user.id);

      if (!result.success) {
        return await interaction.editReply({
          content: `❌ Erro ao rejeitar pagamento: ${result.message}`
        });
      }

      // Notificar o usuário
      try {
        const user = await interaction.client.users.fetch(result.payment.userId);

        // Criar embed com rejeição
        const embed = new EmbedBuilder()
          .setTitle('❌ Pagamento Rejeitado')
          .setColor(config.discord.embedColors.error)
          .setDescription(`Seu pagamento para "${result.payment.productName}" foi rejeitado.`)
          .addFields(
            { name: 'Motivo', value: reason },
            { name: 'Valor', value: `R$ ${result.payment.amount.toFixed(2)}`, inline: true },
            { name: 'ID da transação', value: paymentId.substring(0, 8), inline: true }
          )
          .addFields({ name: 'Suporte', value: 'Se você acredita que isso é um erro, entre em contato com nossa equipe de suporte.' })
          .setTimestamp();

        await user.send({ embeds: [embed] }).catch(err => {
          logger.error(`Erro ao enviar DM para ${user.tag}:`, err);
        });
      } catch (dmError) {
        logger.error(`Erro ao notificar usuário sobre rejeição:`, dmError);
      }

      await interaction.editReply({
        content: `✅ Pagamento ${paymentId} rejeitado com sucesso!`
      });
    } catch (error) {
      logger.error(`Erro ao rejeitar pagamento ${paymentId}:`, error);
      await interaction.editReply({
        content: 'Ocorreu um erro ao rejeitar o pagamento.'
      });
    }
  }

  /* ===== HANDLERS DE ADMINISTRAÇÃO DE PRODUTOS ===== */

  /**
   * Confirma a remoção de um produto
   * @param {Interaction} interaction - Interação
   * @param {string} productId - ID do produto
   */
  async confirmRemoveProduct(interaction, productId) {
    await interaction.deferUpdate();

    try {
      // Atualizar produto para indisponível
      const result = await productService.updateProduct(productId, {
        disponivel: false,
        ultimaAtualizacao: new Date()
      });

      if (!result.success) {
        return await interaction.editReply({
          content: `❌ Erro ao remover produto: ${result.message}`,
          embeds: [],
          components: []
        });
      }

      // Registrar ação no log de auditoria
      await auditLogger.log({
        action: 'PRODUCT_REMOVED',
        category: 'PRODUCT',
        severity: 'WARNING',
        status: 'SUCCESS',
        user: {
          id: interaction.user.id,
          username: interaction.user.tag
        },
        product: {
          id: productId,
          name: result.product.nome
        }
      });

      await interaction.editReply({
        content: `✅ Produto "${result.product.nome}" removido com sucesso!`,
        embeds: [],
        components: []
      });
    } catch (error) {
      logger.error(`Erro ao remover produto ${productId}:`, error);
      await interaction.editReply({
        content: 'Ocorreu um erro ao remover o produto.',
        embeds: [],
        components: []
      });
    }
  }

  /**
   * Cancela a remoção de um produto
   * @param {Interaction} interaction - Interação
   */
  async cancelRemoveProduct(interaction) {
    await interaction.update({
      content: '🚫 Operação cancelada pelo usuário.',
      embeds: [],
      components: []
    });
  }

  /**
   * Mostra modal para adicionar detalhes a um produto
   * @param {Interaction} interaction - Interação
   * @param {string} productId - ID do produto
   */
  async showAddDetailsModal(interaction, productId) {
    // Redirecionar para o comando de produto_admin
    const command = interaction.client.commands.get('produtos_admin');
    if (command) {
      await command.execute({
        ...interaction,
        options: {
          getSubcommand: () => 'detalhes',
          getString: () => productId
        }
      });
    }
  }

  /**
   * Processa os detalhes de um produto enviados via modal
   * @param {Interaction} interaction - Interação
   * @param {string} productId - ID do produto
   */
  async processProductDetails(interaction, productId) {
    await interaction.deferReply({ ephemeral: true });

    try {
      // Buscar produto
      const product = await productService.getProductById(productId);

      if (!product) {
        return await interaction.editReply({
          content: '❌ Produto não encontrado.'
        });
      }

      // Extrair campos do formulário
      const detalhes = { ...product.detalhes } || {};

      if (product.tipo === 'valorant') {
        // Campos para contas Valorant
        const rank = interaction.fields.getTextInputValue('rank');
        const skins = interaction.fields.getTextInputValue('skins');
        const level = interaction.fields.getTextInputValue('level');
        const region = interaction.fields.getTextInputValue('region');
        const agents = interaction.fields.getTextInputValue('agents');

        if (rank) detalhes.rank = rank;
        if (skins) detalhes.skins = parseInt(skins) || 0;
        if (level) detalhes.level = parseInt(level) || 0;
        if (region) detalhes.region = region;
        if (agents) detalhes.agents = parseInt(agents) || 0;
      } else {
        // Campos genéricos
        try {
          const field1 = interaction.fields.getTextInputValue('field1');
          const value1 = interaction.fields.getTextInputValue('value1');

          if (field1 && value1) {
            detalhes[field1] = value1;
          }

          const field2 = interaction.fields.getTextInputValue('field2');
          const value2 = interaction.fields.getTextInputValue('value2');

          if (field2 && value2) {
            detalhes[field2] = value2;
          }

          const field3 = interaction.fields.getTextInputValue('field3');
          const value3 = interaction.fields.getTextInputValue('value3');

          if (field3 && value3) {
            detalhes[field3] = value3;
          }
        } catch (formError) {
          // Ignorar erros de campos não presentes
        }
      }

      // Atualizar produto
      const result = await productService.updateProduct(productId, { detalhes });

      if (!result.success) {
        return await interaction.editReply({
          content: `❌ Erro ao atualizar detalhes: ${result.message}`
        });
      }

      // Registrar ação no log de auditoria
      await auditLogger.log({
        action: 'PRODUCT_DETAILS_UPDATED',
        category: 'PRODUCT',
        severity: 'INFO',
        status: 'SUCCESS',
        user: {
          id: interaction.user.id,
          username: interaction.user.tag
        },
        product: {
          id: productId,
          name: product.nome
        },
        details: {
          updatedFields: Object.keys(detalhes)
        }
      });

      await interaction.editReply({
        content: `✅ Detalhes do produto "${product.nome}" atualizados com sucesso!`
      });
    } catch (error) {
      logger.error(`Erro ao processar detalhes do produto ${productId}:`, error);
      await interaction.editReply({
        content: 'Ocorreu um erro ao atualizar os detalhes do produto.'
      });
    }
  }

  /* ===== HANDLERS DE ASSISTENTE ===== */

  /**
   * Registra feedback positivo do assistente
   * @param {Interaction} interaction - Interação
   * @param {string} responseId - ID da resposta
   */
  async assistantFeedbackPositive(interaction, responseId) {
    try {
      await assistantService.recordFeedback(responseId, interaction.user.id, 'positive');
      await interaction.reply({
        content: 'Obrigado pelo seu feedback! Isso nos ajuda a melhorar nosso assistente.',
        ephemeral: true
      });
    } catch (error) {
      logger.error(`Erro ao registrar feedback positivo: ${responseId}`, error);
      await interaction.reply({
        content: 'Ocorreu um erro ao registrar seu feedback.',
        ephemeral: true
      });
    }
  }

  /**
   * Registra feedback negativo do assistente
   * @param {Interaction} interaction - Interação
   * @param {string} responseId - ID da resposta
   */
  async assistantFeedbackNegative(interaction, responseId) {
    try {
      await assistantService.recordFeedback(responseId, interaction.user.id, 'negative');

      // Oferecer opções adicionais
      const row = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId('refine_question')
            .setLabel('Refinar Pergunta')
            .setStyle(ButtonStyle.Primary),

          new ButtonBuilder()
            .setCustomId('assistant_talk_human')
            .setLabel('Falar com Atendente')
            .setStyle(ButtonStyle.Secondary)
        );

      await interaction.reply({
        content: 'Lamento que a resposta não tenha sido útil. Como posso ajudar melhor?',
        components: [row],
        ephemeral: true
      });
    } catch (error) {
      logger.error(`Erro ao registrar feedback negativo: ${responseId}`, error);
      await interaction.reply({
        content: 'Ocorreu um erro ao registrar seu feedback.',
        ephemeral: true
      });
    }
  }

  /* ===== HANDLERS DE TICKETS ===== */

  /**
   * Cria um ticket de suporte
   * @param {Interaction} interaction - Interação
   */
  async createSupportTicket(interaction) {
    // Verificar se já há um modal para criar ou mostrar um novo
    if (interaction.customId === 'assistant_talk_human' || interaction.customId === 'create_ticket') {
      // Criar modal para descrição do problema
      const modal = new ModalBuilder()
        .setCustomId('ticket_create_modal')
        .setTitle('Abrir Ticket de Suporte');

      // Campo de assunto
      const subjectInput = new TextInputBuilder()
        .setCustomId('ticket_subject')
        .setLabel('Assunto')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('Ex: Problema com pagamento, Dúvida sobre produto...')
        .setMinLength(3)
        .setMaxLength(100)
        .setRequired(true);

      // Campo de descrição
      const descriptionInput = new TextInputBuilder()
        .setCustomId('ticket_description')
        .setLabel('Descreva seu problema detalhadamente')
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder('Descreva sua dúvida ou problema com o máximo de detalhes possível para que possamos ajudar melhor.')
        .setMinLength(10)
        .setMaxLength(1000)
        .setRequired(true);

      // Organizar campos
      const subjectRow = new ActionRowBuilder().addComponents(subjectInput);
      const descriptionRow = new ActionRowBuilder().addComponents(descriptionInput);

      // Adicionar campos ao modal
      modal.addComponents(subjectRow, descriptionRow);

      // Mostrar modal
      await interaction.showModal(modal);
      return;
    }
  }

  /**
   * Processa a criação de um ticket após o envio do modal
   * @param {Interaction} interaction - Interação
   */
  async processTicketCreation(interaction) {
    await interaction.deferReply({ ephemeral: true });

    // Obter dados do modal
    const subject = interaction.fields.getTextInputValue('ticket_subject');
    const description = interaction.fields.getTextInputValue('ticket_description');

    try {
      // Verificar categoria de tickets
      let ticketCategory = interaction.guild.channels.cache.find(channel =>
        channel.type === ChannelType.GuildCategory &&
        channel.name.toLowerCase().includes('ticket')
      );

      // Se não existir categoria, criar uma
      if (!ticketCategory) {
        ticketCategory = await interaction.guild.channels.create({
          name: 'Tickets',
          type: ChannelType.GuildCategory,
          permissionOverwrites: [
            {
              id: interaction.guild.roles.everyone,
              deny: [PermissionFlagsBits.ViewChannel]
            },
            {
              id: interaction.client.user.id,
              allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels]
            }
          ]
        });
      }

      // Criar nome do canal
      const ticketName = `ticket-${interaction.user.username.toLowerCase().replace(/[^a-z0-9]/g, '')}-${Date.now().toString().slice(-4)}`;

      // Criar canal do ticket
      const ticketChannel = await interaction.guild.channels.create({
        name: ticketName,
        type: ChannelType.GuildText,
        parent: ticketCategory.id,
        permissionOverwrites: [
          {
            id: interaction.guild.roles.everyone,
            deny: [PermissionFlagsBits.ViewChannel]
          },
          {
            id: interaction.user.id,
            allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages]
          },
          {
            id: interaction.client.user.id,
            allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels]
          }
        ]
      });

      // Adicionar permissões para administradores
      const adminRole = interaction.guild.roles.cache.find(role =>
        role.name.toLowerCase().includes('admin') ||
        role.name.toLowerCase().includes('moderador')
      );

      if (adminRole) {
        await ticketChannel.permissionOverwrites.create(adminRole, {
          ViewChannel: true,
          SendMessages: true
        });
      }

      // Criar mensagem inicial
      const embed = new EmbedBuilder()
        .setTitle(`Ticket: ${subject}`)
        .setColor(config.discord.embedColors.primary)
        .setDescription(`**Usuário:** ${interaction.user.tag}\n**Assunto:** ${subject}\n\n**Descrição do problema:**\n${description}`)
        .setFooter({ text: `ID do Ticket: ${ticketChannel.id}` })
        .setTimestamp();

      // Botões de ação
      const row = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId('close_ticket')
            .setLabel('Fechar Ticket')
            .setStyle(ButtonStyle.Danger),

          new ButtonBuilder()
            .setCustomId('claim_ticket')
            .setLabel('Atender Ticket')
            .setStyle(ButtonStyle.Success)
        );

      // Enviar mensagem inicial
      await ticketChannel.send({ embeds: [embed], components: [row] });

      // Responder ao usuário
      await interaction.editReply({
        content: `✅ Seu ticket foi criado com sucesso! Por favor, continue a conversa em ${ticketChannel}.`
      });

      // Registrar criação do ticket
      await auditLogger.log({
        action: 'TICKET_CREATED',
        category: 'SUPPORT',
        severity: 'INFO',
        status: 'SUCCESS',
        user: {
          id: interaction.user.id,
          username: interaction.user.tag
        },
        details: {
          ticketId: ticketChannel.id,
          subject,
          channelName: ticketName
        }
      });
    } catch (error) {
      logger.error('Erro ao criar ticket:', error);
      await interaction.editReply({
        content: 'Ocorreu um erro ao criar seu ticket. Por favor, tente novamente mais tarde ou contacte um administrador.'
      });
    }
  }

  /**
   * Fecha um ticket
   * @param {Interaction} interaction - Interação
   */
  async closeTicket(interaction) {
    await interaction.deferReply();

    try {
      // Verificar se é um canal de ticket
      if (!interaction.channel.name.startsWith('ticket-')) {
        return await interaction.editReply({
          content: 'Este comando só pode ser usado em canais de ticket.'
        });
      }

      // Verificar permissões
      const isAdmin = interaction.member.permissions.has(PermissionFlagsBits.Administrator);
      const isTicketCreator = interaction.channel.permissionOverwrites.cache.has(interaction.user.id);

      if (!isAdmin && !isTicketCreator) {
        return await interaction.editReply({
          content: 'Você não tem permissão para fechar este ticket.'
        });
      }

      // Enviar mensagem de fechamento
      const closeEmbed = new EmbedBuilder()
        .setTitle('🔒 Ticket Fechado')
        .setColor(config.discord.embedColors.error)
        .setDescription(`Este ticket foi fechado por ${interaction.user.tag}.`)
        .setTimestamp();

      await interaction.editReply({ embeds: [closeEmbed], components: [] });

      // Arquivar ticket
      setTimeout(async () => {
        try {
          // Verificar permissões para gerenciar canal
          if (!interaction.guild.members.me.permissions.has(PermissionFlagsBits.ManageChannels)) {
            await interaction.channel.send('Não tenho permissão para arquivar este canal. Um administrador precisará fazer isso manualmente.');
            return;
          }

          await interaction.channel.send('Este canal será excluído em 10 segundos...');

          // Aguardar 10 segundos e deletar o canal
          setTimeout(async () => {
            try {
              await interaction.channel.delete('Ticket fechado');
            } catch (deleteError) {
              logger.error('Erro ao deletar canal de ticket:', deleteError);
            }
          }, 10000);
        } catch (archiveError) {
          logger.error('Erro ao arquivar ticket:', archiveError);
        }
      }, 3000);

      // Registrar fechamento do ticket
      await auditLogger.log({
        action: 'TICKET_CLOSED',
        category: 'SUPPORT',
        severity: 'INFO',
        status: 'SUCCESS',
        user: {
          id: interaction.user.id,
          username: interaction.user.tag
        },
        details: {
          ticketId: interaction.channel.id,
          channelName: interaction.channel.name
        }
      });
    } catch (error) {
      logger.error('Erro ao fechar ticket:', error);

      if (interaction.deferred) {
        await interaction.editReply({
          content: 'Ocorreu um erro ao fechar o ticket. Um administrador precisará verificar o problema.'
        });
      } else {
        await interaction.reply({
          content: 'Ocorreu um erro ao fechar o ticket. Um administrador precisará verificar o problema.',
          ephemeral: true
        });
      }
    }
  }

  /* ===== HANDLERS DE PERFIL E FIDELIDADE ===== */

  /**
   * Mostra o perfil do usuário
   * @param {Interaction} interaction - Interação
   */
  async showProfile(interaction) {
    const profileCommand = interaction.client.commands.get('perfil');
    if (profileCommand) {
      await profileCommand.execute(interaction);
    }
  }

  /**
   * Mostra histórico completo de compras
   * @param {Interaction} interaction - Interação
   */
  async showFullPurchaseHistory(interaction) {
    await interaction.deferUpdate();

    try {
      const userId = interaction.user.id;

      // Obter histórico completo
      const purchaseHistory = await userService.getPurchaseHistory(userId);

      if (purchaseHistory.length === 0) {
        return await interaction.editReply({
          content: 'Você ainda não realizou nenhuma compra.',
          components: [],
          embeds: []
        });
      }

      // Criar embed com histórico completo
      const embed = new EmbedBuilder()
        .setTitle('📋 Seu Histórico de Compras')
        .setColor(config.discord.embedColors.primary)
        .setDescription(`Total de ${purchaseHistory.length} ${purchaseHistory.length === 1 ? 'compra' : 'compras'} realizadas.`)
        .setTimestamp();

      // Adicionar compras (limitar a 25 por questões de espaço)
      purchaseHistory.slice(0, 25).forEach((purchase, index) => {
        embed.addFields({
          name: `${index + 1}. ${purchase.productName}`,
          value: `💰 R$ ${purchase.amount.toFixed(2)}\n📅 ${new Date(purchase.date).toLocaleString()}\n🆔 ${purchase.paymentId.toString().substring(0, 8)}`
        });
      });

      // Se houver mais compras, adicionar nota
      if (purchaseHistory.length > 25) {
        embed.setFooter({ text: `Mostrando as 25 compras mais recentes de ${purchaseHistory.length} compras totais.` });
      }

      // Botão para voltar
      const row = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId('view_profile')
            .setLabel('Voltar ao Perfil')
            .setStyle(ButtonStyle.Secondary)
        );

      await interaction.editReply({
        embeds: [embed],
        components: [row],
        content: null
      });
    } catch (error) {
      logger.error('Erro ao mostrar histórico de compras:', error);

      await interaction.editReply({
        content: 'Ocorreu um erro ao carregar seu histórico de compras.',
        embeds: [],
        components: []
      });
    }
  }

  /**
   * Mostra histórico de pontos
   * @param {Interaction} interaction - Interação
   */
  async showPointsHistory(interaction) {
    await interaction.deferUpdate();

    try {
      const userId = interaction.user.id;

      // Obter histórico de pontos
      const loyalty = await loyaltyService.getUserPoints(userId);

      if (!loyalty.transactions || loyalty.transactions.length === 0) {
        return await interaction.editReply({
          content: 'Você ainda não possui histórico de pontos de fidelidade.',
          embeds: [],
          components: []
        });
      }

      // Criar embed com histórico
      const embed = new EmbedBuilder()
        .setTitle('🎯 Histórico de Pontos de Fidelidade')
        .setColor(config.discord.embedColors.primary)
        .setDescription(`Você tem atualmente **${loyalty.amount} pontos** (Nível ${loyalty.level})`)
        .setTimestamp();

      // Dividir transações por tipo
      const ganhos = loyalty.transactions.filter(tx => tx.amount > 0);
      const gastos = loyalty.transactions.filter(tx => tx.amount < 0);

      // Adicionar ganhos de pontos (limitar a 10)
      if (ganhos.length > 0) {
        embed.addFields({
          name: '📈 Pontos Ganhos',
          value: ganhos.slice(0, 10).map(tx =>
            `• **+${tx.amount}** pontos - ${tx.reason} - ${new Date(tx.date).toLocaleDateString()}`
          ).join('\n') + (ganhos.length > 10 ? '\n*...e mais transações*' : '')
        });
      }

      // Adicionar gastos de pontos (limitar a 10)
      if (gastos.length > 0) {
        embed.addFields({
          name: '📉 Pontos Utilizados',
          value: gastos.slice(0, 10).map(tx =>
            `• **${tx.amount}** pontos - ${tx.reason} - ${new Date(tx.date).toLocaleDateString()}`
          ).join('\n') + (gastos.length > 10 ? '\n*...e mais transações*' : '')
        });
      }

      // Botão para voltar e para resgatar
      const row = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId('view_profile')
            .setLabel('Voltar ao Perfil')
            .setStyle(ButtonStyle.Secondary),

          new ButtonBuilder()
            .setCustomId('redeem_points')
            .setLabel('Resgatar Pontos')
            .setStyle(ButtonStyle.Success)
            .setDisabled(loyalty.amount < 100) // Desabilita se não tiver pontos suficientes
        );

      await interaction.editReply({
        embeds: [embed],
        components: [row],
        content: null
      });
    } catch (error) {
      logger.error('Erro ao mostrar histórico de pontos:', error);

      await interaction.editReply({
        content: 'Ocorreu um erro ao carregar seu histórico de pontos.',
        embeds: [],
        components: []
      });
    }
  }

  /**
   * Mostra opções para resgatar pontos
   * @param {Interaction} interaction - Interação
   */
  async showRedeemPointsOptions(interaction) {
    await interaction.deferUpdate();

    try {
      const userId = interaction.user.id;

      // Obter pontos
      const loyalty = await loyaltyService.getUserPoints(userId);

      if (loyalty.amount < 100) {
        return await interaction.editReply({
          content: `Você tem apenas ${loyalty.amount} pontos. É necessário um mínimo de 100 pontos para resgatar recompensas.`,
          embeds: [],
          components: []
        });
      }

      // Criar embed com opções
      const embed = new EmbedBuilder()
        .setTitle('🎁 Resgatar Pontos de Fidelidade')
        .setColor(config.discord.embedColors.primary)
        .setDescription(`Você tem **${loyalty.amount} pontos** disponíveis para resgate.\nValor aproximado: R$ ${loyalty.valueInMoney.toFixed(2)}`)
        .addFields(
          { name: '💰 Desconto em compra', value: 'Use seus pontos para obter desconto na próxima compra.' },
          { name: '🎮 Produtos exclusivos', value: 'Troque seus pontos por produtos exclusivos para membros VIP.' },
          { name: '🏆 Cargo VIP no Discord', value: 'Obtenha um cargo exclusivo no servidor com vantagens especiais.' }
        )
        .setFooter({ text: 'A conversão de pontos é de 100 pontos = R$ 1,00 em benefícios' })
        .setTimestamp();

      // Botões de opções
      const row = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId('redeem_discount')
            .setLabel('Desconto em Compra')
            .setStyle(ButtonStyle.Primary),

          new ButtonBuilder()
            .setCustomId('redeem_products')
            .setLabel('Ver Produtos Exclusivos')
            .setStyle(ButtonStyle.Primary),

          new ButtonBuilder()
            .setCustomId('redeem_vip')
            .setLabel('Obter Cargo VIP')
            .setStyle(ButtonStyle.Primary)
        );

      await interaction.editReply({
        embeds: [embed],
        components: [row],
        content: null
      });
    } catch (error) {
      logger.error('Erro ao mostrar opções de resgate de pontos:', error);
      await interaction.editReply({
        content: 'Ocorreu um erro ao carregar as opções de resgate de pontos.',
        embeds: [],
        components: []
      });
    }
  }

  /**
   * Processa o resgate de pontos para desconto
   * @param {Interaction} interaction - Interação
   */
  async handleRedeemDiscount(interaction) {
    await interaction.deferUpdate();

    try {
      const userId = interaction.user.id;

      // Obter pontos do usuário
      const loyalty = await loyaltyService.getUserPoints(userId);

      if (loyalty.amount < 100) {
        return await interaction.editReply({
          content: `Você tem apenas ${loyalty.amount} pontos. É necessário um mínimo de 100 pontos para resgatar descontos.`,
          embeds: [],
          components: []
        });
      }

      // Calcular valor máximo de desconto
      const maxDiscount = Math.floor(loyalty.amount / 100) * 100; // Arredondar para múltiplos de 100
      const maxDiscountValue = (maxDiscount / 100).toFixed(2); // Cada 100 pontos = R$ 1,00

      // Criar embed com opções de desconto
      const embed = new EmbedBuilder()
        .setTitle('💰 Resgate de Desconto')
        .setColor(config.discord.embedColors.primary)
        .setDescription(`Você pode resgatar até ${maxDiscount} pontos (R$ ${maxDiscountValue}).\nEscolha o valor de desconto que deseja aplicar na sua próxima compra:`)
        .setFooter({ text: '100 pontos = R$ 1,00 em desconto' })
        .setTimestamp();

      // Criar botões para diferentes valores de desconto
      const row = new ActionRowBuilder();

      // Adicionar opções de desconto baseadas nos pontos disponíveis
      if (loyalty.amount >= 100) {
        row.addComponents(
          new ButtonBuilder()
            .setCustomId('redeem_100_points')
            .setLabel('100 pontos (R$ 1,00)')
            .setStyle(ButtonStyle.Secondary)
        );
      }

      if (loyalty.amount >= 500) {
        row.addComponents(
          new ButtonBuilder()
            .setCustomId('redeem_500_points')
            .setLabel('500 pontos (R$ 5,00)')
            .setStyle(ButtonStyle.Secondary)
        );
      }

      if (loyalty.amount >= 1000) {
        row.addComponents(
          new ButtonBuilder()
            .setCustomId('redeem_1000_points')
            .setLabel('1000 pontos (R$ 10,00)')
            .setStyle(ButtonStyle.Secondary)
        );
      }

      // Botão para voltar
      row.addComponents(
        new ButtonBuilder()
          .setCustomId('redeem_points')
          .setLabel('Voltar')
          .setStyle(ButtonStyle.Danger)
      );

      await interaction.editReply({
        embeds: [embed],
        components: [row],
        content: null
      });
    } catch (error) {
      logger.error('Erro ao mostrar opções de desconto:', error);
      await interaction.editReply({
        content: 'Ocorreu um erro ao carregar as opções de desconto.',
        embeds: [],
        components: []
      });
    }
  }

  /**
   * Processa o resgate de pontos para produtos exclusivos
   * @param {Interaction} interaction - Interação
   */
  async handleRedeemProducts(interaction) {
    await interaction.deferUpdate();

    try {
      const userId = interaction.user.id;

      // Obter pontos do usuário
      const loyalty = await loyaltyService.getUserPoints(userId);

      if (loyalty.amount < 500) {
        return await interaction.editReply({
          content: `Você tem apenas ${loyalty.amount} pontos. É necessário um mínimo de 500 pontos para resgatar produtos exclusivos.`,
          embeds: [],
          components: []
        });
      }

      // Lista de produtos exclusivos disponíveis para resgate
      const exclusiveProducts = [
        { id: 'vip_week', name: 'Acesso VIP por 7 dias', points: 500, description: 'Acesso a produtos exclusivos e prioridade nos lançamentos por 7 dias.' },
        { id: 'skin_special', name: 'Skin Exclusiva para Membros', points: 1000, description: 'Skin exclusiva para membros VIP (verificar disponibilidade).' },
        { id: 'premium_account', name: 'Conta Premium Verificada', points: 2000, description: 'Conta com email verificado, skin especial e acessos premium.' }
      ];

      // Filtrar produtos que o usuário pode resgatar
      const availableProducts = exclusiveProducts.filter(product => loyalty.amount >= product.points);

      // Criar embed com produtos exclusivos
      const embed = new EmbedBuilder()
        .setTitle('🎮 Produtos Exclusivos')
        .setColor(config.discord.embedColors.primary)
        .setDescription(`Você tem ${loyalty.amount} pontos disponíveis para resgate.\nEscolha um produto exclusivo para resgatar:`)
        .setTimestamp();

      // Adicionar produtos ao embed
      if (availableProducts.length > 0) {
        availableProducts.forEach(product => {
          embed.addFields({
            name: `${product.name} (${product.points} pontos)`,
            value: product.description
          });
        });
      } else {
        embed.addFields({
          name: '⚠️ Sem produtos disponíveis',
          value: 'Você não tem pontos suficientes para resgatar nenhum produto exclusivo no momento.'
        });
      }

      // Criar botões para cada produto
      const row = new ActionRowBuilder();

      availableProducts.forEach(product => {
        row.addComponents(
          new ButtonBuilder()
            .setCustomId(`redeem_product_${product.id}`)
            .setLabel(`${product.name} (${product.points} pts)`)
            .setStyle(ButtonStyle.Secondary)
        );
      });

      // Botão para voltar
      row.addComponents(
        new ButtonBuilder()
          .setCustomId('redeem_points')
          .setLabel('Voltar')
          .setStyle(ButtonStyle.Danger)
      );

      await interaction.editReply({
        embeds: [embed],
        components: [row],
        content: null
      });
    } catch (error) {
      logger.error('Erro ao mostrar produtos exclusivos:', error);
      await interaction.editReply({
        content: 'Ocorreu um erro ao carregar os produtos exclusivos.',
        embeds: [],
        components: []
      });
    }
  }

  /**
   * Processa o resgate de pontos para cargo VIP
   * @param {Interaction} interaction - Interação
   */
  async handleRedeemVIP(interaction) {
    await interaction.deferUpdate();

    try {
      const userId = interaction.user.id;

      // Obter pontos do usuário
      const loyalty = await loyaltyService.getUserPoints(userId);

      if (loyalty.amount < 1000) {
        return await interaction.editReply({
          content: `Você tem apenas ${loyalty.amount} pontos. É necessário um mínimo de 1000 pontos para resgatar o cargo VIP.`,
          embeds: [],
          components: []
        });
      }

      // Opções de cargo VIP
      const vipOptions = [
        { id: 'vip_month', name: 'VIP por 1 mês', points: 1000, description: 'Cargo VIP no Discord por 1 mês. Inclui acesso a canais exclusivos e suporte prioritário.' },
        { id: 'vip_season', name: 'VIP por 3 meses', points: 2500, description: 'Cargo VIP no Discord por 3 meses. Economize pontos com este pacote!' },
        { id: 'vip_perm', name: 'VIP Permanente', points: 5000, description: 'Cargo VIP permanente no servidor. Uma vez conquistado, sempre será VIP!' }
      ];

      // Filtrar opções disponíveis
      const availableOptions = vipOptions.filter(option => loyalty.amount >= option.points);

      // Criar embed com opções de VIP
      const embed = new EmbedBuilder()
        .setTitle('🏆 Cargo VIP no Discord')
        .setColor(config.discord.embedColors.primary)
        .setDescription(`Você tem ${loyalty.amount} pontos disponíveis para resgate.\nEscolha uma opção de cargo VIP:`)
        .setTimestamp();

      // Adicionar opções ao embed
      if (availableOptions.length > 0) {
        availableOptions.forEach(option => {
          embed.addFields({
            name: `${option.name} (${option.points} pontos)`,
            value: option.description
          });
        });
      } else {
        embed.addFields({
          name: '⚠️ Sem opções disponíveis',
          value: 'Você não tem pontos suficientes para resgatar nenhuma opção de cargo VIP no momento.'
        });
      }

      // Criar botões para cada opção
      const row = new ActionRowBuilder();

      availableOptions.forEach(option => {
        row.addComponents(
          new ButtonBuilder()
            .setCustomId(`redeem_vip_${option.id}`)
            .setLabel(`${option.name} (${option.points} pts)`)
            .setStyle(ButtonStyle.Secondary)
        );
      });

      // Botão para voltar
      row.addComponents(
        new ButtonBuilder()
          .setCustomId('redeem_points')
          .setLabel('Voltar')
          .setStyle(ButtonStyle.Danger)
      );

      await interaction.editReply({
        embeds: [embed],
        components: [row],
        content: null
      });
    } catch (error) {
      logger.error('Erro ao mostrar opções de cargo VIP:', error);
      await interaction.editReply({
        content: 'Ocorreu um erro ao carregar as opções de cargo VIP.',
        embeds: [],
        components: []
      });
    }
  }
}

// Exportar instância do handler para uso no sistema
const interactionHandler = new InteractionHandler();

module.exports = {
  // Função de entrada principal para processar qualquer interação
  processInteraction: async (interaction) => {
    return await interactionHandler.processInteraction(interaction);
  },

  // Funções handler específicas expostas para uso direto se necessário
  handleButtonInteraction: async (interaction) => {
    return await interactionHandler.handleButtonInteraction(interaction);
  },

  handleSelectMenuInteraction: async (interaction) => {
    return await interactionHandler.handleSelectMenuInteraction(interaction);
  },

  handleModalSubmitInteraction: async (interaction) => {
    return await interactionHandler.handleModalSubmitInteraction(interaction);
  }
};
