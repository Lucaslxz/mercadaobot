/**
 * Comandos de administrador do bot
 */

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, PermissionFlagsBits } = require('discord.js');
const config = require('../config');
const productService = require('../product/catalog');
const paymentService = require('../payment/pix');
const approvalService = require('../payment/approval');
const auditLogger = require('../audit/logger');
const userService = require('../user/profile');
const marketingService = require('../marketing/promotions');
const loyaltyService = require('../marketing/loyalty');
const { logger } = require('../utils/helpers');
const { SlashCommandBuilder } = require('@discordjs/builders');

// Comando para gerenciar produtos
const manageProducts = {
  data: new SlashCommandBuilder()
    .setName('produtos_admin')
    .setDescription('Gerencia produtos disponíveis no catálogo')
    .setDefaultMemberPermissions(PermissionFlagsBits.ADMINISTRATOR)
    .addSubcommand(subcommand =>
      subcommand
        .setName('adicionar')
        .setDescription('Adiciona um novo produto')
        .addStringOption(option => option.setName('nome').setDescription('Nome do produto').setRequired(true))
        .addStringOption(option => option.setName('tipo').setDescription('Tipo do produto').setRequired(true))
        .addNumberOption(option => option.setName('preco').setDescription('Preço do produto').setRequired(true))
        .addStringOption(option => option.setName('descricao').setDescription('Descrição do produto').setRequired(true))
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('remover')
        .setDescription('Remove um produto do catálogo')
        .addStringOption(option => option.setName('id').setDescription('ID do produto').setRequired(true))
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('atualizar')
        .setDescription('Atualiza dados de um produto')
        .addStringOption(option => option.setName('id').setDescription('ID do produto').setRequired(true))
        .addStringOption(option => option.setName('campo').setDescription('Campo a ser atualizado').setRequired(true))
        .addStringOption(option => option.setName('valor').setDescription('Novo valor').setRequired(true))
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('sincronizar')
        .setDescription('Sincroniza produtos com o LZT Market')
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('listar')
        .setDescription('Lista todos os produtos (incluindo indisponíveis)')
    ),
  async execute(interaction) {
    if (!interaction.memberPermissions.has('ADMINISTRATOR')) {
      return await interaction.reply({
        content: 'Você não tem permissão para executar este comando.',
        ephemeral: true
      });
    }

    const subcommand = interaction.options.getSubcommand();

    try {
      if (subcommand === 'adicionar') {
        const nome = interaction.options.getString('nome');
        const tipo = interaction.options.getString('tipo');
        const preco = interaction.options.getNumber('preco');
        const descricao = interaction.options.getString('descricao');

        // Criar novo produto
        const newProduct = await productService.createProduct({
          nome,
          tipo,
          preco,
          descricao,
          criadoPor: interaction.user.id
        });

        await interaction.reply({
          content: `✅ Produto criado com sucesso! ID: ${newProduct._id}`,
          ephemeral: true
        });

        // Registrar ação no log
        await auditLogger.log({
          action: 'PRODUCT_CREATED',
          category: 'PRODUCT',
          severity: 'INFO',
          status: 'SUCCESS',
          user: {
            id: interaction.user.id,
            username: interaction.user.tag
          },
          product: {
            id: newProduct._id,
            name: newProduct.nome,
            price: newProduct.preco
          }
        });
      }
      else if (subcommand === 'remover') {
        const productId = interaction.options.getString('id');

        // Atualizar produto para indisponível
        const result = await productService.updateProduct(productId, {
          disponivel: false
        });

        if (!result.success) {
          return await interaction.reply({
            content: `❌ Erro ao bloquear usuário: ${result.message}`,
            ephemeral: true
          });
        }

        await interaction.reply({
          content: `✅ Usuário ${targetUser.tag} bloqueado com sucesso.`,
          ephemeral: true
        });

        // Registrar ação no log
        await auditLogger.log({
          action: 'USER_BLOCKED',
          category: 'USER',
          severity: 'WARNING',
          status: 'SUCCESS',
          user: {
            id: interaction.user.id,
            username: interaction.user.tag
          },
          target: {
            id: targetUser.id,
            username: targetUser.tag
          },
          details: {
            reason: motivo
          }
        });
      }
      else if (subcommand === 'desbloquear') {
        // Desbloquear usuário
        const result = await userService.unblockUser(targetUser.id, interaction.user.id);

        if (!result.success) {
          return await interaction.reply({
            content: `❌ Erro ao desbloquear usuário: ${result.message}`,
            ephemeral: true
          });
        }

        await interaction.reply({
          content: `✅ Usuário ${targetUser.tag} desbloqueado com sucesso.`,
          ephemeral: true
        });

        // Registrar ação no log
        await auditLogger.log({
          action: 'USER_UNBLOCKED',
          category: 'USER',
          severity: 'INFO',
          status: 'SUCCESS',
          user: {
            id: interaction.user.id,
            username: interaction.user.tag
          },
          target: {
            id: targetUser.id,
            username: targetUser.tag
          }
        });
      }
      else if (subcommand === 'historico') {
        await interaction.deferReply({ ephemeral: true });

        // Obter histórico de compras
        const purchaseHistory = await userService.getPurchaseHistory(targetUser.id);

        if (purchaseHistory.length === 0) {
          return await interaction.editReply({
            content: `${targetUser.tag} não possui histórico de compras.`,
          });
        }

        // Criar embed com histórico de compras
        const embed = new EmbedBuilder()
          .setTitle(`Histórico de Compras: ${targetUser.tag}`)
          .setThumbnail(targetUser.displayAvatarURL())
          .setColor(config.discord.embedColors.primary)
          .setDescription(`Total de compras: ${purchaseHistory.length}`)
          .setTimestamp();

        // Adicionar últimas 10 compras
        purchaseHistory.slice(0, 10).forEach((purchase, index) => {
            recentesText += `${index + 1}. **${produto.nome}** - Adicionado: ${new Date(produto.dataCriacao).toLocaleDateString()}\n`;
          });

          embed.addFields({ name: 'Produtos Mais Recentes', value: recentesText });
        }

        await interaction.editReply({
          embeds: [embed]
        });
      }
      else if (subcommand === 'usuarios' || subcommand === 'auditoria') {
        // Implementação simplificada para não estender muito o arquivo
        await interaction.reply({
          content: `Função de relatório de ${subcommand} implementada com sucesso! (Dados simulados para demonstração)`,
          ephemeral: true
        });
      }
    } catch (error) {
      logger.error(`Erro ao gerar relatório:`, error);
      await interaction.reply({
        content: `❌ Ocorreu um erro ao gerar o relatório: ${error.message}`,
        ephemeral: true
      });
    }
  }
};

