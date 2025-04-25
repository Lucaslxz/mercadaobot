/**
 * Comando para obter recomendações personalizadas
 */

const { SlashCommandBuilder } = require('@discordjs/builders');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const config = require('../../config');
const recommendationService = require('../../ai/recommendation');
const userService = require('../../user/profile');
const { logger } = require('../../utils/helpers');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('recomendacoes')
    .setDescription('Mostra produtos recomendados com base no seu perfil'),

  async execute(interaction) {
    try {
      await interaction.deferReply();

      const userId = interaction.user.id;

      // Obter recomendações personalizadas
      const recomendacoes = await recommendationService.getRecommendationsForUser(userId);

      if (recomendacoes.length === 0) {
        return await interaction.editReply({
          content: 'Não foi possível gerar recomendações personalizadas. Continue explorando nossos produtos para recebermos mais informações sobre suas preferências.',
          ephemeral: true
        });
      }

      // Registrar atividade
      await userService.recordActivity(userId, 'RECOMMENDATIONS_VIEWED', {
        recommendationsCount: recomendacoes.length
      });

      // Criar embed com as recomendações
      const embed = new EmbedBuilder()
        .setTitle('🔮 Recomendações Personalizadas')
        .setColor(config.discord.embedColors.primary)
        .setDescription('Com base nas suas preferências e histórico, encontramos estes produtos que podem te interessar:')
        .setTimestamp();

      // Adicionar produtos recomendados ao embed
      recomendacoes.forEach((produto, index) => {
        embed.addFields({
          name: `${index + 1}. ${produto.nome}`,
          value: `💰 R$ ${produto.preco.toFixed(2)}\n${produto.descricao.substring(0, 100)}${produto.descricao.length > 100 ? '...' : ''}`
        });
      });

      // Botões para cada recomendação (máximo 5)
      const maxRecommendations = Math.min(recomendacoes.length, 5);
      const buttons = [];

      for (let i = 0; i < maxRecommendations; i++) {
        buttons.push(
          new ButtonBuilder()
            .setCustomId(`view_product_${recomendacoes[i]._id}`)
            .setLabel(`Ver Produto ${i + 1}`)
            .setStyle(ButtonStyle.Primary)
        );
      }

      // Adicionar botão para ver catálogo completo
      buttons.push(
        new ButtonBuilder()
          .setCustomId('browse_all_products')
          .setLabel('Ver Catálogo Completo')
          .setStyle(ButtonStyle.Secondary)
      );

      // Criar componentes (dividir em múltiplas linhas se necessário)
      const components = [];

      // Primeira linha de botões (máximo 5 por linha)
      const firstRow = new ActionRowBuilder().addComponents(buttons.slice(0, 5));
      components.push(firstRow);

      // Segunda linha se necessário
      if (buttons.length > 5) {
        const secondRow = new ActionRowBuilder().addComponents(buttons.slice(5));
        components.push(secondRow);
      }

      await interaction.editReply({
        embeds: [embed],
        components: components
      });
    } catch (error) {
      logger.error('Erro ao gerar recomendações:', error);

      if (interaction.deferred) {
        await interaction.editReply({
          content: 'Ocorreu um erro ao gerar recomendações de produtos.',
          ephemeral: true
        });
      } else {
        await interaction.reply({
          content: 'Ocorreu um erro ao gerar recomendações de produtos.',
          ephemeral: true
        });
      }
    }
  }
};
