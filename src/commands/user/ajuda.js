/**
 * Comando para obter ajuda do assistente virtual
 */

const { SlashCommandBuilder } = require('@discordjs/builders');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const config = require('../../config');
const assistantService = require('../../ai/assistant');
const userService = require('../../user/profile');
const { logger } = require('../../utils/helpers');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ajuda')
    .setDescription('Obtém ajuda do assistente virtual')
    .addStringOption(option =>
      option.setName('pergunta')
        .setDescription('Sua pergunta ou dúvida')
        .setRequired(false)),

  async execute(interaction) {
    try {
      // Verificar se tem pergunta ou mostrar menu de ajuda
      const question = interaction.options.getString('pergunta');

      if (!question) {
        // Exibir menu de ajuda geral
        const embed = new EmbedBuilder()
          .setTitle('❓ Central de Ajuda')
          .setColor(config.discord.embedColors.primary)
          .setDescription('Olá! Como posso ajudar você hoje?')
          .addFields(
            { name: '📦 Produtos', value: 'Use `/produtos` para ver o catálogo completo' },
            { name: '🛒 Compras', value: 'Use `/comprar id` para comprar um produto' },
            { name: '🔍 Detalhes', value: 'Use `/produto id` para ver detalhes de um produto' },
            { name: '🤖 Recomendações', value: 'Use `/recomendacoes` para ver produtos recomendados' },
            { name: '❓ Dúvidas específicas', value: 'Use `/ajuda pergunta:sua dúvida` para perguntar ao assistente virtual' }
          )
          .setFooter({ text: 'Digite /ajuda seguido da sua dúvida para perguntar ao assistente virtual.' });

        // Botões para perguntas frequentes
        const row = new ActionRowBuilder()
          .addComponents(
            new ButtonBuilder()
              .setCustomId('faq_pagamento')
              .setLabel('Como pagar?')
              .setStyle(ButtonStyle.Primary),

            new ButtonBuilder()
              .setCustomId('faq_entrega')
              .setLabel('Tempo de entrega')
              .setStyle(ButtonStyle.Primary),

            new ButtonBuilder()
              .setCustomId('faq_garantia')
              .setLabel('Tem garantia?')
              .setStyle(ButtonStyle.Primary),

            new ButtonBuilder()
              .setCustomId('open_ticket')
              .setLabel('Falar com Atendente')
              .setStyle(ButtonStyle.Success)
          );

        return await interaction.reply({
          embeds: [embed],
          components: [row],
          ephemeral: true
        });
      }

      await interaction.deferReply();

      // Registrar pergunta para o assistente
      await userService.recordActivity(interaction.user.id, 'ASSISTANT_QUERY', { query: question });

      // Obter resposta do assistente virtual
      const response = await assistantService.getResponse(question, interaction.user.id);

      // Criar embed com a resposta
      const embed = new EmbedBuilder()
        .setTitle('🤖 Assistente Virtual')
        .setColor(config.discord.embedColors.primary)
        .setDescription(`**Sua pergunta:** ${question}\n\n**Resposta:** ${response.answer}`)
        .setTimestamp();

      // Adicionar sugestões relacionadas se houver
      if (response.suggestions && response.suggestions.length > 0) {
        embed.addFields({
          name: 'Perguntas relacionadas',
          value: response.suggestions.join('\n')
        });
      }

      // Botões para feedback sobre a resposta
      const row = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId(`assistant_helpful_${response.id}`)
            .setLabel('👍 Útil')
            .setStyle(ButtonStyle.Success),

          new ButtonBuilder()
            .setCustomId(`assistant_not_helpful_${response.id}`)
            .setLabel('👎 Não ajudou')
            .setStyle(ButtonStyle.Danger),

          new ButtonBuilder()
            .setCustomId('assistant_talk_human')
            .setLabel('👨‍💼 Falar com atendente')
            .setStyle(ButtonStyle.Secondary)
        );

      await interaction.editReply({
        embeds: [embed],
        components: [row]
      });
    } catch (error) {
      logger.error('Erro ao processar pergunta para o assistente:', error);

      if (interaction.deferred) {
        await interaction.editReply({
          content: 'Ocorreu um erro ao processar sua pergunta. Por favor, tente novamente mais tarde.'
        });
      } else {
        await interaction.reply({
          content: 'Ocorreu um erro ao processar sua pergunta. Por favor, tente novamente mais tarde.',
          ephemeral: true
        });
      }
    }
  },

  // Função para lidar com botões FAQs
  async handleFaqButton(interaction, faqType) {
    try {
      // Mapear perguntas frequentes
      const faqQuestions = {
        'faq_pagamento': 'Como faço para pagar?',
        'faq_entrega': 'Qual o tempo de entrega após o pagamento?',
        'faq_garantia': 'As contas têm garantia?',
        'faq_seguranca': 'É seguro comprar contas?',
        'faq_alterar': 'Como alterar o email da conta após a compra?'
      };

      const question = faqQuestions[faqType] || 'Preciso de ajuda';

      // Buscar resposta do assistente
      const response = await assistantService.getResponse(question, interaction.user.id);

      // Criar embed com a resposta
      const embed = new EmbedBuilder()
        .setTitle('🤖 Assistente Virtual')
        .setColor(config.discord.embedColors.primary)
        .setDescription(`**Pergunta frequente:** ${question}\n\n**Resposta:** ${response.answer}`)
        .setTimestamp();

      // Botões para feedback
      const row = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId(`assistant_helpful_${response.id}`)
            .setLabel('👍 Útil')
            .setStyle(ButtonStyle.Success),

          new ButtonBuilder()
            .setCustomId(`assistant_not_helpful_${response.id}`)
            .setLabel('👎 Não ajudou')
            .setStyle(ButtonStyle.Danger),

          new ButtonBuilder()
            .setCustomId('faq_menu')
            .setLabel('Outras Perguntas')
            .setStyle(ButtonStyle.Secondary)
        );

      await interaction.update({
        embeds: [embed],
        components: [row]
      });
    } catch (error) {
      logger.error('Erro ao processar FAQ:', error);
      await interaction.reply({
        content: 'Ocorreu um erro ao buscar a resposta. Por favor, tente novamente mais tarde.',
        ephemeral: true
      });
    }
  }
};
