/**
 * Comando administrativo para gerenciar produtos
 */

const { SlashCommandBuilder } = require('@discordjs/builders');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, PermissionFlagsBits } = require('discord.js');
const config = require('../../config');
const productService = require('../../product/catalog');
const lztService = require('../../product/lzt');
const { logger } = require('../../utils/helpers');
const auditLogger = require('../../audit/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('produtos_admin')
    .setDescription('Gerenciar produtos do catálogo (Apenas Admin)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ADMINISTRATOR)
    .addSubcommand(subcommand =>
      subcommand
        .setName('adicionar')
        .setDescription('Adiciona um novo produto ao catálogo')
        .addStringOption(option => option.setName('nome').setDescription('Nome do produto').setRequired(true))
        .addStringOption(option => option.setName('tipo').setDescription('Tipo do produto (valorant, lol, steam, etc)').setRequired(true))
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
        .addStringOption(option => option.setName('campo').setDescription('Campo a ser atualizado')
          .setRequired(true)
          .addChoices(
            { name: 'Nome', value: 'nome' },
            { name: 'Preço', value: 'preco' },
            { name: 'Descrição', value: 'descricao' },
            { name: 'Disponibilidade', value: 'disponivel' }
          ))
        .addStringOption(option => option.setName('valor').setDescription('Novo valor').setRequired(true))
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('detalhes')
        .setDescription('Adiciona detalhes específicos a um produto')
        .addStringOption(option => option.setName('id').setDescription('ID do produto').setRequired(true))
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
        .addStringOption(option => option.setName('filtro').setDescription('Filtrar por tipo')
          .addChoices(
            { name: 'Todos', value: 'todos' },
            { name: 'Disponíveis', value: 'disponiveis' },
            { name: 'Vendidos', value: 'vendidos' },
            { name: 'Valorant', value: 'valorant' },
            { name: 'LoL', value: 'lol' },
            { name: 'Steam', value: 'steam' }
          ))
    ),

  async execute(interaction) {
    // Verificar permissões de administrador
    if (!interaction.memberPermissions.has('ADMINISTRATOR')) {
      return await interaction.reply({
        content: 'Você não tem permissão para executar este comando.',
        ephemeral: true
      });
    }

    // Obter subcomando
    const subcommand = interaction.options.getSubcommand();

    try {
      switch (subcommand) {
        case 'adicionar':
          await handleAddProduct(interaction);
          break;
        case 'remover':
          await handleRemoveProduct(interaction);
          break;
        case 'atualizar':
          await handleUpdateProduct(interaction);
          break;
        case 'detalhes':
          await handleAddDetails(interaction);
          break;
        case 'sincronizar':
          await handleSyncProducts(interaction);
          break;
        case 'listar':
          await handleListProducts(interaction);
          break;
        default:
          await interaction.reply({
            content: 'Subcomando não reconhecido.',
            ephemeral: true
          });
      }
    } catch (error) {
      logger.error(`Erro ao executar comando de administração de produtos (${subcommand}):`, error);

      await interaction.reply({
        content: `❌ Ocorreu um erro ao processar o comando: ${error.message}`,
        ephemeral: true
      });
    }
  }
};

/**
 * Manipula o subcomando de adicionar produto
 * @param {CommandInteraction} interaction - Interação do comando
 */
async function handleAddProduct(interaction) {
  // Obter dados do produto
  const nome = interaction.options.getString('nome');
  const tipo = interaction.options.getString('tipo').toLowerCase();
  const preco = interaction.options.getNumber('preco');
  const descricao = interaction.options.getString('descricao');

  await interaction.deferReply({ ephemeral: true });

  try {
    // Criar produto
    const newProduct = await productService.createProduct({
      nome,
      tipo,
      preco,
      descricao,
      criadoPor: interaction.user.id
    });

    // Registrar no log de auditoria
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

    // Criar embed para mostrar o produto criado
    const embed = new EmbedBuilder()
      .setTitle('✅ Produto Adicionado')
      .setColor(config.discord.embedColors.success)
      .setDescription(`O produto foi adicionado com sucesso ao catálogo.`)
      .addFields(
        { name: 'ID', value: newProduct._id.toString(), inline: true },
        { name: 'Nome', value: newProduct.nome, inline: true },
        { name: 'Tipo', value: newProduct.tipo, inline: true },
        { name: 'Preço', value: `R$ ${newProduct.preco.toFixed(2)}`, inline: true },
        { name: 'Descrição', value: newProduct.descricao }
      )
      .setTimestamp();

    // Criar botões para ações adicionais
    const row = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(`add_details_${newProduct._id}`)
          .setLabel('Adicionar Detalhes')
          .setStyle(ButtonStyle.Primary),

        new ButtonBuilder()
          .setCustomId(`view_product_${newProduct._id}`)
          .setLabel('Visualizar')
          .setStyle(ButtonStyle.Secondary)
      );

    await interaction.editReply({
      embeds: [embed],
      components: [row]
    });
  } catch (error) {
    logger.error('Erro ao adicionar produto:', error);
    await interaction.editReply({
      content: `❌ Erro ao adicionar produto: ${error.message}`
    });
  }
}

