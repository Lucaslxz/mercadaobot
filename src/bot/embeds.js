/**
 * Templates de embeds para mensagens do Discord
 */

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const config = require('../config');

// Embed para mensagem de boas-vindas
function welcomeEmbed(username) {
  return new EmbedBuilder()
    .setTitle('🏪 Bem-vindo ao Mercadão das Contas!')
    .setColor(config.discord.embedColors.primary)
    .setDescription(`Olá ${username}! Seja bem-vindo à maior loja de contas Valorant do Discord.`)
    .addFields(
      { name: '🛍 Nossos Produtos', value: 'Temos as melhores contas Valorant com skins raras e ranks altos.' },
      { name: '💰 Como Comprar', value: 'Digite `!produtos` para ver nosso catálogo e `!comprar <id>` para adquirir um produto.' },
      { name: '❓ Precisa de Ajuda?', value: 'Digite `!ajuda` para falar com nosso assistente virtual.' }
    )
    .setImage('https://i.imgur.com/XJuZbRg.png') // URL de imagem ilustrativa
    .setTimestamp();
}

// Embed para detalhes de produto
function productEmbed(product) {
  const embed = new EmbedBuilder()
    .setTitle(`🛍 ${product.nome}`)
    .setColor(config.discord.embedColors.primary)
    .setDescription(product.descricao)
    .addFields(
      { name: 'Preço', value: `💰 R$ ${product.preco.toFixed(2)}`, inline: true },
      { name: 'Tipo', value: product.tipo, inline: true },
      { name: 'Disponibilidade', value: product.disponivel ? '✅ Disponível' : '❌ Indisponível', inline: true }
    );

  // Adicionar características específicas do produto
  if (product.detalhes) {
    Object.entries(product.detalhes).forEach(([chave, valor]) => {
      embed.addFields({ name: chave, value: valor.toString(), inline: true });
    });
  }

  return embed;
}

// Embed para instruções de pagamento PIX
function pixPaymentEmbed(payment, product) {
  return new EmbedBuilder()
    .setTitle('💰 Pagamento PIX')
    .setColor(config.discord.embedColors.primary)
    .setDescription(`**Instruções para pagamento:**\n\nVocê está comprando: **${product.nome}**`)
    .addFields(
      { name: 'Valor', value: `R$ ${product.preco.toFixed(2)}`, inline: true },
      { name: 'Código da compra', value: payment._id.toString().substring(0, 8), inline: true },
      { name: '⚠ Importante', value: 'Após o pagamento, um administrador irá verificar e aprovar sua compra manualmente. Os dados de acesso serão enviados por mensagem privada.' },
      { name: '📲 Como pagar', value: 'Escaneie o QR Code ao lado ou utilize o código PIX abaixo para realizar o pagamento.' },
      { name: '📋 Código PIX (Copia e Cola)', value: '```' + payment.pixCode + '```' }
    )
    .setImage(payment.qrCodeUrl) // URL da imagem do QR Code gerado
    .setFooter({ text: '⚠ Política de Não-Estorno: Ao realizar o pagamento, você concorda que não haverá estorno sob nenhuma circunstância.' })
    .setTimestamp();
}

// Embed para confirmação de compra aprovada
function purchaseConfirmationEmbed(payment, product, accountDetails) {
  return new EmbedBuilder()
    .setTitle('✅ Compra Aprovada!')
    .setColor(config.discord.embedColors.success)
    .setDescription(`Sua compra foi aprovada e processada com sucesso!`)
    .addFields(
      { name: 'Produto', value: product.nome, inline: true },
      { name: 'Valor pago', value: `R$ ${payment.amount.toFixed(2)}`, inline: true },
      { name: 'Data', value: `${new Date().toLocaleDateString()}`, inline: true },
      { name: '📋 Dados de Acesso', value: '```' +
        `Login: ${accountDetails.login}\nSenha: ${accountDetails.password}` +
        '```' },
      { name: '⚠ Importante', value: 'Recomendamos que você altere a senha imediatamente após o primeiro acesso.' },
      { name: '🔗 Mini-Site', value: `[Clique aqui](https://seu-dominio.com/produto/${product._id}) para visualizar todos os detalhes da conta.` }
    )
    .setTimestamp();
}

// Embed para promoção
function promotionEmbed(promotion) {
  const dataFim = new Date(promotion.dataFim);

  return new EmbedBuilder()
    .setTitle(`🔥 ${promotion.titulo || 'PROMOÇÃO ESPECIAL'}`)
    .setColor('#FF5733')
    .setDescription(`**${promotion.descricao}**\n\nAproveite! Termina ${dataFim.toLocaleString()}`)
    .addFields(
      { name: 'Desconto', value: `${promotion.desconto}%`, inline: true },
      { name: 'Duração', value: `${promotion.duracao} horas`, inline: true }
    )
    .setImage(promotion.imageUrl || 'https://i.imgur.com/XJuZbRg.png')
    .setTimestamp();
}

// Embed para alerta de segurança
function securityAlertEmbed(alert) {
  return new EmbedBuilder()
    .setTitle('🚨 Alerta de Segurança')
    .setColor(config.discord.embedColors.error)
    .setDescription(`**${alert.title}**`)
    .addFields(
      { name: 'Usuário', value: alert.user || 'N/A', inline: true },
      { name: 'IP', value: alert.ip || 'N/A', inline: true },
      { name: 'Horário', value: `${new Date(alert.timestamp).toLocaleString()}`, inline: true },
      { name: 'Tipo', value: alert.type, inline: true },
      { name: 'Detalhes', value: alert.details || 'Sem detalhes adicionais.' }
    )
    .setTimestamp();
}

// Embed para assistente virtual
function assistantEmbed(question, answer, suggestions = []) {
  const embed = new EmbedBuilder()
    .setTitle('🤖 Assistente Virtual')
    .setColor(config.discord.embedColors.primary)
    .setDescription(`**Sua pergunta:** ${question}\n\n**Resposta:** ${answer}`)
    .setTimestamp();

  // Adicionar sugestões relacionadas se houver
  if (suggestions && suggestions.length > 0) {
    embed.addFields({ name: 'Perguntas relacionadas', value: suggestions.join('\n') });
  }

  return embed;
}

// Botões padrão para compra
function createBuyButtons(productId) {
  return new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId(`buy_${productId}`)
        .setLabel('Comprar Agora')
        .setStyle(ButtonStyle.Success),

      new ButtonBuilder()
        .setCustomId(`view_details_${productId}`)
        .setLabel('Ver Detalhes')
        .setStyle(ButtonStyle.Primary),

      new ButtonBuilder()
        .setCustomId(`minisite_${productId}`)
        .setLabel('Ver no Mini-Site')
        .setStyle(ButtonStyle.Link)
        .setURL(`https://seu-dominio.com/produto/${productId}`)
    );
}

// Exportar todos os templates
module.exports = {
  welcomeEmbed,
  productEmbed,
  pixPaymentEmbed,
  purchaseConfirmationEmbed,
  promotionEmbed,
  securityAlertEmbed,
  assistantEmbed,
  createBuyButtons
};