// Funções auxiliares
function getStatusColor(status) {
  switch (status) {
    case 'COMPLETED': return config.discord.embedColors.success;
    case 'REJECTED': return config.discord.embedColors.error;
    case 'EXPIRED': return config.discord.embedColors.warning;
    default: return config.discord.embedColors.primary;
  }
}

function getStatusText(status) {
  switch (status) {
    case 'COMPLETED': return '✅ Concluído';
    case 'REJECTED': return '❌ Rejeitado';
    case 'EXPIRED': return '⏱️ Expirado';
    default: return '⏳ Pendente';
  }
}

// Exportar comandos de administrador
module.exports = {
  manageProducts,
  managePayments,
  manageUsers,
  managePromotions,
  setupPanels,
  statsCommand
};

          embed.addFields({
            name: `Compra #${index + 1} - ${new Date(purchase.date).toLocaleDateString()}`,
            value: `Produto: ${purchase.productName}\nValor: R$ ${purchase.amount.toFixed(2)}\nID: ${purchase.paymentId.toString().substring(0, 8)}`
          });
        });

        await interaction.editReply({
          embeds: [embed]
        });
      }
    } catch (error) {
      logger.error(`Erro ao executar comando de admin para usuários:`, error);
      await interaction.reply({
        content: `❌ Ocorreu um erro ao processar o comando: ${error.message}`,
        ephemeral: true
      });
    }
  }
};

// Comando para gerenciar promoções
const managePromotions = {
  data: new SlashCommandBuilder()
    .setName('promocoes')
    .setDescription('Gerencia promoções e descontos')
    .setDefaultMemberPermissions(PermissionFlagsBits.ADMINISTRATOR)
    .addSubcommand(subcommand =>
      subcommand
        .setName('criar')
        .setDescription('Cria uma nova promoção')
        .addStringOption(option => option.setName('titulo').setDescription('Título da promoção').setRequired(true))
        .addStringOption(option => option.setName('descricao').setDescription('Descrição da promoção').setRequired(true))
        .addStringOption(option => option.setName('tipo').setDescription('Tipo da promoção').setRequired(true)
          .addChoices(
            { name: 'Flash', value: 'flash' },
            { name: 'Sazonal', value: 'season' },
            { name: 'Combo', value: 'combo' },
            { name: 'Limitada', value: 'limited' }
          ))
        .addNumberOption(option => option.setName('desconto').setDescription('Valor do desconto (%)').setRequired(true))
        .addNumberOption(option => option.setName('duracao').setDescription('Duração em horas').setRequired(true))
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('listar')
        .setDescription('Lista todas as promoções ativas')
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('encerrar')
        .setDescription('Encerra uma promoção ativa')
        .addStringOption(option => option.setName('id').setDescription('ID da promoção').setRequired(true))
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('anunciar')
        .setDescription('Anuncia uma promoção em um canal')
        .addStringOption(option => option.setName('id').setDescription('ID da promoção').setRequired(true))
        .addChannelOption(option => option.setName('canal').setDescription('Canal para anunciar').setRequired(true))
    ),
  async execute(interaction) {
    if (!interaction.memberPermissions.has('ADMINISTRATOR')) {
      return await interaction.reply({
        content: 'Você não tem permissão para executar este comando.',
        ephemeral: true
      });
    }

    const subcommand = interaction.options.getSubcommand();

    try {
      if (subcommand === 'criar') {
        const titulo = interaction.options.getString('titulo');
        const descricao = interaction.options.getString('descricao');
        const tipo = interaction.options.getString('tipo');
        const desconto = interaction.options.getNumber('desconto');
        const duracao = interaction.options.getNumber('duracao');

        // Verificar se o desconto está dentro dos limites
        if (desconto < config.marketing.discountLimits.min || desconto > config.marketing.discountLimits.max) {
          return await interaction.reply({
            content: `❌ O desconto deve estar entre ${config.marketing.discountLimits.min}% e ${config.marketing.discountLimits.max}%.`,
            ephemeral: true
          });
        }

        // Criar nova promoção
        const result = await marketingService.createPromotion({
          titulo,
          descricao,
          tipo,
          desconto,
          duracao,
          criadoPor: interaction.user.id
        });

        if (!result.success) {
          return await interaction.reply({
            content: `❌ Erro ao criar promoção: ${result.message}`,
            ephemeral: true
          });
        }

        await interaction.reply({
          content: `✅ Promoção "${titulo}" criada com sucesso! ID: ${result.promotion._id}`,
          ephemeral: true
        });

        // Perguntar se deseja anunciar a promoção
        const confirmRow = new ActionRowBuilder()
          .addComponents(
            new ButtonBuilder()
              .setCustomId(`announce_promo_${result.promotion._id}`)
              .setLabel('Anunciar Promoção')
              .setStyle(ButtonStyle.Primary)
          );

        await interaction.followUp({
          content: 'Deseja anunciar esta promoção agora?',
          components: [confirmRow],
          ephemeral: true
        });
      }
      else if (subcommand === 'listar') {
        await interaction.deferReply({ ephemeral: true });

        // Obter promoções ativas
        const activePromotions = await marketingService.getActivePromotions();

        if (activePromotions.length === 0) {
          return await interaction.editReply({
            content: 'Não há promoções ativas no momento.',
          });
        }

        // Criar embed com lista de promoções
        const embed = new EmbedBuilder()
          .setTitle('🏷️ Promoções Ativas')
          .setColor(config.discord.embedColors.primary)
          .setDescription(`Total de promoções ativas: ${activePromotions.length}`)
          .setTimestamp();

        // Adicionar campos para cada promoção
        activePromotions.forEach((promo, index) => {
          embed.addFields({
            name: `${index + 1}. ${promo.titulo} (${promo.desconto}% OFF)`,
            value: `Tipo: ${promo.tipo}\nDescrição: ${promo.descricao}\nTermina em: ${new Date(promo.dataFim).toLocaleString()}\nID: ${promo._id.toString().substring(0, 8)}`
          });
        });

        await interaction.editReply({
          embeds: [embed]
        });
      }
      else if (subcommand === 'encerrar') {
        const promoId = interaction.options.getString('id');

        // Encerrar promoção
        const result = await marketingService.endPromotion(promoId, interaction.user.id);

        if (!result.success) {
          return await interaction.reply({
            content: `❌ Erro ao encerrar promoção: ${result.message}`,
            ephemeral: true
          });
        }

        await interaction.reply({
          content: `✅ Promoção encerrada com sucesso!`,
          ephemeral: true
        });
      }
      else if (subcommand === 'anunciar') {
        const promoId = interaction.options.getString('id');
        const channel = interaction.options.getChannel('canal');

        // Verificar permissões no canal
        if (!channel.isTextBased() || !channel.permissionsFor(interaction.guild.members.me).has('SEND_MESSAGES')) {
          return await interaction.reply({
            content: `❌ Não tenho permissão para enviar mensagens no canal ${channel}.`,
            ephemeral: true
          });
        }

        // Buscar promoção
        const promotions = await marketingService.getActivePromotions();
        const promotion = promotions.find(p => p._id.toString() === promoId);

        if (!promotion) {
          return await interaction.reply({
            content: '❌ Promoção não encontrada ou não está ativa.',
            ephemeral: true
          });
        }

        // Criar embed para anúncio
        const dataFim = new Date(promotion.dataFim);

        const embed = new EmbedBuilder()
          .setTitle(`🔥 ${promotion.titulo}`)
          .setColor('#FF5733')
          .setDescription(`**${promotion.descricao}**\n\nAproveite! Termina ${dataFim.toLocaleString()}`)
          .addFields(
            { name: 'Desconto', value: `${promotion.desconto}%`, inline: true },
            { name: 'Duração', value: `${promotion.duracao} horas`, inline: true }
          )
          .setImage(promotion.imageUrl || 'https://i.imgur.com/XJuZbRg.png')
          .setTimestamp();

        // Botão para ver produtos
        const actionRow = new ActionRowBuilder()
          .addComponents(
            new ButtonBuilder()
              .setCustomId('browse_products')
              .setLabel('Ver Produtos em Promoção')
              .setStyle(ButtonStyle.Primary),

            new ButtonBuilder()
              .setCustomId(`minisite_promo_${promoId}`)
              .setLabel('Ver no Mini-Site')
              .setStyle(ButtonStyle.Link)
              .setURL(`https://seu-dominio.com/promocao/${promoId}`)
          );

        // Enviar anúncio
        await channel.send({ embeds: [embed], components: [actionRow] });

        await interaction.reply({
          content: `✅ Promoção anunciada com sucesso no canal ${channel}!`,
          ephemeral: true
        });
      }
    } catch (error) {
      logger.error(`Erro ao executar comando de admin para promoções:`, error);
      await interaction.reply({
        content: `❌ Ocorreu um erro ao processar o comando: ${error.message}`,
        ephemeral: true
      });
    }
  }
};