/**
 * Manipula o subcomando de remover produto
 * @param {CommandInteraction} interaction - Interação do comando
 */
async function handleRemoveProduct(interaction) {
  const productId = interaction.options.getString('id');

  await interaction.deferReply({ ephemeral: true });

  try {
    // Buscar produto primeiro para confirmar
    const product = await productService.getProductById(productId);

    if (!product) {
      return await interaction.editReply({
        content: '❌ Produto não encontrado.'
      });
    }

    // Criar embed para confirmação
    const embed = new EmbedBuilder()
      .setTitle('⚠️ Confirmar Remoção')
      .setColor(config.discord.embedColors.warning)
      .setDescription(`Você está prestes a remover o seguinte produto:`)
      .addFields(
        { name: 'ID', value: product._id.toString(), inline: true },
        { name: 'Nome', value: product.nome, inline: true },
        { name: 'Preço', value: `R$ ${product.preco.toFixed(2)}`, inline: true },
        { name: 'Status', value: product.disponivel ? 'Disponível' : (product.vendido ? 'Vendido' : 'Indisponível'), inline: true }
      );

    // Botões de confirmação
    const row = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(`confirm_remove_${product._id}`)
          .setLabel('Confirmar Remoção')
          .setStyle(ButtonStyle.Danger),

        new ButtonBuilder()
          .setCustomId('cancel_remove')
          .setLabel('Cancelar')
          .setStyle(ButtonStyle.Secondary)
      );

    await interaction.editReply({
      embeds: [embed],
      components: [row]
    });
  } catch (error) {
    logger.error('Erro ao preparar remoção de produto:', error);
    await interaction.editReply({
      content: `❌ Erro ao buscar produto: ${error.message}`
    });
  }
}

/**
 * Manipula o subcomando de atualizar produto
 * @param {CommandInteraction} interaction - Interação do comando
 */
async function handleUpdateProduct(interaction) {
  const productId = interaction.options.getString('id');
  const campo = interaction.options.getString('campo');
  const valor = interaction.options.getString('valor');

  await interaction.deferReply({ ephemeral: true });

  try {
    // Verificar se o produto existe
    const product = await productService.getProductById(productId);

    if (!product) {
      return await interaction.editReply({
        content: '❌ Produto não encontrado.'
      });
    }

    // Preparar dados para atualização
    const updateData = {};

    // Converter valor para o tipo correto baseado no campo
    switch (campo) {
      case 'preco':
        const precoNum = parseFloat(valor);
        if (isNaN(precoNum) || precoNum < 0) {
          return await interaction.editReply({
            content: '❌ Valor inválido para preço. Deve ser um número positivo.'
          });
        }
        updateData[campo] = precoNum;
        break;
      case 'disponivel':
        updateData[campo] = valor.toLowerCase() === 'true' || valor.toLowerCase() === 'sim';
        break;
      default:
        updateData[campo] = valor;
    }

    // Atualizar produto
    const result = await productService.updateProduct(productId, updateData);

    if (!result.success) {
      return await interaction.editReply({
        content: `❌ Erro ao atualizar produto: ${result.message}`
      });
    }

    // Registrar no log de auditoria
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
        id: productId,
        name: product.nome
      },
      details: {
        field: campo,
        newValue: valor,
        oldValue: product[campo]
      }
    });

    // Criar embed para mostrar atualização
    const embed = new EmbedBuilder()
      .setTitle('✅ Produto Atualizado')
      .setColor(config.discord.embedColors.success)
      .setDescription(`O produto foi atualizado com sucesso.`)
      .addFields(
        { name: 'ID', value: product._id.toString(), inline: true },
        { name: 'Nome', value: product.nome, inline: true },
        { name: 'Campo Atualizado', value: campo, inline: true },
        { name: 'Valor Anterior', value: String(product[campo]), inline: true },
        { name: 'Novo Valor', value: valor, inline: true }
      )
      .setTimestamp();

    // Botão para visualizar produto
    const row = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(`view_product_${product._id}`)
          .setLabel('Visualizar Produto')
          .setStyle(ButtonStyle.Primary)
      );

    await interaction.editReply({
      embeds: [embed],
      components: [row]
    });
  } catch (error) {
    logger.error('Erro ao atualizar produto:', error);
    await interaction.editReply({
      content: `❌ Erro ao atualizar produto: ${error.message}`
    });
  }
}

