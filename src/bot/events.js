/**
 * Manipulação de eventos do Discord
 */

const { Events, InteractionType } = require('discord.js');
const config = require('../config');
const userService = require('../user/profile');
const auditLogger = require('../audit/logger');
const { logger } = require('../utils/helpers');
const embeds = require('./embeds');

// Configurar eventos do bot
function setupEvents(client) {
  // Evento: Bot pronto
  client.once(Events.ClientReady, () => {
    logger.info(`Bot está online como ${client.user.tag}`);
  });

  // Evento: Novo membro no servidor
  client.on(Events.GuildMemberAdd, async (member) => {
    try {
      // Criar perfil para o novo usuário
      await userService.createUserProfile({
        userId: member.id,
        username: member.user.tag,
        createdAt: new Date()
      });

      // Enviar mensagem de boas-vindas
      const welcomeMessage = embeds.welcomeEmbed(member.user.username);

      // Encontrar canal de boas-vindas ou enviar por DM
      try {
        await member.send({ embeds: [welcomeMessage] });
      } catch (dmError) {
        logger.warn(`Não foi possível enviar DM para ${member.user.tag}:`, dmError);

        // Tentar enviar no canal geral
        const welcomeChannel = member.guild.channels.cache.find(
          channel => channel.name === 'geral' || channel.name === 'bem-vindo'
        );

        if (welcomeChannel) {
          await welcomeChannel.send({ content: `Bem-vindo, <@${member.id}>!`, embeds: [welcomeMessage] });
        }
      }

      // Registrar no log de auditoria
      await auditLogger.log({
        action: 'USER_JOINED',
        category: 'USER',
        severity: 'INFO',
        status: 'SUCCESS',
        user: {
          id: member.id,
          username: member.user.tag
        }
      });

    } catch (error) {
      logger.error(`Erro ao processar novo membro ${member.user.tag}:`, error);
    }
  });

  // Evento: Mensagem recebida
  client.on(Events.MessageCreate, async (message) => {
    // Ignorar mensagens de bots
    if (message.author.bot) return;

    // Verificar se é um comando
    const prefix = config.discord.prefix;
    if (!message.content.startsWith(prefix)) return;

    // Extrair comando e argumentos
    const args = message.content.slice(prefix.length).trim().split(/ +/);
    const commandName = args.shift().toLowerCase();

    // Registrar uso de comando para análise
    await userService.recordActivity(message.author.id, 'COMMAND_USED', {
        command: commandName,
        args: args.join(' ')
      });

      // Buscar comando de usuário
      const command = client.commands.get(commandName);

      // Buscar comando de administrador
      const adminCommand = client.adminCommands.get(commandName);

      // Executar comando
      try {
        if (command) {
          await command.execute(message, args, client);
        } else if (adminCommand) {
          await adminCommand.execute(message, args, client);
        } else {
          // Comando não encontrado - verificar se é uma pergunta para o assistente
          if (message.channel.type === 1) { // DM Channel
            // Em DM, tentar interpretar como pergunta para o assistente
            const assistantService = require('../ai/assistant');
            const question = message.content.startsWith(prefix)
              ? message.content.slice(prefix.length).trim()
              : message.content;

            // Obter resposta do assistente
            const response = await assistantService.getResponse(question, message.author.id);

            // Enviar resposta
            const assistantEmbed = embeds.assistantEmbed(question, response.answer, response.suggestions);
            await message.reply({ embeds: [assistantEmbed] });
          }
        }
      } catch (error) {
        logger.error(`Erro ao executar comando ${commandName}:`, error);
        await message.reply('Ocorreu um erro ao processar seu comando.');
      }
    });

    // Evento: Interação (botões, selects, etc)
    client.on(Events.InteractionCreate, async (interaction) => {
      try {
        // Interação com botão
        if (interaction.isButton()) {
          await handleButtonInteraction(interaction, client);
        }

        // Interação com select menu
        if (interaction.isSelectMenu()) {
          await handleSelectMenuInteraction(interaction, client);
        }

        // Interação com modal
        if (interaction.type === InteractionType.ModalSubmit) {
          await handleModalSubmitInteraction(interaction, client);
        }
      } catch (error) {
        logger.error(`Erro ao processar interação ${interaction.customId}:`, error);

        // Responder ao usuário, se ainda possível
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp({
            content: 'Ocorreu um erro ao processar sua interação.',
            ephemeral: true
          });
        } else {
          await interaction.reply({
            content: 'Ocorreu um erro ao processar sua interação.',
            ephemeral: true
          });
        }
      }
    });

    // Outros eventos...

    logger.info('Eventos do bot configurados com sucesso');
  }

  // Manipulador de interações com botões
  async function handleButtonInteraction(interaction, client) {
    const customId = interaction.customId;

    // Registrar interação para análise
    await userService.recordActivity(interaction.user.id, 'BUTTON_INTERACTION', {
      buttonId: customId
    });

    // Botão de compra
    if (customId.startsWith('buy_')) {
      const productId = customId.replace('buy_', '');
      // Simular comando de compra
      const buyCommand = client.commands.get('comprar');
      if (buyCommand) {
        await interaction.reply({ content: 'Processando sua compra...', ephemeral: true });
        await buyCommand.execute({
          author: interaction.user,
          reply: async (content) => interaction.followUp(content)
        }, [productId], client);
      }
    }

    // Botão de tutorial PIX
    if (customId === 'pix_tutorial') {
      // Carregar tutorial de pagamento PIX
      const tutorialEmbed = createPixTutorialEmbed();
      await interaction.reply({ embeds: [tutorialEmbed], ephemeral: true });
    }

    // Botão de visualização de detalhes
    if (customId.startsWith('view_details_')) {
      const productId = customId.replace('view_details_', '');
      // Simular comando de detalhe
      const detailsCommand = client.commands.get('produto');
      if (detailsCommand) {
        await interaction.deferReply({ ephemeral: true });
        await detailsCommand.execute({
          author: interaction.user,
          reply: async (content) => interaction.followUp(content)
        }, [productId], client);
      }
    }

    // Botão de feedback do assistente (útil)
    if (customId.startsWith('assistant_helpful_')) {
      const responseId = customId.replace('assistant_helpful_', '');
      const assistantService = require('../ai/assistant');
      await assistantService.recordFeedback(responseId, interaction.user.id, 'positive');
      await interaction.reply({ content: 'Obrigado pelo seu feedback! Isso nos ajuda a melhorar nosso assistente.', ephemeral: true });
    }

    // Botão de feedback do assistente (não útil)
    if (customId.startsWith('assistant_not_helpful_')) {
      const responseId = customId.replace('assistant_not_helpful_', '');
      const assistantService = require('../ai/assistant');
      await assistantService.recordFeedback(responseId, interaction.user.id, 'negative');

      // Oferecer opção de refinar a pergunta
      await interaction.reply({
        content: 'Lamento que a resposta não tenha sido útil. Gostaria de refinar sua pergunta ou falar com um atendente humano?',
        components: [
          {
            type: 1,
            components: [
              {
                type: 2,
                style: 1,
                label: 'Refinar Pergunta',
                custom_id: 'refine_question'
              },
              {
                type: 2,
                style: 2,
                label: 'Falar com Atendente',
                custom_id: 'assistant_talk_human'
              }
            ]
          }
        ],
        ephemeral: true
      });
    }

    // Outros botões...
  }

  // Manipulador de interações com menus de seleção
  async function handleSelectMenuInteraction(interaction, client) {
    const customId = interaction.customId;

    // Registrar interação para análise
    await userService.recordActivity(interaction.user.id, 'SELECT_INTERACTION', {
      selectId: customId,
      selectedValue: interaction.values[0]
    });

    // Seletor de produtos
    if (customId === 'select_product') {
      const productId = interaction.values[0];
      // Simular comando de detalhe
      const detailsCommand = client.commands.get('produto');
      if (detailsCommand) {
        await interaction.deferReply({ ephemeral: true });
        await detailsCommand.execute({
          author: interaction.user,
          reply: async (content) => interaction.followUp(content)
        }, [productId], client);
      }
    }

    // Outros menus...
  }

  // Manipulador de interações com modais
  async function handleModalSubmitInteraction(interaction, client) {
    const customId = interaction.customId;

    // Registrar interação para análise
    await userService.recordActivity(interaction.user.id, 'MODAL_INTERACTION', {
      modalId: customId
    });

    // Modal de feedback
    if (customId === 'feedback_modal') {
      const feedback = interaction.fields.getTextInputValue('feedback_input');
      // Salvar feedback
      await userService.recordFeedback(interaction.user.id, feedback);
      await interaction.reply({ content: 'Obrigado pelo seu feedback! Valorizamos muito a sua opinião.', ephemeral: true });
    }

    // Outros modais...
  }

  // Função auxiliar para criar embed de tutorial PIX
  function createPixTutorialEmbed() {
    // Implementação do tutorial...
  }

  module.exports = {
    setupEvents
  };