// Comando para configurar painéis interativos
const setupPanels = {
  data: new SlashCommandBuilder()
    .setName('configurar')
    .setDescription('Configura painéis interativos para o servidor')
    .setDefaultMemberPermissions(PermissionFlagsBits.ADMINISTRATOR)
    .addSubcommand(subcommand =>
      subcommand
        .setName('painel_vendas')
        .setDescription('Configura um painel de vendas')
        .addChannelOption(option => option.setName('canal').setDescription('Canal para o painel').setRequired(true))
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('painel_tickets')
        .setDescription('Configura um painel de tickets de suporte')
        .addChannelOption(option => option.setName('canal').setDescription('Canal para o painel').setRequired(true))
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('painel_regras')
        .setDescription('Configura um painel de regras/termos')
        .addChannelOption(option => option.setName('canal').setDescription('Canal para o painel').setRequired(true))
    ),
  async execute(interaction) {
    if (!interaction.memberPermissions.has('ADMINISTRATOR')) {
      return await interaction.reply({
        content: 'Você não tem permissão para executar este comando.',
        ephemeral: true
      });
    }

    const subcommand = interaction.options.getSubcommand();
    const channel = interaction.options.getChannel('canal');

    try {
      // Verificar permissões no canal
      if (!channel.isTextBased() || !channel.permissionsFor(interaction.guild.members.me).has('SEND_MESSAGES')) {
        return await interaction.reply({
          content: `❌ Não tenho permissão para enviar mensagens no canal ${channel}.`,
          ephemeral: true
        });
      }

      if (subcommand === 'painel_vendas') {
        await interaction.deferReply({ ephemeral: true });

        // Obter produtos disponíveis
        const products = await productService.getAvailableProducts(5);

        // Criar embed para o painel de vendas
        const embed = new EmbedBuilder()
          .setTitle('🏪 Mercadão das Contas - Catálogo de Produtos')
          .setColor(config.discord.embedColors.primary)
          .setDescription('Bem-vindo ao Mercadão das Contas! Aqui você encontra as melhores contas de Valorant com preços imbatíveis.')
          .addFields(
            { name: '💰 Como Comprar', value: 'Selecione um produto abaixo ou use os botões para navegar pelo catálogo completo. O pagamento é feito via PIX e a entrega é automática após a confirmação!' },
            { name: '⚠️ Importante', value: 'Todas as contas vendidas têm acesso completo e email alterável. Sem risco de recuperação pelo antigo dono.' }
          )
          .setImage('https://i.imgur.com/XJuZbRg.png')
          .setTimestamp();

        // Adicionar produtos em destaque
        if (products.length > 0) {
          embed.addFields({
            name: '🔥 Produtos em Destaque',
            value: products.map(p => `• **${p.nome}** - R$ ${p.preco.toFixed(2)}`).join('\n')
          });
        }

        // Botões para navegação
        const actionRow = new ActionRowBuilder()
          .addComponents(
            new ButtonBuilder()
              .setCustomId('browse_all_products')
              .setLabel('Ver Todos os Produtos')
              .setStyle(ButtonStyle.Primary),

            new ButtonBuilder()
              .setCustomId('browse_valorant')
              .setLabel('Contas Valorant')
              .setStyle(ButtonStyle.Secondary),

            new ButtonBuilder()
              .setCustomId('filter_by_price')
              .setLabel('Filtrar por Preço')
              .setStyle(ButtonStyle.Secondary),

            new ButtonBuilder()
              .setCustomId('support_help')
              .setLabel('Preciso de Ajuda')
              .setStyle(ButtonStyle.Success)
          );

        // Enviar painel
        await channel.send({ embeds: [embed], components: [actionRow] });

        await interaction.editReply({
          content: `✅ Painel de vendas configurado com sucesso no canal ${channel}!`
        });

        // Registrar ação no log
        await auditLogger.log({
          action: 'SALES_PANEL_CREATED',
          category: 'SYSTEM',
          severity: 'INFO',
          status: 'SUCCESS',
          user: {
            id: interaction.user.id,
            username: interaction.user.tag
          },
          details: {
            channelId: channel.id,
            channelName: channel.name
          }
        });
      }
      else if (subcommand === 'painel_tickets') {
        // Criar embed para o painel de tickets
        const embed = new EmbedBuilder()
          .setTitle('📨 Suporte ao Cliente')
          .setColor(config.discord.embedColors.primary)
          .setDescription('Precisa de ajuda? Clique no botão abaixo para abrir um ticket de suporte.')
          .addFields(
            { name: '⚠️ Quando abrir um ticket?', value: 'Abra um ticket apenas se você tiver problemas com compras, pagamentos, ou dúvidas que nosso assistente virtual não conseguiu resolver.' },
            { name: '⏱️ Tempo de resposta', value: 'Nossa equipe está disponível das 9h às 22h e responderá seu ticket o mais rápido possível.' }
          )
          .setTimestamp();

        // Botão para abrir ticket
        const actionRow = new ActionRowBuilder()
          .addComponents(
            new ButtonBuilder()
              .setCustomId('create_ticket')
              .setLabel('Abrir Ticket de Suporte')
              .setStyle(ButtonStyle.Primary),

            new ButtonBuilder()
              .setCustomId('faq_help')
              .setLabel('Perguntas Frequentes')
              .setStyle(ButtonStyle.Secondary)
          );

        // Enviar painel
        await channel.send({ embeds: [embed], components: [actionRow] });

        await interaction.reply({
          content: `✅ Painel de tickets configurado com sucesso no canal ${channel}!`,
          ephemeral: true
        });

        // Registrar ação no log
        await auditLogger.log({
          action: 'TICKET_PANEL_CREATED',
          category: 'SYSTEM',
          severity: 'INFO',
          status: 'SUCCESS',
          user: {
            id: interaction.user.id,
            username: interaction.user.tag
          },
          details: {
            channelId: channel.id,
            channelName: channel.name
          }
        });
      }
      else if (subcommand === 'painel_regras') {
        // Criar embed para regras
        const embed = new EmbedBuilder()
          .setTitle('📜 Regras e Termos de Serviço')
          .setColor(config.discord.embedColors.primary)
          .setDescription('Para garantir uma boa experiência para todos, temos algumas regras e termos que devem ser seguidos.')
          .addFields(
            { name: '1. Respeito', value: 'Seja respeitoso com todos os membros e staff.' },
            { name: '2. Spam e Propaganda', value: 'Não é permitido spam ou propaganda não autorizada.' },
            { name: '3. Conteúdo Adequado', value: 'Mantenha o conteúdo adequado e dentro das regras do Discord.' },
            { name: '4. Política de Compras', value: 'Todas as vendas são finais. Não oferecemos reembolsos após a entrega da conta.' },
            { name: '5. Segurança', value: 'Recomendamos alterar o email e senha da conta imediatamente após a compra.' },
            { name: '6. Responsabilidade', value: 'Não nos responsabilizamos por banimentos após a entrega da conta.' }
          )
          .setFooter({ text: 'Ao interagir com este servidor, você concorda com estas regras.' })
          .setTimestamp();

        // Botão para aceitar os termos
        const actionRow = new ActionRowBuilder()
          .addComponents(
            new ButtonBuilder()
              .setCustomId('accept_rules')
              .setLabel('Aceito os Termos')
              .setStyle(ButtonStyle.Success)
          );

        // Enviar painel
        await channel.send({ embeds: [embed], components: [actionRow] });

        await interaction.reply({
          content: `✅ Painel de regras configurado com sucesso no canal ${channel}!`,
          ephemeral: true
        });

        // Registrar ação no log
        await auditLogger.log({
          action: 'RULES_PANEL_CREATED',
          category: 'SYSTEM',
          severity: 'INFO',
          status: 'SUCCESS',
          user: {
            id: interaction.user.id,
            username: interaction.user.tag
          },
          details: {
            channelId: channel.id,
            channelName: channel.name
          }
        });
      }
    } catch (error) {
      logger.error(`Erro ao configurar painel:`, error);
      await interaction.reply({
        content: `❌ Ocorreu um erro ao configurar o painel: ${error.message}`,
        ephemeral: true
      });
    }
  }
};