/**
 * Manipula o subcomando de adicionar detalhes
 * @param {CommandInteraction} interaction - Interação do comando
 */
async function handleAddDetails(interaction) {
  const productId = interaction.options.getString('id');

  await interaction.deferReply({ ephemeral: true });

  try {
    // Verificar se o produto existe
    const product = await productService.getProductById(productId);

    if (!product) {
      return await interaction.editReply({
        content: '❌ Produto não encontrado.'
      });
    }

    // Criar modal para adicionar detalhes
    const modal = new ModalBuilder()
      .setCustomId(`product_details_${productId}`)
      .setTitle(`Detalhes do Produto: ${product.nome}`);

    // Adicionar campos baseados no tipo de produto
    if (product.tipo === 'valorant') {
      // Campos para contas Valorant
      const rankInput = new TextInputBuilder()
        .setCustomId('rank')
        .setLabel('Rank da Conta')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('Ex: Diamante, Ouro, Prata...')
        .setValue(product.detalhes?.rank || '')
        .setRequired(false);

      const skinsInput = new TextInputBuilder()
        .setCustomId('skins')
        .setLabel('Quantidade de Skins')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('Ex: 15')
        .setValue(product.detalhes?.skins?.toString() || '')
        .setRequired(false);

      const levelInput = new TextInputBuilder()
        .setCustomId('level')
        .setLabel('Nível da Conta')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('Ex: 100')
        .setValue(product.detalhes?.level?.toString() || '')
        .setRequired(false);

      const regionInput = new TextInputBuilder()
        .setCustomId('region')
        .setLabel('Região da Conta')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('Ex: BR, NA, EU...')
        .setValue(product.detalhes?.region || '')
        .setRequired(false);

      const agentsInput = new TextInputBuilder()
        .setCustomId('agents')
        .setLabel('Quantidade de Agentes')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('Ex: 10')
        .setValue(product.detalhes?.agents?.toString() || '')
        .setRequired(false);

      // Adicionar componentes ao modal
      modal.addComponents(
        new ActionRowBuilder().addComponents(rankInput),
        new ActionRowBuilder().addComponents(skinsInput),
        new ActionRowBuilder().addComponents(levelInput),
        new ActionRowBuilder().addComponents(regionInput),
        new ActionRowBuilder().addComponents(agentsInput)
      );
    } else {
      // Campos genéricos para outros tipos de produtos
      const field1Input = new TextInputBuilder()
        .setCustomId('field1')
        .setLabel('Campo 1')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('Nome do campo')
        .setRequired(false);

      const value1Input = new TextInputBuilder()
        .setCustomId('value1')
        .setLabel('Valor 1')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('Valor do campo')
        .setRequired(false);

      const field2Input = new TextInputBuilder()
        .setCustomId('field2')
        .setLabel('Campo 2')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('Nome do campo')
        .setRequired(false);

      const value2Input = new TextInputBuilder()
        .setCustomId('value2')
        .setLabel('Valor 2')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('Valor do campo')
        .setRequired(false);

      const field3Input = new TextInputBuilder()
        .setCustomId('field3')
        .setLabel('Campo 3')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('Nome do campo')
        .setRequired(false);

      // Adicionar componentes ao modal
      modal.addComponents(
        new ActionRowBuilder().addComponents(field1Input),
        new ActionRowBuilder().addComponents(value1Input),
        new ActionRowBuilder().addComponents(field2Input),
        new ActionRowBuilder().addComponents(value2Input),
        new ActionRowBuilder().addComponents(field3Input)
      );
    }

    // Mostrar modal
    await interaction.showModal(modal);
  } catch (error) {
    logger.error('Erro ao preparar adição de detalhes:', error);
    await interaction.editReply({
      content: `❌ Erro ao preparar adição de detalhes: ${error.message}`
    });
  }
}

