/**
 * Comando para verificar o perfil do usuário
 */

const { SlashCommandBuilder } = require('@discordjs/builders');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const config = require('../../config');
const userService = require('../../user/profile');
const loyaltyService = require('../../marketing/loyalty');
const { logger } = require('../../utils/helpers');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('perfil')
    .setDescription('Mostra seu perfil e histórico de compras'),

  async execute(interaction) {
    try {
      await interaction.deferReply({ ephemeral: true });

      const userId = interaction.user.id;

      // Obter perfil do usuário
      const userProfile = await userService.getUserProfile(userId);

      if (!userProfile) {
        // Criar perfil caso não exista
        await userService.createUserProfile({
          userId,
          username: interaction.user.tag,
          createdAt: new Date()
        });

        return await interaction.editReply({
          content: 'Perfil criado! Você ainda não tem histórico de compras.',
          ephemeral: true
        });
      }

      // Obter histórico de compras
      const purchaseHistory = await userService.getPurchaseHistory(userId);

      // Obter pontos de fidelidade
      const loyaltyPoints = await loyaltyService.getUserPoints(userId);

      // Criar embed com o perfil
      const embed = new EmbedBuilder()
        .setTitle(`👤 Seu Perfil`)
        .setColor(config.discord.embedColors.primary)
        .setThumbnail(interaction.user.displayAvatarURL())
        .addFields(
          { name: 'Membro desde', value: `${new Date(userProfile.createdAt).toLocaleDateString()}`, inline: true },
          { name: 'Total de compras', value: purchaseHistory.length.toString(), inline: true },
          { name: 'Pontos de fidelidade', value: `${loyaltyPoints.amount} pontos`, inline: true },
          { name: 'Nível de fidelidade', value: `Nível ${loyaltyPoints.level}`, inline: true },
          { name: 'Valor em pontos', value: `R$ ${loyaltyPoints.valueInMoney.toFixed(2)}`, inline: true },
          { name: 'Última atividade', value: new Date(userProfile.lastActive).toLocaleString(), inline: true }
        )
        .setTimestamp();

      // Adicionar histórico de compras recentes
      if (purchaseHistory.length > 0) {
        embed.addFields({
          name: '📋 Compras Recentes',
          value: purchaseHistory.slice(0, 5).map(purchase =>
            `• ${purchase.productName} - R$ ${purchase.amount.toFixed(2)} - ${new Date(purchase.date).toLocaleDateString()}`
          ).join('\n')
        });
      } else {
        embed.addFields({ name: '📋 Compras Recentes', value: 'Você ainda não realizou nenhuma compra.' });
      }

      // Botões para ações
      const row = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId('view_all_purchases')
            .setLabel('Ver Todas as Compras')
            .setStyle(ButtonStyle.Primary)
            .setDisabled(purchaseHistory.length === 0),

          new ButtonBuilder()
            .setCustomId('redeem_points')
            .setLabel('Resgatar Pontos')
            .setStyle(ButtonStyle.Success)
            .setDisabled(loyaltyPoints.amount < 100) // Desabilita se não tiver pontos suficientes
        );

      // Se houver transações de pontos, adicionar botão para ver histórico
      if (loyaltyPoints.transactions && loyaltyPoints.transactions.length > 0) {
        row.addComponents(
          new ButtonBuilder()
            .setCustomId('view_points_history')
            .setLabel('Histórico de Pontos')
            .setStyle(ButtonStyle.Secondary)
        );
      }

      await interaction.editReply({
        embeds: [embed],
        components: [row],
        ephemeral: true
      });
    } catch (error) {
      logger.error('Erro ao mostrar perfil:', error);

      if (interaction.deferred) {
        await interaction.editReply({
          content: 'Ocorreu um erro ao carregar seu perfil.',
          ephemeral: true
        });
      } else {
        await interaction.reply({
          content: 'Ocorreu um erro ao carregar seu perfil.',
          ephemeral: true
        });
      }
    }
  }
};