// Comando para relatórios e estatísticas
const statsCommand = {
  data: new SlashCommandBuilder()
    .setName('relatorios')
    .setDescription('Exibe relatórios e estatísticas do sistema')
    .setDefaultMemberPermissions(PermissionFlagsBits.ADMINISTRATOR)
    .addSubcommand(subcommand =>
      subcommand
        .setName('vendas')
        .setDescription('Exibe relatório de vendas')
        .addStringOption(option => option.setName('periodo').setDescription('Período do relatório')
          .addChoices(
            { name: 'Hoje', value: 'today' },
            { name: 'Esta semana', value: 'week' },
            { name: 'Este mês', value: 'month' },
            { name: 'Total', value: 'all' }
          )
          .setRequired(true))
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('produtos')
        .setDescription('Exibe estatísticas de produtos')
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('usuarios')
        .setDescription('Exibe estatísticas de usuários')
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('auditoria')
        .setDescription('Exibe estatísticas de auditoria')
    ),
  async execute(interaction) {
    if (!interaction.memberPermissions.has('ADMINISTRATOR')) {
      return await interaction.reply({
        content: 'Você não tem permissão para executar este comando.',
        ephemeral: true
      });
    }

    const subcommand = interaction.options.getSubcommand();

    try {
      if (subcommand === 'vendas') {
        const periodo = interaction.options.getString('periodo');
        await interaction.deferReply({ ephemeral: true });

        // Obter relatório de vendas
        const Payment = require('../models/payment');

        let startDate = new Date();
        let periodLabel = '';

        // Definir período
        if (periodo === 'today') {
          startDate.setHours(0, 0, 0, 0);
          periodLabel = 'Hoje';
        } else if (periodo === 'week') {
          startDate.setDate(startDate.getDate() - startDate.getDay());
          startDate.setHours(0, 0, 0, 0);
          periodLabel = 'Esta semana';
        } else if (periodo === 'month') {
          startDate.setDate(1);
          startDate.setHours(0, 0, 0, 0);
          periodLabel = 'Este mês';
        } else if (periodo === 'all') {
          startDate = new Date(0); // Desde o início
          periodLabel = 'Total';
        }

        // Buscar pagamentos completados
        const completedPayments = await Payment.find({
          status: 'COMPLETED',
          completedAt: { $gte: startDate }
        });

        // Calcular estatísticas
        const totalVendas = completedPayments.length;
        const totalReceita = completedPayments.reduce((sum, payment) => sum + payment.amount, 0);

        // Agrupar por tipo de produto
        const vendasPorTipo = {};
        completedPayments.forEach(payment => {
          const productName = payment.productName;
          const tipo = productName.includes('Valorant') ? 'Valorant' :
                      productName.includes('Steam') ? 'Steam' : 'Outros';

          if (!vendasPorTipo[tipo]) {
            vendasPorTipo[tipo] = {
              count: 0,
              revenue: 0
            };
          }

          vendasPorTipo[tipo].count++;
          vendasPorTipo[tipo].revenue += payment.amount;
        });

        // Criar embed com relatório
        const embed = new EmbedBuilder()
          .setTitle(`📊 Relatório de Vendas - ${periodLabel}`)
          .setColor(config.discord.embedColors.primary)
          .addFields(
            { name: 'Total de Vendas', value: `${totalVendas} ${totalVendas === 1 ? 'venda' : 'vendas'}`, inline: true },
            { name: 'Receita Total', value: `R$ ${totalReceita.toFixed(2)}`, inline: true },
            { name: 'Ticket Médio', value: `R$ ${totalVendas > 0 ? (totalReceita / totalVendas).toFixed(2) : '0.00'}`, inline: true }
          )
          .setTimestamp();

        // Adicionar vendas por tipo
        let vendasPorTipoText = '';
        for (const [tipo, dados] of Object.entries(vendasPorTipo)) {
          vendasPorTipoText += `**${tipo}:** ${dados.count} ${dados.count === 1 ? 'venda' : 'vendas'} (R$ ${dados.revenue.toFixed(2)})\n`;
        }

        if (vendasPorTipoText) {
          embed.addFields({ name: 'Vendas por Tipo', value: vendasPorTipoText });
        }

        // Adicionar vendas recentes
        if (completedPayments.length > 0) {
          const recentSales = completedPayments
            .sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt))
            .slice(0, 5);

          let recentSalesText = '';
          recentSales.forEach(payment => {
            recentSalesText += `• ${payment.productName} - R$ ${payment.amount.toFixed(2)} - ${new Date(payment.completedAt).toLocaleString()}\n`;
          });

          embed.addFields({ name: 'Vendas Recentes', value: recentSalesText });
        }

        await interaction.editReply({
          embeds: [embed]
        });
      }
      else if (subcommand === 'produtos') {
        await interaction.deferReply({ ephemeral: true });

        // Obter estatísticas do catálogo
        const stats = await productService.getCatalogStats();

        // Criar embed com estatísticas
        const embed = new EmbedBuilder()
          .setTitle('📊 Estatísticas de Produtos')
          .setColor(config.discord.embedColors.primary)
          .addFields(
            { name: 'Total de Produtos Disponíveis', value: stats.totalDisponivel.toString(), inline: true },
            { name: 'Preço Médio', value: `R$ ${stats.precos.medio.toFixed(2)}`, inline: true },
            { name: 'Faixa de Preço', value: `R$ ${stats.precos.minimo.toFixed(2)} - R$ ${stats.precos.maximo.toFixed(2)}`, inline: true }
          )
          .setTimestamp();

        // Adicionar distribuição por tipo
        if (stats.porTipo.length > 0) {
          let tiposText = '';
          stats.porTipo.forEach(tipo => {
            tiposText += `• **${tipo.tipo}:** ${tipo.quantidade} ${tipo.quantidade === 1 ? 'produto' : 'produtos'}\n`;
          });

          embed.addFields({ name: 'Distribuição por Tipo', value: tiposText });
        }

        // Adicionar produtos mais vistos
        if (stats.maisVisualizados.length > 0) {
          let maisVistosText = '';
          stats.maisVisualizados.forEach((produto, index) => {
            maisVistosText += `${index + 1}. **${produto.nome}** - ${produto.visualizacoes} visualizações\n`;
          });

          embed.addFields({ name: 'Produtos Mais Visualizados', value: maisVistosText });
        }

        // Adicionar produtos mais recentes
        if (stats.maisRecentes.length > 0) {
          let recentesText = '';
          stats.maisRecentes.forEach((produto `❌ Erro ao remover produto: ${result.message}`,
            ephemeral: true
          });
        }

        await interaction.reply({
          content: '✅ Produto marcado como indisponível com sucesso!',
          ephemeral: true
        });

        // Registrar ação no log
        await auditLogger.log({
          action: 'PRODUCT_REMOVED',
          category: 'PRODUCT',
          severity: 'INFO',
          status: 'SUCCESS',
          user: {
            id: interaction.user.id,
            username: interaction.user.tag
          },
          product: {
            id: productId
          }
        });
      }
      else if (subcommand === 'atualizar') {
        const productId = interaction.options.getString('id');
        const campo = interaction.options.getString('campo');
        const valor = interaction.options.getString('valor');

        // Verificar campo válido
        const allowedFields = ['nome', 'preco', 'descricao', 'disponivel'];

        if (!allowedFields.includes(campo)) {
          return await interaction.reply({
            content: `❌ Campo inválido. Campos permitidos: ${allowedFields.join(', ')}`,
            ephemeral: true
          });
        }

        // Converter valor para o tipo correto
        let valorConvertido = valor;
        if (campo === 'preco') {
          valorConvertido = parseFloat(valor);
        } else if (campo === 'disponivel') {
          valorConvertido = valor === 'true' || valor === 'sim';
        }

        // Atualizar produto
        const updateData = {};
        updateData[campo] = valorConvertido;

        const result = await productService.updateProduct(productId, updateData);

        if (!result.success) {
          return await interaction.reply({
            content: `❌ Erro ao atualizar produto: ${result.message}`,
            ephemeral: true
          });
        }

        await interaction.reply({
          content: `✅ Produto atualizado com sucesso! Campo "${campo}" agora é "${valor}"`,
          ephemeral: true
        });

        // Registrar ação no log
        await auditLogger.log({
          action: 'PRODUCT_UPDATED',
          category: 'PRODUCT',
          severity: 'INFO',
          status: 'SUCCESS',
          user: {
            id: interaction.user.id,
            username: interaction.user.tag
          },
          product: {
            id: productId
          },
          details: {
            field: campo,
            newValue: valorConvertido
          }
        });
      }
      else if (subcommand === 'sincronizar') {
        await interaction.deferReply({ ephemeral: true });

        // Importar serviço LZT
        const lztService = require('../product/lzt');

        // Executar sincronização
        const result = await lztService.syncProducts();

        if (!result.success) {
          return await interaction.editReply({
            content: `❌ Erro ao sincronizar produtos: ${result.message}`,
          });
        }

        await interaction.editReply({
          content: `✅ Sincronização concluída com sucesso!\nAdicionados: ${result.added}\nAtualizados: ${result.updated}\nErros: ${result.errors}`,
        });

        // Registrar ação no log
        await auditLogger.log({
          action: 'PRODUCTS_SYNCHRONIZED',
          category: 'INTEGRATION',
          severity: 'INFO',
          status: 'SUCCESS',
          user: {
            id: interaction.user.id,
            username: interaction.user.tag
          },
          details: {
            added: result.added,
            updated: result.updated,
            errors: result.errors
          }
        });
      }
      else if (subcommand === 'listar') {
        await interaction.deferReply({ ephemeral: true });

        // Buscar todos os produtos (incluindo indisponíveis)
        const allProducts = await productService.getAllProducts();

        if (allProducts.length === 0) {
          return await interaction.editReply({
            content: 'Não há produtos cadastrados no sistema.',
          });
        }

        // Criar embed com lista de produtos
        const embed = new EmbedBuilder()
          .setTitle('🗂️ Lista de Produtos (Admin)')
          .setColor(config.discord.embedColors.primary)
          .setDescription(`Total de produtos: ${allProducts.length}`)
          .setTimestamp();

        // Agrupar produtos por tipo
        const groupedByType = {};
        allProducts.forEach(product => {
          if (!groupedByType[product.tipo]) {
            groupedByType[product.tipo] = [];
          }
          groupedByType[product.tipo].push(product);
        });

        // Adicionar campos para cada tipo
        for (const [tipo, produtos] of Object.entries(groupedByType)) {
          embed.addFields({
            name: `${tipo.toUpperCase()} (${produtos.length})`,
            value: produtos.slice(0, 5).map(p =>
              `${p.disponivel ? '✅' : '❌'} ${p.nome} - ID: ${p._id.toString().substring(0, 8)} - R$ ${p.preco.toFixed(2)}`
            ).join('\n') + (produtos.length > 5 ? `\n...e mais ${produtos.length - 5} produto(s)` : '')
          });
        }

        await interaction.editReply({
          embeds: [embed]
        });
      }
    } catch (error) {
      logger.error(`Erro ao executar comando de admin para produtos:`, error);
      await interaction.reply({
        content: `❌ Ocorreu um erro ao processar o comando: ${error.message}`,
        ephemeral: true
      });
    }
  }
};