/**
 * Manipula o subcomando de sincronizar produtos
 * @param {CommandInteraction} interaction - Interação do comando
 */
async function handleSyncProducts(interaction) {
  await interaction.deferReply({ ephemeral: true });

  try {
    // Executar sincronização
    const result = await lztService.syncProducts();

    if (!result.success) {
      return await interaction.editReply({
        content: `❌ Erro ao sincronizar produtos: ${result.message}`
      });
    }

    // Criar embed com resultado
    const embed = new EmbedBuilder()
      .setTitle('✅ Sincronização Concluída')
      .setColor(config.discord.embedColors.success)
      .setDescription(`A sincronização com o LZT Market foi concluída com sucesso.`)
      .addFields(
        { name: 'Produtos Adicionados', value: result.added.toString(), inline: true },
        { name: 'Produtos Atualizados', value: result.updated.toString(), inline: true },
        { name: 'Erros', value: result.errors.toString(), inline: true }
      )
      .setTimestamp();

    await interaction.editReply({
      embeds: [embed]
    });
  } catch (error) {
    logger.error('Erro ao sincronizar produtos:', error);
    await interaction.editReply({
      content: `❌ Erro ao sincronizar produtos: ${error.message}`
    });
  }
}

/**
 * Manipula o subcomando de listar produtos
 * @param {CommandInteraction} interaction - Interação do comando
 */
async function handleListProducts(interaction) {
  const filtro = interaction.options.getString('filtro') || 'todos';

  await interaction.deferReply({ ephemeral: true });

  try {
    // Construir filtros
    const filters = {};

    switch (filtro) {
      case 'disponiveis':
        filters.disponivel = true;
        break;
      case 'vendidos':
        filters.vendido = true;
        break;
      case 'valorant':
      case 'lol':
      case 'steam':
        filters.tipo = filtro;
        break;
    }

    // Buscar produtos
    const produtos = await productService.searchProducts(filters);

    if (produtos.length === 0) {
      return await interaction.editReply({
        content: '⚠️ Nenhum produto encontrado com os filtros especificados.'
      });
    }

    // Criar embed com lista de produtos
    const embed = new EmbedBuilder()
      .setTitle(`📋 Lista de Produtos: ${filtro}`)
      .setColor(config.discord.embedColors.primary)
      .setDescription(`Total: ${produtos.length} produtos encontrados.`)
      .setTimestamp();

    // Agrupar produtos por tipo
    const productosPorTipo = {};
    produtos.forEach(produto => {
      if (!productosPorTipo[produto.tipo]) {
        productosPorTipo[produto.tipo] = [];
      }
      productosPorTipo[produto.tipo].push(produto);
    });

    // Adicionar produtos por tipo
    for (const [tipo, listaProdutos] of Object.entries(productosPorTipo)) {
      const listaTexto = listaProdutos.slice(0, 5).map(p =>
        `${p.disponivel ? '✅' : '❌'} ${p.vendido ? '💰' : ''} **${p.nome}** - R$ ${p.preco.toFixed(2)} - ID: \`${p._id.toString().substring(0, 8)}\``
      ).join('\n');

      const totalTipo = listaProdutos.length;
      const textoFinal = totalTipo > 5
        ? `${listaTexto}\n*...e mais ${totalTipo - 5} produtos deste tipo*`
        : listaTexto;

      embed.addFields({ name: `${tipo.toUpperCase()} (${totalTipo})`, value: textoFinal });
    }

    // Botões para filtros
    const row = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('filter_available')
          .setLabel('Disponíveis')
          .setStyle(ButtonStyle.Primary)
          .setDisabled(filtro === 'disponiveis'),

        new ButtonBuilder()
          .setCustomId('filter_sold')
          .setLabel('Vendidos')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(filtro === 'vendidos'),

        new ButtonBuilder()
          .setCustomId('filter_all')
          .setLabel('Todos')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(filtro === 'todos')
      );

    await interaction.editReply({
      embeds: [embed],
      components: [row]
    });
  } catch (error) {
    logger.error('Erro ao listar produtos:', error);
    await interaction.editReply({
      content: `❌ Erro ao listar produtos: ${error.message}`
    });
  }
}
