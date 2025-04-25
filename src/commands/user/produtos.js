/**
 * Comando para exibir detalhes de um produto específico
 */

const { SlashCommandBuilder } = require('@discordjs/builders');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const config = require('../../config');
const productService = require('../../product/catalog');
const userService = require('../../user/profile');
const recommendationService = require('../../ai/recommendation');
const { logger } = require('../../utils/helpers');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('produto')
    .setDescription('Mostra os detalhes de um produto específico')
    .addStringOption(option =>
      option.setName('id')
        .setDescription('ID do produto')
        .setRequired(true)),

  async execute(interaction) {
    try {
      await interaction.deferReply();

      const productId = interaction.options.getString('id');

      // Buscar produto
      const produto = await productService.getProductById(productId);

      if (!produto) {
        return await interaction.editReply({
          content: 'Produto não encontrado.',
          ephemeral: true
        });
      }

      // Verificar se produto está disponível
      if (!produto.disponivel || produto.vendido) {
        return await interaction.editReply({
          content: 'Este produto não está mais disponível para compra.',
          ephemeral: true
        });
      }

      // Registrar visualização
      await userService.recordActivity(interaction.user.id, 'PRODUCT_VIEW', { productId });

      // Obter produtos similares
      const similarProducts = await recommendationService.getSimilarProducts(productId, 3);

      // Criar embed com os detalhes do produto
      const embed = new EmbedBuilder()
        .setTitle(`🛍 ${produto.nome}`)
        .setColor(config.discord.embedColors.primary)
        .setDescription(produto.descricao)
        .addFields(
          { name: 'Preço', value: `💰 R$ ${produto.preco.toFixed(2)}`, inline: true },
          { name: 'Tipo', value: produto.tipo, inline: true },
          { name: 'Disponibilidade', value: produto.disponivel ? '✅ Disponível' : '❌ Indisponível', inline: true }
        );

      // Adicionar características específicas do produto
      if (produto.detalhes) {
        const detalhesFields = [];

        // Mapear detalhes específicos para campos do embed
        if (produto.tipo === 'valorant') {
          if (produto.detalhes.rank) detalhesFields.push({ name: 'Rank', value: produto.detalhes.rank, inline: true });
          if (produto.detalhes.skins) detalhesFields.push({ name: 'Skins', value: produto.detalhes.skins.toString(), inline: true });
          if (produto.detalhes.region) detalhesFields.push({ name: 'Região', value: produto.detalhes.region, inline: true });
          if (produto.detalhes.level) detalhesFields.push({ name: 'Nível', value: produto.detalhes.level.toString(), inline: true });
          if (produto.detalhes.agents) detalhesFields.push({ name: 'Agentes', value: produto.detalhes.agents.toString(), inline: true });
          if (produto.detalhes.verification !== undefined) {
            detalhesFields.push({ name: 'Email Verificado', value: produto.detalhes.verification ? 'Sim' : 'Não', inline: true });
          }
        } else {
          // Para outros tipos de produtos, adicionar detalhes genéricos
          Object.entries(produto.detalhes).forEach(([chave, valor]) => {
            detalhesFields.push({ name: chave, value: valor.toString(), inline: true });
          });
        }

        // Adicionar campos de detalhes ao embed
        embed.addFields(...detalhesFields);
      }

      // Adicionar produtos similares se existirem
      if (similarProducts.length > 0) {
        const similarText = similarProducts.map(p =>
          `• **${p.nome}** - R$ ${p.preco.toFixed(2)}`
        ).join('\n');

        embed.addFields({ name: '📋 Produtos Similares', value: similarText });
      }

      // Botões de ação
      const row = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId(`buy_${produto._id}`)
            .setLabel('Comprar')
            .setStyle(ButtonStyle.Success),

          new ButtonBuilder()
            .setCustomId(`minisite_${produto._id}`)
            .setLabel('Ver no Mini-Site')
            .setStyle(ButtonStyle.Link)
            .setURL(`https://seu-dominio.com/produto/${produto._id}`),

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

      if (interaction.deferred) {
        await interaction.editReply({
          content: 'Ocorreu um erro ao buscar os detalhes do produto.',
          ephemeral: true
        });
      } else {
        await interaction.reply({
          content: 'Ocorreu um erro ao buscar os detalhes do produto.',
          ephemeral: true
        });
      }
    }
  }
};