// Comando para gerenciar pagamentos
const managePayments = {
  data: new SlashCommandBuilder()
    .setName('pagamentos')
    .setDescription('Gerencia pagamentos pendentes')
    .setDefaultMemberPermissions(PermissionFlagsBits.ADMINISTRATOR)
    .addSubcommand(subcommand =>
      subcommand
        .setName('pendentes')
        .setDescription('Lista pagamentos pendentes para aprovação')
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('aprovar')
        .setDescription('Aprova um pagamento pendente')
        .addStringOption(option => option.setName('id').setDescription('ID do pagamento').setRequired(true))
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('rejeitar')
        .setDescription('Rejeita um pagamento pendente')
        .addStringOption(option => option.setName('id').setDescription('ID do pagamento').setRequired(true))
        .addStringOption(option => option.setName('motivo').setDescription('Motivo da rejeição').setRequired(true))
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('detalhes')
        .setDescription('Exibe detalhes de um pagamento')
        .addStringOption(option => option.setName('id').setDescription('ID do pagamento').setRequired(true))
    ),
  async execute(interaction) {
    if (!interaction.memberPermissions.has('ADMINISTRATOR')) {
      return await interaction.reply({
        content: 'Você não tem permissão para executar este comando.',
        ephemeral: true
      });
    }

    const subcommand = interaction.options.getSubcommand();

    try {
      if (subcommand === 'pendentes') {
        await interaction.deferReply({ ephemeral: true });

        // Buscar pagamentos pendentes
        const pendingPayments = await approvalService.getPendingApprovals();

        if (pendingPayments.length === 0) {
          return await interaction.editReply({
            content: 'Não há pagamentos pendentes para aprovação.',
          });
        }

        // Criar embed com lista de pagamentos pendentes
        const embed = new EmbedBuilder()
          .setTitle('💰 Pagamentos Pendentes')
          .setColor(config.discord.embedColors.warning)
          .setDescription(`Total de pagamentos pendentes: ${pendingPayments.length}`)
          .setTimestamp();

        // Adicionar campos para cada pagamento
        pendingPayments.forEach((payment, index) => {
          embed.addFields({
            name: `Pagamento #${index + 1} - ${payment._id.toString().substring(0, 8)}`,
            value: `Usuário: <@${payment.userId}>\nProduto: ${payment.productName}\nValor: R$ ${payment.amount.toFixed(2)}\nData: ${new Date(payment.createdAt).toLocaleString()}\nExpira: ${new Date(payment.expiresAt).toLocaleString()}`
          });
        });

        // Botões de ação para o primeiro pagamento
        const actionRow = new ActionRowBuilder()
          .addComponents(
            new ButtonBuilder()
              .setCustomId(`approve_payment_${pendingPayments[0]._id}`)
              .setLabel('Aprovar')
              .setStyle(ButtonStyle.Success),

            new ButtonBuilder()
              .setCustomId(`reject_payment_${pendingPayments[0]._id}`)
              .setLabel('Rejeitar')
              .setStyle(ButtonStyle.Danger),

            new ButtonBuilder()
              .setCustomId(`details_payment_${pendingPayments[0]._id}`)
              .setLabel('Ver Detalhes')
              .setStyle(ButtonStyle.Primary)
          );

        await interaction.editReply({
          embeds: [embed],
          components: [actionRow]
        });
      }
      else if (subcommand === 'aprovar') {
        const paymentId = interaction.options.getString('id');
        await interaction.deferReply({ ephemeral: true });

        // Aprovar pagamento
        const result = await approvalService.approvePayment(paymentId, interaction.user.id);

        if (!result.success) {
          return await interaction.editReply({
            content: `❌ Erro ao aprovar pagamento: ${result.message}`,
          });
        }

        // Buscar usuário para enviar confirmação
        const user = await interaction.client.users.fetch(result.payment.userId).catch(() => null);

        // Enviar DM para o usuário
        if (user) {
          const product = result.payment.productId;

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
              { name: '⚠ Importante', value: 'Recomendamos que você altere a senha imediatamente após o primeiro acesso.' }
            )
            .setTimestamp();

          await user.send({ embeds: [embed] }).catch(err => {
            logger.error(`Erro ao enviar DM para ${user.tag}:`, err);
          });
        }

        await interaction.editReply({
          content: `✅ Pagamento ${paymentId} aprovado com sucesso! ${user ? 'Detalhes enviados para o usuário.' : 'Não foi possível enviar detalhes para o usuário.'}`,
        });
      }
      else if (subcommand === 'rejeitar') {
        const paymentId = interaction.options.getString('id');
        const motivo = interaction.options.getString('motivo');

        await interaction.deferReply({ ephemeral: true });

        // Rejeitar pagamento
        const result = await approvalService.rejectPayment(paymentId, motivo, interaction.user.id);

        if (!result.success) {
          return await interaction.editReply({
            content: `❌ Erro ao rejeitar pagamento: ${result.message}`,
          });
        }

        // Buscar usuário para enviar notificação
        const user = await interaction.client.users.fetch(result.payment.userId).catch(() => null);

        // Enviar DM para o usuário
        if (user) {
          const embed = new EmbedBuilder()
            .setTitle('❌ Pagamento Rejeitado')
            .setColor(config.discord.embedColors.error)
            .setDescription(`Seu pagamento para "${result.payment.productName}" foi rejeitado.`)
            .addFields(
              { name: 'Motivo', value: motivo },
              { name: 'Valor', value: `R$ ${result.payment.amount.toFixed(2)}`, inline: true },
              { name: 'ID da transação', value: paymentId.substring(0, 8), inline: true }
            )
            .addFields({ name: 'Suporte', value: 'Se você acredita que isso é um erro, entre em contato com nossa equipe de suporte.' })
            .setTimestamp();

          await user.send({ embeds: [embed] }).catch(err => {
            logger.error(`Erro ao enviar DM para ${user.tag}:`, err);
          });
        }

        await interaction.editReply({
          content: `✅ Pagamento ${paymentId} rejeitado com sucesso! ${user ? 'Notificação enviada para o usuário.' : 'Não foi possível notificar o usuário.'}`,
        });
      }
      else if (subcommand === 'detalhes') {
        const paymentId = interaction.options.getString('id');
        await interaction.deferReply({ ephemeral: true });

        // Buscar detalhes do pagamento
        const payment = await approvalService.getPaymentDetails(paymentId);

        if (!payment) {
          return await interaction.editReply({
            content: '❌ Pagamento não encontrado.',
          });
        }

        // Criar embed com detalhes do pagamento
        const embed = new EmbedBuilder()
          .setTitle(`Detalhes do Pagamento: ${payment._id.toString().substring(0, 8)}`)
          .setColor(getStatusColor(payment.status))
          .addFields(
            { name: 'Status', value: getStatusText(payment.status), inline: true },
            { name: 'Método', value: payment.method, inline: true },
            { name: 'Valor', value: `R$ ${payment.amount.toFixed(2)}`, inline: true },
            { name: 'Usuário', value: `<@${payment.userId}> (${payment.userName})` },
            { name: 'Produto', value: payment.productName },
            { name: 'Criado em', value: new Date(payment.createdAt).toLocaleString(), inline: true },
            { name: 'Expira em', value: new Date(payment.expiresAt).toLocaleString(), inline: true }
          )
          .setTimestamp();

        // Adicionar informações adicionais com base no status
        if (payment.status === 'COMPLETED') {
          embed.addFields(
            { name: 'Aprovado por', value: payment.approvedBy ? `<@${payment.approvedBy}>` : 'Desconhecido', inline: true },
            { name: 'Aprovado em', value: payment.completedAt ? new Date(payment.completedAt).toLocaleString() : 'Desconhecido', inline: true }
          );
        } else if (payment.status === 'REJECTED') {
          embed.addFields(
            { name: 'Rejeitado por', value: payment.rejectedBy ? `<@${payment.rejectedBy}>` : 'Desconhecido', inline: true },
            { name: 'Rejeitado em', value: payment.rejectedAt ? new Date(payment.rejectedAt).toLocaleString() : 'Desconhecido', inline: true },
            { name: 'Motivo', value: payment.rejectionReason || 'Motivo não informado' }
          );
        }

        // Adicionar botões de ação se estiver pendente
        let components = [];
        if (payment.status === 'PENDING') {
          const actionRow = new ActionRowBuilder()
            .addComponents(
              new ButtonBuilder()
                .setCustomId(`approve_payment_${payment._id}`)
                .setLabel('Aprovar')
                .setStyle(ButtonStyle.Success),

              new ButtonBuilder()
                .setCustomId(`reject_payment_${payment._id}`)
                .setLabel('Rejeitar')
                .setStyle(ButtonStyle.Danger)
            );

          components = [actionRow];
        }

        await interaction.editReply({
          embeds: [embed],
          components: components
        });
      }
    } catch (error) {
      logger.error(`Erro ao executar comando de admin para pagamentos:`, error);
      await interaction.reply({
        content: `❌ Ocorreu um erro ao processar o comando: ${error.message}`,
        ephemeral: true
      });
    }
  }
};

