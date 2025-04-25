/**
 * Comando para iniciar o processo de compra de um produto
 */

const { SlashCommandBuilder } = require('@discordjs/builders');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const config = require('../../config');
const productService = require('../../product/catalog');
const paymentService = require('../../payment/pix');
const userService = require('../../user/profile');
const marketingService = require('../../marketing/promotions');
const { logger } = require('../../utils/helpers');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('comprar')
    .setDescription('Inicia o processo de compra de um produto')
    .addStringOption(option =>
      option.setName('id')
        .setDescription('ID do produto')
        .setRequired(true)),

  async execute(interaction) {
    try {
      await interaction.deferReply({ ephemeral: true });

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

      // Verificar fraude
      const fraudDetectionService = require('../../ai/fraud');
      const riskAssessment = await fraudDetectionService.assessUserRisk(interaction.user.id);

      if (riskAssessment.risk === 'high') {
        return await interaction.editReply({
          content: 'Não foi possível iniciar sua compra. Por favor, entre em contato com o suporte.',
          ephemeral: true
        });
      }

      // Verificar se existe promoção aplicável e calcular preço final
      const pricing = await marketingService.getPromotionalPrice(productId, produto.preco, produto.tipo);
      const precoFinal = pricing.discountedPrice;

      // Criar pagamento
      const payment = await paymentService.createPayment({
        userId: interaction.user.id,
        userName: interaction.user.tag,
        productId: produto._id,
        productName: produto.nome,
        amount: precoFinal
      });

      // Registrar iniciação de pagamento
      await userService.recordActivity(interaction.user.id, 'PAYMENT_INITIATED', {
        productId: produto._id,
        paymentId: payment._id,
        amount: precoFinal
      });

      // Criar embed com instruções de pagamento
      const embed = new EmbedBuilder()
        .setTitle('💰 Pagamento PIX')
        .setColor(config.discord.embedColors.primary)
        .setDescription(`**Instruções para pagamento:**\n\nVocê está comprando: **${produto.nome}**`)
        .addFields(
          { name: 'Valor', value: `R$ ${precoFinal.toFixed(2)}${pricing.hasDiscount ? ` (com ${pricing.discountPercentage}% de desconto)` : ''}`, inline: true },
          { name: 'Código da compra', value: payment._id.toString().substring(0, 8), inline: true },
          { name: '⚠ Importante', value: 'Após o pagamento, um administrador irá verificar e aprovar sua compra manualmente. Os dados de acesso serão enviados por mensagem privada.' },
          { name: '📲 Como pagar', value: 'Escaneie o QR Code ou utilize o código PIX abaixo para realizar o pagamento.' },
          { name: '📋 Código PIX (Copia e Cola)', value: '```' + payment.pixCode + '```' }
        )
        .setImage(payment.qrCodeUrl)
        .setFooter({ text: '⚠ Política de Não-Estorno: Ao realizar o pagamento, você concorda que não haverá estorno sob nenhuma circunstância.' })
        .setTimestamp();

      // Se houver promoção, destacar
      if (pricing.hasDiscount) {
        embed.addFields({
          name: '🔥 Promoção Aplicada!',
          value: `${pricing.promotion.title}: ${pricing.promotion.description}\nValor original: R$ ${pricing.originalPrice.toFixed(2)}`
        });
      }

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

      // Enviar mensagem privada
      try {
        await interaction.user.send({
          embeds: [embed],
          components: [row]
        });

        await interaction.editReply({
          content: '✅ Instruções de pagamento enviadas por mensagem privada! Verifique seu DM.',
          ephemeral: true
        });
      } catch (dmError) {
        logger.warn(`Não foi possível enviar DM para ${interaction.user.tag}:`, dmError);

        // Enviar no canal atual se não conseguir DM
        await interaction.editReply({
          content: 'Não foi possível enviar as instruções por mensagem privada. Aqui estão as instruções:',
          embeds: [embed],
          components: [row],
          ephemeral: true
        });
      }
    } catch (error) {
      logger.error('Erro ao processar compra:', error);

      if (interaction.deferred) {
        await interaction.editReply({
          content: 'Ocorreu um erro ao processar sua compra.',
          ephemeral: true
        });
      } else {
        await interaction.reply({
          content: 'Ocorreu um erro ao processar sua compra.',
          ephemeral: true
        });
      }
    }
  }
};
