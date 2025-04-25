/**
 * Comandos de usuário do bot
 */

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, SelectMenuBuilder } = require('discord.js');
const config = require('../config');
const productService = require('../product/catalog');
const paymentService = require('../payment/pix');
const userService = require('../user/profile');
const assistantService = require('../ai/assistant');
const recommendationService = require('../ai/recommendation');
const { logger } = require('../utils/helpers');
const auditLogger = require('../audit/logger');

// Comando para listar produtos disponíveis
const listProducts = {
  name: 'produtos',
  description: 'Lista os produtos disponíveis para compra',
  async execute(message, args, client) {
    try {
      // Buscar produtos
      const produtos = await productService.getAvailableProducts();

      if (produtos.length === 0) {
        await message.reply('Não há produtos disponíveis no momento.');
        return;
      }

      // Registrar a consulta de produtos para histórico do usuário
      await userService.recordActivity(message.author.id, 'PRODUCT_LIST_VIEW');

      // Criar embed com a lista de produtos
      const embed = new EmbedBuilder()
        .setTitle('🏪 Produtos Disponíveis')
        .setColor(config.discord.embedColors.primary)
        .setDescription('Escolha um produto para ver mais detalhes:')
        .setTimestamp();

      // Adicionar produtos ao embed
      produtos.slice(0, 10).forEach((produto, index) => {
        embed.addFields({
          name: `${index + 1}. ${produto.nome}`,
          value: `💰 R$ ${produto.preco.toFixed(2)}\n${produto.descricao.substring(0, 100)}${produto.descricao.length > 100 ? '...' : ''}`
        });
      });

      // Adicionar seletor de produtos
      const row = new ActionRowBuilder()
        .addComponents(
          new SelectMenuBuilder()
            .setCustomId('select_product')
            .setPlaceholder('Selecione um produto para ver detalhes')
            .addOptions(
              produtos.slice(0, 25).map((produto, index) => ({
                label: `${produto.nome} - R$ ${produto.preco.toFixed(2)}`,
                description: produto.descricao.substring(0, 50) + (produto.descricao.length > 50 ? '...' : ''),
                value: produto._id.toString()
              }))
            )
        );

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
            .setCustomId('order_price')
            .setLabel('Ordenar por Preço')
            .setStyle(ButtonStyle.Success)
        );await message.reply({ embeds: [embed], components: [row, filterRow] });

        // Registrar ação no log de auditoria
        await auditLogger.log({
          action: 'PRODUCT_LIST_VIEWED',
          category: 'PRODUCT',
          severity: 'INFO',
          status: 'SUCCESS',
          user: {
            id: message.author.id,
            username: message.author.tag
          },
          details: {
            productCount: produtos.length,
            filters: args
          }
        });

      } catch (error) {
        logger.error('Erro ao listar produtos:', error);
        await message.reply('Ocorreu um erro ao buscar a lista de produtos.');
      }
    }
  };

  // Comando para exibir detalhes de um produto
  const productDetails = {
    name: 'produto',
    description: 'Mostra os detalhes de um produto específico',
    async execute(message, args, client) {
      try {
        // Verificar se o ID do produto foi fornecido
        if (args.length < 1) {
          await message.reply('Uso correto: !produto <id_produto>');
          return;
        }

        const productId = args[0];

        // Buscar produto
        const produto = await productService.getProductById(productId);

        if (!produto) {
          await message.reply('Produto não encontrado.');
          return;
        }

        // Registrar visualização de produto
        await userService.recordActivity(message.author.id, 'PRODUCT_VIEW', { productId });

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
          Object.entries(produto.detalhes).forEach(([chave, valor]) => {
            embed.addFields({ name: chave, value: valor.toString(), inline: true });
          });
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
              .setCustomId(`minisite_${produto._id}`)
              .setLabel('Ver no Mini-Site')
              .setStyle(ButtonStyle.Link)
              .setURL(`https://seu-dominio.com/produto/${produto._id}`),

            new ButtonBuilder()
              .setCustomId(`recommend_similar_${produto._id}`)
              .setLabel('Produtos Similares')
              .setStyle(ButtonStyle.Secondary)
          );

        await message.reply({ embeds: [embed], components: [row] });

        // Registrar ação no log de auditoria
        await auditLogger.log({
          action: 'PRODUCT_VIEWED',
          category: 'PRODUCT',
          severity: 'INFO',
          status: 'SUCCESS',
          user: {
            id: message.author.id,
            username: message.author.tag
          },
          product: {
            id: produto._id,
            name: produto.nome,
            price: produto.preco
          }
        });

      } catch (error) {
        logger.error('Erro ao mostrar detalhes do produto:', error);
        await message.reply('Ocorreu um erro ao buscar os detalhes do produto.');
      }
    }
  };

  // Comando para iniciar uma compra
  const buyProduct = {
    name: 'comprar',
    description: 'Inicia o processo de compra de um produto',
    async execute(message, args, client) {
      try {
        // Verificar se o ID do produto foi fornecido
        if (args.length < 1) {
          await message.reply('Uso correto: !comprar <id_produto>');
          return;
        }

        const productId = args[0];

        // Buscar produto
        const produto = await productService.getProductById(productId);

        if (!produto) {
          await message.reply('Produto não encontrado.');
          return;
        }

        if (!produto.disponivel) {
          await message.reply('Este produto não está disponível para compra no momento.');
          return;
        }

        // Iniciar processo de pagamento
        const userId = message.author.id;
        const userName = message.author.tag;

        // Verificar se o usuário está banido
        const fraudDetectionService = require('../ai/fraud');
        const riskAssessment = await fraudDetectionService.assessUserRisk(userId);

        if (riskAssessment.risk === 'high') {
          // Registrar tentativa suspeita
          await auditLogger.log({
            action: 'SUSPICIOUS_PURCHASE_ATTEMPT',
            category: 'SECURITY',
            severity: 'WARNING',
            status: 'BLOCKED',
            user: {
              id: userId,
              username: userName
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

          // Notificar administradores sobre tentativa suspeita
          // Código para notificação aqui...

          await message.reply('Não foi possível processar sua compra. Entre em contato com o suporte.');
          return;
        }

        // Gerar código PIX
        const payment = await paymentService.createPayment({
          userId,
          userName,
          productId: produto._id,
          productName: produto.nome,
          amount: produto.preco
        });

        // Salvar no histórico do usuário
        await userService.recordActivity(userId, 'PAYMENT_INITIATED', {
          productId: produto._id,
          paymentId: payment._id,
          amount: produto.preco
        });

        // Criar embed com instruções de pagamento
        const embed = new EmbedBuilder()
          .setTitle('💰 Pagamento PIX')
          .setColor(config.discord.embedColors.primary)
          .setDescription(`**Instruções para pagamento:**\n\nVocê está comprando: **${produto.nome}**`)
          .addFields(
            { name: 'Valor', value: `R$ ${produto.preco.toFixed(2)}`, inline: true },
            { name: 'Código da compra', value: payment._id.toString().substring(0, 8), inline: true },
            { name: '⚠ Importante', value: 'Após o pagamento, um administrador irá verificar e aprovar sua compra manualmente. Os dados de acesso serão enviados por mensagem privada.' },
            { name: '📲 Como pagar', value: 'Escaneie o QR Code ao lado ou utilize o código PIX abaixo para realizar o pagamento.' },
            { name: '📋 Código PIX (Copia e Cola)', value: '```' + payment.pixCode + '```' }
          )
          .setImage(payment.qrCodeUrl) // URL da imagem do QR Code gerado
          .setFooter({ text: '⚠ Política de Não-Estorno: Ao realizar o pagamento, você concorda que não haverá estorno sob nenhuma circunstância.' })
          .setTimestamp();

        // Botões de instruções detalhadas
        const row = new ActionRowBuilder()
          .addComponents(
            new ButtonBuilder()
              .setCustomId(`pix_tutorial`)
              .setLabel('Ver Tutorial de Pagamento')
              .setStyle(ButtonStyle.Primary),

            new ButtonBuilder()
              .setCustomId(`cancel_payment_${payment._id}`)
              .setLabel('Cancelar Pagamento')
              .setStyle(ButtonStyle.Danger)
          );

        // Enviar como mensagem privada para o usuário
        await message.author.send({ embeds: [embed], components: [row] });
        await message.reply('Instruções de pagamento enviadas por mensagem privada!');

        // Registrar ação no log de auditoria
        await auditLogger.log({
          action: 'PAYMENT_INITIATED',
          category: 'TRANSACTION',
          severity: 'INFO',
          status: 'SUCCESS',
          user: {
            id: userId,
            username: userName
          },
          product: {
            id: produto._id,
            name: produto.nome,
            price: produto.preco
          },
          payment: {
            id: payment._id,
            method: 'PIX'
          }
        });

      } catch (error) {
        logger.error('Erro ao processar compra:', error);
        await message.reply('Ocorreu um erro ao processar sua compra.');
      }
    }
  };

  // Comando para obter recomendações de produtos
  const getRecommendations = {
    name: 'recomendacoes',
    description: 'Mostra produtos recomendados com base no seu perfil',
    async execute(message, args, client) {
      try {
        const userId = message.author.id;

        // Obter recomendações personalizadas
        const recomendacoes = await recommendationService.getRecommendationsForUser(userId);

        if (recomendacoes.length === 0) {
          await message.reply('Não foi possível gerar recomendações. Continue explorando nossos produtos para recebermos mais informações sobre suas preferências.');
          return;
        }

        // Criar embed com as recomendações
        const embed = new EmbedBuilder()
          .setTitle('🤖 Recomendações Personalizadas')
          .setColor(config.discord.embedColors.primary)
          .setDescription('Com base nas suas preferências, encontramos estes produtos que podem te interessar:')
          .setTimestamp();

        // Adicionar produtos recomendados ao embed
        recomendacoes.forEach((produto, index) => {
          embed.addFields({
            name: `${index + 1}. ${produto.nome}`,
            value: `💰 R$ ${produto.preco.toFixed(2)}\n${produto.descricao.substring(0, 100)}${produto.descricao.length > 100 ? '...' : ''}`
          });
        });

        // Adicionar botões para cada recomendação
        const row = new ActionRowBuilder()
          .addComponents(
            new ButtonBuilder()
              .setCustomId(`view_${recomendacoes[0]._id}`)
              .setLabel('Ver Produto 1')
              .setStyle(ButtonStyle.Primary),

            new ButtonBuilder()
              .setCustomId(`view_${recomendacoes[1]._id}`)
              .setLabel('Ver Produto 2')
              .setStyle(ButtonStyle.Primary),

            new ButtonBuilder()
              .setCustomId(`view_${recomendacoes[2]._id}`)
              .setLabel('Ver Produto 3')
              .setStyle(ButtonStyle.Primary)
          );

        await message.reply({ embeds: [embed], components: [row] });

        // Registrar ação no log de auditoria
        await auditLogger.log({
          action: 'RECOMMENDATIONS_VIEWED',
          category: 'AI',
          severity: 'INFO',
          status: 'SUCCESS',
          user: {
            id: userId,
            username: message.author.tag
          },
          details: {
            recommendationCount: recomendacoes.length,
            topRecommendation: recomendacoes[0]._id
          }
        });

      } catch (error) {
        logger.error('Erro ao gerar recomendações:', error);
        await message.reply('Ocorreu um erro ao gerar recomendações de produtos.');
      }
    }
  };

  // Comando para obter ajuda do assistente virtual
  const help = {
    name: 'ajuda',
    description: 'Obtém ajuda do assistente virtual',
    async execute(message, args, client) {
      try {
        const question = args.join(' ');

        if (!question) {
          // Exibir menu de ajuda geral
          const embed = new EmbedBuilder()
            .setTitle('❓ Central de Ajuda')
            .setColor(config.discord.embedColors.primary)
            .setDescription('Olá! Como posso ajudar você hoje?')
            .addFields(
              { name: '📦 Produtos', value: 'Use `!produtos` para ver o catálogo completo' },
              { name: '🛒 Compras', value: 'Use `!comprar [id]` para comprar um produto' },
              { name: '🔍 Detalhes', value: 'Use `!produto [id]` para ver detalhes de um produto' },
              { name: '🤖 Recomendações', value: 'Use `!recomendacoes` para ver produtos recomendados' },
              { name: '❓ Dúvidas específicas', value: 'Use `!ajuda [sua pergunta]` para perguntar ao assistente virtual' }
            )
            .setFooter({ text: 'Digite !ajuda seguido da sua dúvida para perguntar ao assistente virtual.' });

          await message.reply({ embeds: [embed] });
          return;
        }

        // Registrar a pergunta para análise e treinamento futuro
        await userService.recordActivity(message.author.id, 'ASSISTANT_QUERY', { query: question });

        // Obter resposta do assistente virtual
        const response = await assistantService.getResponse(question, message.author.id);

        // Criar embed com a resposta
        const embed = new EmbedBuilder()
          .setTitle('🤖 Assistente Virtual')
          .setColor(config.discord.embedColors.primary)
          .setDescription(`**Sua pergunta:** ${question}\n\n**Resposta:** ${response.answer}`)
          .setTimestamp();

        // Adicionar sugestões relacionadas se houver
        if (response.suggestions && response.suggestions.length > 0) {
          embed.addFields({ name: 'Perguntas relacionadas', value: response.suggestions.join('\n') });
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
              .setCustomId(`assistant_talk_human`)
              .setLabel('👨‍💼 Falar com atendente')
              .setStyle(ButtonStyle.Secondary)
          );

        await message.reply({ embeds: [embed], components: [row] });
      } catch (error) {
        logger.error('Erro ao processar pergunta para o assistente:', error);
        await message.reply('Ocorreu um erro ao processar sua pergunta. Por favor, tente novamente mais tarde.');
      }
    }
  };

  // Comando para verificar o perfil do usuário
  const profile = {
    name: 'perfil',
    description: 'Mostra o perfil do usuário e histórico de compras',
    async execute(message, args, client) {
      try {
        const userId = message.author.id;

        // Obter perfil do usuário
        const userProfile = await userService.getUserProfile(userId);

        // Obter histórico de compras
        const purchaseHistory = await userService.getPurchaseHistory(userId);

        // Obter pontos de fidelidade
        const loyaltyService = require('../marketing/loyalty');
        const loyaltyPoints = await loyaltyService.getUserPoints(userId);

        // Criar embed com o perfil
        const embed = new EmbedBuilder()
          .setTitle(`👤 Perfil de ${message.author.username}`)
          .setColor(config.discord.embedColors.primary)
          .setThumbnail(message.author.displayAvatarURL())
          .addFields(
            { name: 'Membro desde', value: `${new Date(userProfile.createdAt).toLocaleDateString()}`, inline: true },
            { name: 'Total de compras', value: purchaseHistory.length.toString(), inline: true },
            { name: 'Pontos de fidelidade', value: `${loyaltyPoints.amount} pontos`, inline: true }
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

        // Adicionar preferências do usuário
        if (userProfile.preferences) {
          const prefsText = [];
          if (userProfile.preferences.theme) prefsText.push(`🎨 Tema: ${userProfile.preferences.theme}`);
          if (userProfile.preferences.categories && userProfile.preferences.categories.length > 0) {
            prefsText.push(`🏷 Categorias favoritas: ${userProfile.preferences.categories.join(', ')}`);
          }

          if (prefsText.length > 0) {
            embed.addFields({ name: '⚙ Suas Preferências', value: prefsText.join('\n') });
          }
        }

        // Botões de ação
        const row = new ActionRowBuilder()
          .addComponents(
            new ButtonBuilder()
              .setCustomId(`view_all_purchases`)
              .setLabel('Ver Todas as Compras')
              .setStyle(ButtonStyle.Primary),

            new ButtonBuilder()
              .setCustomId(`edit_preferences`)
              .setLabel('Editar Preferências')
              .setStyle(ButtonStyle.Secondary),

            new ButtonBuilder()
              .setCustomId(`redeem_points`)
              .setLabel('Resgatar Pontos')
              .setStyle(ButtonStyle.Success)
          );

        await message.reply({ embeds: [embed], components: [row] });

      } catch (error) {
        logger.error('Erro ao mostrar perfil:', error);
        await message.reply('Ocorreu um erro ao carregar seu perfil.');
      }
    }
  };

  module.exports = {
    listProducts,
    productDetails,
    buyProduct,
    getRecommendations,
    help,
    profile
  };