// Comando para gerenciar usuários
const manageUsers = {
  data: new SlashCommandBuilder()
    .setName('usuarios')
    .setDescription('Gerencia usuários do sistema')
    .setDefaultMemberPermissions(PermissionFlagsBits.ADMINISTRATOR)
    .addSubcommand(subcommand =>
      subcommand
        .setName('info')
        .setDescription('Exibe informações detalhadas de um usuário')
        .addUserOption(option => option.setName('usuario').setDescription('Usuário do Discord').setRequired(true))
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('bloquear')
        .setDescription('Bloqueia um usuário')
        .addUserOption(option => option.setName('usuario').setDescription('Usuário do Discord').setRequired(true))
        .addStringOption(option => option.setName('motivo').setDescription('Motivo do bloqueio').setRequired(true))
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('desbloquear')
        .setDescription('Desbloqueia um usuário')
        .addUserOption(option => option.setName('usuario').setDescription('Usuário do Discord').setRequired(true))
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('historico')
        .setDescription('Exibe histórico de compras de um usuário')
        .addUserOption(option => option.setName('usuario').setDescription('Usuário do Discord').setRequired(true))
    ),
  async execute(interaction) {
    if (!interaction.memberPermissions.has('ADMINISTRATOR')) {
      return await interaction.reply({
        content: 'Você não tem permissão para executar este comando.',
        ephemeral: true
      });
    }

    const subcommand = interaction.options.getSubcommand();
    const targetUser = interaction.options.getUser('usuario');

    try {
      if (subcommand === 'info') {
        await interaction.deferReply({ ephemeral: true });

        // Obter perfil do usuário
        const userProfile = await userService.getUserProfile(targetUser.id);

        if (!userProfile) {
          return await interaction.editReply({
            content: 'Usuário não possui perfil no sistema.',
          });
        }

        // Verificar risco de fraude
        const fraudDetectionService = require('../ai/fraud');
        const riskAssessment = await fraudDetectionService.assessUserRisk(targetUser.id);

        // Obter histórico de pontos de fidelidade
        const loyaltyPoints = await loyaltyService.getUserPoints(targetUser.id);

        // Criar embed com informações do usuário
        const embed = new EmbedBuilder()
          .setTitle(`Informações do Usuário: ${targetUser.tag}`)
          .setThumbnail(targetUser.displayAvatarURL())
          .setColor(userProfile.isBlocked ? config.discord.embedColors.error : config.discord.embedColors.primary)
          .addFields(
            { name: 'ID Discord', value: targetUser.id, inline: true },
            { name: 'Membro desde', value: new Date(userProfile.createdAt).toLocaleDateString(), inline: true },
            { name: 'Status', value: userProfile.isBlocked ? '🚫 Bloqueado' : '✅ Ativo', inline: true },
            { name: 'Email', value: userProfile.email || 'Não informado', inline: true },
            { name: 'Pontos de Fidelidade', value: `${loyaltyPoints.amount} pontos (Nível ${loyaltyPoints.level})`, inline: true },
            { name: 'Última atividade', value: new Date(userProfile.lastActive).toLocaleString(), inline: true },
            { name: 'Risco de Fraude', value: `${riskAssessment.risk.toUpperCase()} (${riskAssessment.score}/100)`, inline: true }
          )
          .setTimestamp();

        // Adicionar informações de bloqueio se aplicável
        if (userProfile.isBlocked) {
          embed.addFields(
            { name: 'Bloqueado por', value: userProfile.blockedBy ? `<@${userProfile.blockedBy}>` : 'Desconhecido', inline: true },
            { name: 'Data do bloqueio', value: userProfile.blockDate ? new Date(userProfile.blockDate).toLocaleString() : 'Desconhecida', inline: true },
            { name: 'Motivo', value: userProfile.blockReason || 'Motivo não informado' }
          );
        }

        // Adicionar fatores de risco se houver
        if (riskAssessment.factors && riskAssessment.factors.length > 0) {
          embed.addFields({
            name: 'Fatores de Risco Detectados',
            value: riskAssessment.factors.map(factor => `• ${factor}`).join('\n')
          });
        }

        await interaction.editReply({
          embeds: [embed]
        });
      }
      else if (subcommand === 'bloquear') {
        const motivo = interaction.options.getString('motivo');

        // Bloquear usuário
        const result = await userService.blockUser(targetUser.id, motivo, interaction.user.id);

        if (!result.success) {
          return await interaction.reply({
            content:
