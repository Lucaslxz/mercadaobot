/**
 * Sistema de recomendação de produtos baseado em IA
 */

const { logger } = require('../utils/helpers');
const userService = require('../user/profile');
const productService = require('../product/catalog');
const db = require('../utils/db');
const cache = require('../utils/cache');

/**
 * Sistema de recomendação que utiliza algoritmos de aprendizado de máquina para
 * recomendar produtos com base no histórico e comportamento do usuário
 */
class RecommendationEngine {
  constructor() {
    this.userProfiles = new Map();
    this.productFeatures = new Map();
    this.similarityMatrix = new Map();
    this.cacheKey = 'recommendation:';
    this.cacheTTL = 1800; // 30 minutos
  }

  /**
   * Obtém recomendações para um usuário específico
   * @param {string} userId - ID do usuário no Discord
   * @param {number} limit - Número máximo de recomendações
   * @returns {Promise} - Lista de produtos recomendados
   */
  async getRecommendationsForUser(userId, limit = 3) {
    try {
      // Verificar cache primeiro
      const cacheKey = `${this.cacheKey}${userId}`;
      const cachedRecommendations = await cache.get(cacheKey);

      if (cachedRecommendations) {
        logger.debug(`Usando recomendações em cache para usuário ${userId}`);
        return cachedRecommendations;
      }

      // Carregar perfil do usuário
      const userProfile = await this._loadUserProfile(userId);

      if (!userProfile || !userProfile.history || userProfile.history.length === 0) {
        // Usuário sem histórico, retornar produtos populares
        logger.debug(`Usuário ${userId} sem histórico, retornando produtos populares`);
        const popularProducts = await this._getPopularProducts(limit);
        await cache.set(cacheKey, popularProducts, this.cacheTTL);
        return popularProducts;
      }

      // Carregar produtos visualizados/comprados
      const viewedProducts = userProfile.history
        .filter(item => item.action === 'PRODUCT_VIEW')
        .map(item => item.productId);

      const purchasedProducts = userProfile.history
        .filter(item => item.action === 'PRODUCT_PURCHASE')
        .map(item => item.productId);

      // Carregar produtos disponíveis
      const availableProducts = await productService.getAvailableProducts();

      // Calcular pontuação para cada produto
      const scoredProducts = [];

      for (const product of availableProducts) {
        // Pular produtos já comprados pelo usuário
        if (purchasedProducts.includes(product._id.toString())) {
          continue;
        }

        const score = this._calculateRecommendationScore(
          product,
          viewedProducts,
          purchasedProducts,
          userProfile.preferences
        );

        scoredProducts.push({ product, score });
      }

      // Ordenar por pontuação e pegar os top N
      const recommendations = scoredProducts
        .sort((a, b) => b.score - a.score)
        .slice(0, limit)
        .map(item => item.product);

      // Salvar no cache
      await cache.set(cacheKey, recommendations, this.cacheTTL);

      return recommendations;
    } catch (error) {
      logger.error('Erro ao gerar recomendações:', error);
      return [];
    }
  }

  /**
   * Obtém recomendações de produtos similares a um produto específico
   * @param {string} productId - ID do produto
   * @param {number} limit - Número máximo de recomendações
   * @returns {Promise} - Lista de produtos similares
   */
  async getSimilarProducts(productId, limit = 3) {
    try {
      // Verificar cache primeiro
      const cacheKey = `${this.cacheKey}similar:${productId}`;
      const cachedSimilar = await cache.get(cacheKey);

      if (cachedSimilar) {
        return cachedSimilar;
      }

      // Carregar produto de referência
      const product = await productService.getProductById(productId);

      if (!product) {
        return [];
      }

      // Carregar todos os produtos disponíveis
      const availableProducts = await productService.getAvailableProducts();

      // Calcular similaridade para cada produto
      const similarProducts = [];

      for (const otherProduct of availableProducts) {
        // Pular o próprio produto
        if (otherProduct._id.toString() === productId) {
          continue;
        }

        const similarity = this._calculateProductSimilarity(product, otherProduct);
        similarProducts.push({ product: otherProduct, similarity });
      }

      // Ordenar por similaridade e pegar os top N
      const recommendations = similarProducts
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, limit)
        .map(item => item.product);

      // Salvar no cache
      await cache.set(cacheKey, recommendations, this.cacheTTL);

      return recommendations;
    } catch (error) {
      logger.error('Erro ao buscar produtos similares:', error);
      return [];
    }
  }

  /**
   * Atualiza o perfil do usuário com base em uma interação
   * @param {string} userId - ID do usuário
   * @param {string} action - Tipo de ação realizada
   * @param {Object} data - Dados da ação
   */
  async updateUserProfile(userId, action, data) {
    try {
      // Registrar ação no histórico do usuário
      await userService.recordActivity(userId, action, data);

      // Invalidar cache de recomendações para este usuário
      await cache.del(`${this.cacheKey}${userId}`);

      logger.debug(`Perfil de recomendações atualizado para usuário ${userId}`);
    } catch (error) {
      logger.error('Erro ao atualizar perfil para recomendações:', error);
    }
  }

  // Métodos privados auxiliares

  /**
   * Carrega o perfil completo do usuário
   * @private
   */
  async _loadUserProfile(userId) {
    const profile = await userService.getUserProfile(userId);
    const history = await userService.getUserHistory(userId);

    return {
      ...profile,
      history: history || []
    };
  }

  /**
   * Obtém produtos populares do sistema
   * @private
   */
  async _getPopularProducts(limit) {
    // Esta é uma implementação simples.
    // Em um sistema real, você usaria análise de dados para determinar os produtos realmente populares
    return await productService.getAvailableProducts(limit);
  }

  /**
   * Calcula a pontuação de recomendação para um produto
   * @private
   */
  _calculateRecommendationScore(product, viewedProducts, purchasedProducts, preferences) {
    let score = 0;

    // Bonificação por tipo preferido
    if (preferences && preferences.categories && preferences.categories.includes(product.tipo)) {
      score += 50;
    }

    // Bonificação por faixa de preço preferida
    if (preferences && preferences.priceRange) {
      const [min, max] = preferences.priceRange;
      if (product.preco >= min && product.preco <= max) {
        score += 30;
      }
    }

    // Bonificação por visualizações prévias de produtos similares
    if (viewedProducts && viewedProducts.length > 0) {
      const similarityBonus = viewedProducts.reduce((bonus, viewedId) => {
        // Aqui seria ideal ter uma matriz de similaridade pré-calculada
        // Simplificação: apenas verificamos se é do mesmo tipo
        if (product.tipo === viewedId.tipo) {
          bonus += 20;
        }
        return bonus;
      }, 0);

      score += similarityBonus;
    }

    // Ajuste por popularidade
    if (product.visualizacoes) {
      score += Math.min(product.visualizacoes / 10, 20); // Max 20 pontos
    }

    // Ajuste por novidade (produtos recentes recebem boost)
    if (product.dataCriacao) {
      const now = new Date();
      const productDate = new Date(product.dataCriacao);
      const daysSinceCreation = (now - productDate) / (1000 * 60 * 60 * 24);

      if (daysSinceCreation < 7) { // Produto com menos de 7 dias
        score += Math.max(0, 20 - (daysSinceCreation * 2)); // Diminui gradualmente
      }
    }

    return score;
  }

  /**
   * Calcula a similaridade entre dois produtos
   * @private
   */
  _calculateProductSimilarity(productA, productB) {
    let similarity = 0;

    // Mesmo tipo: 50 pontos
    if (productA.tipo === productB.tipo) {
      similarity += 50;
    }

    // Faixa de preço similar: até 30 pontos
    const priceDiff = Math.abs(productA.preco - productB.preco);
    const priceSimilarity = Math.max(0, 30 - (priceDiff / 10));
    similarity += priceSimilarity;

    // Detalhes similares
    if (productA.detalhes && productB.detalhes) {
      // Similaridade de rank (para contas Valorant)
      if (productA.detalhes.rank && productB.detalhes.rank &&
          productA.detalhes.rank === productB.detalhes.rank) {
        similarity += 20;
      }

      // Similaridade de número de skins
      if (productA.detalhes.skins && productB.detalhes.skins) {
        const skinDiff = Math.abs(productA.detalhes.skins - productB.detalhes.skins);
        const skinSimilarity = Math.max(0, 20 - (skinDiff * 2));
        similarity += skinSimilarity;
      }
    }

    return similarity;
  }
}

// Instanciar o motor de recomendação
const recommendationEngine = new RecommendationEngine();

// Exportar funções públicas
module.exports = {
  /**
   * Obtém recomendações personalizadas para um usuário
   * @param {string} userId - ID do usuário no Discord
   * @param {number} limit - Número máximo de recomendações (padrão: 3)
   * @returns {Promise} - Array de produtos recomendados
   */
  getRecommendationsForUser: async (userId, limit = 3) => {
    return await recommendationEngine.getRecommendationsForUser(userId, limit);
  },

  /**
   * Obtém produtos similares a um produto específico
   * @param {string} productId - ID do produto
   * @param {number} limit - Número máximo de produtos similares (padrão: 3)
   * @returns {Promise} - Array de produtos similares
   */
  getSimilarProducts: async (productId, limit = 3) => {
    return await recommendationEngine.getSimilarProducts(productId, limit);
  },

  /**
   * Registra uma interação do usuário para melhorar recomendações futuras
   * @param {string} userId - ID do usuário
   * @param {string} action - Tipo de ação (VIEW, PURCHASE, etc)
   * @param {Object} data - Dados adicionais da interação
   */
  recordInteraction: async (userId, action, data) => {
    await recommendationEngine.updateUserProfile(userId, action, data);
  }
};
src/ai/assistant.js
Copy/**
 * Assistente virtual para suporte ao cliente
 */

const { logger } = require('../utils/helpers');
const userService = require('../user/profile');
const cache = require('../utils/cache');
const { v4: uuidv4 } = require('uuid');

/**
 * Assistente virtual que utiliza processamento de linguagem natural para
 * responder perguntas dos usuários e oferecer suporte automatizado
 */
class VirtualAssistant {
  constructor() {
    this.responses = new Map();
    this.cacheKey = 'assistant:';
    this.cacheTTL = 86400; // 24 horas

    // Base de conhecimento inicial com perguntas frequentes
    this.knowledgeBase = [
      {
        questions: ['como comprar', 'como faço para comprar', 'quero comprar'],
        answer: 'Para comprar uma conta, você pode usar o comando !produtos para ver o catálogo completo. Depois, use !comprar <ID> para iniciar o processo de compra. Você receberá instruções de pagamento via PIX e, após a confirmação, a conta será entregue a você.'
      },
      {
        questions: ['forma de pagamento', 'como pagar', 'aceita cartão', 'métodos de pagamento'],
        answer: 'Aceitamos pagamento via PIX. Após escolher seu produto, você receberá um QR Code e um código PIX para realizar o pagamento. O processo é rápido e seguro.'
      },
      {
        questions: ['tem garantia', 'garantia', 'estorno', 'devolução'],
        answer: 'Não oferecemos garantia ou estorno para as contas vendidas. Isso é claramente comunicado durante o processo de compra. Todas as contas são verificadas antes da venda para garantir que estão em boas condições.'
      },
      {
        questions: ['mudar email', 'trocar email', 'alterar email', 'mudar senha'],
        answer: 'Para alterar o email da conta que você comprou, recomendamos fazê-lo imediatamente após receber os dados de acesso. Isso garantirá que você tenha controle total sobre a conta.'
      },
      {
        questions: ['conta banida', 'fui banido', 'ban', 'suspensão'],
        answer: 'Não nos responsabilizamos por contas que sejam banidas após a compra. Sugerimos sempre seguir as regras dos jogos e não utilizar qualquer tipo de programa não autorizado.'
      },
      {
        questions: ['tempo de entrega', 'quanto tempo', 'quando recebo'],
        answer: 'A entrega das contas é feita após a confirmação manual do pagamento por um dos administradores. Normalmente, este processo leva de 5 a 30 minutos durante o horário comercial (9h às 22h).'
      },
      {
        questions: ['skin específica', 'tem skin', 'procuro conta com'],
        answer: 'Para buscar contas com skins específicas, recomendamos usar o comando !produtos e depois filtrar. Você também pode acessar nosso mini-site para visualizar todas as skins disponíveis em cada conta.'
      },
      {
        questions: ['não recebi', 'pagamento não confirmado', 'paguei mas não recebi'],
        answer: 'Se você realizou o pagamento mas ainda não recebeu a conta, por favor, aguarde a aprovação manual por um administrador. Se já passou mais de 1 hora, use o comando !suporte para entrar em contato com nossa equipe.'
      },
      {
        questions: ['visualizar skins', 'ver detalhes', 'mini-site'],
        answer: 'Você pode visualizar todos os detalhes da conta, incluindo skins, agentes e chaveiros, acessando nosso mini-site. O link é fornecido ao usar o comando !produto <ID> e clicar no botão "Ver no Mini-Site".'
      },
      {
        questions: ['falar com atendente', 'falar com pessoa', 'atendimento humano'],
        answer: 'Para falar com um atendente humano, use o comando !suporte seguido de uma breve descrição do seu problema. Um membro da nossa equipe irá atender você o mais rápido possível.'
      }
    ];
  }

  /**
   * Processa uma pergunta e retorna uma resposta
   * @param {string} question - Pergunta do usuário
   * @param {string} userId - ID do usuário
   * @returns {Promise
   */
  async getResponse(question, userId) {
    try {
      // Verificar cache para perguntas frequentes
      const cacheKey = `${this.cacheKey}${this._normalizeQuestion(question)}`;
      const cachedResponse = await cache.get(cacheKey);

      if (cachedResponse) {
        logger.debug(`Usando resposta em cache para "${question}"`);
        return {
          ...cachedResponse,
          id: uuidv4() // Gerar novo ID para tracking
        };
      }

      // Buscar resposta na base de conhecimento
      const bestMatch = this._findBestMatch(question);

      // Gerar ID para a resposta
      const responseId = uuidv4();

      // Gerar sugestões relacionadas
      const suggestions = this._generateRelatedSuggestions(question, bestMatch);

      // Construir resposta
      const response = {
        id: responseId,
        question,
        answer: bestMatch ? bestMatch.answer : "Desculpe, não tenho uma resposta específica para essa pergunta. Por favor, tente reformular ou use o comando !suporte para falar com nossa equipe.",
        suggestions,
        timestamp: new Date()
      };

      // Salvar resposta para feedback futuro
      this.responses.set(responseId, response);

      // Salvar em cache se for uma boa correspondência
      if (bestMatch && bestMatch.confidence > 0.7) {
        await cache.set(cacheKey, {
          answer: response.answer,
          suggestions: response.suggestions
        }, this.cacheTTL);
      }

      // Registrar interação para melhoria contínua
      await this._recordInteraction(userId, question, response);

      return response;
    } catch (error) {
      logger.error('Erro ao processar pergunta do assistente:', error);
      return {
        id: uuidv4(),
        question,
        answer: "Desculpe, ocorreu um erro ao processar sua pergunta. Por favor, tente novamente mais tarde.",
        suggestions: [],
        timestamp: new Date()
      };
    }
  }

  /**
   * Registra feedback do usuário sobre uma resposta
   * @param {string} responseId - ID da resposta
   * @param {string} userId - ID do usuário
   * @param {string} feedbackType - Tipo de feedback ('positive' ou 'negative')
   */
  async recordFeedback(responseId, userId, feedbackType) {
    try {
      // Verificar se a resposta existe
      const response = this.responses.get(responseId);
      if (!response) {
        logger.warn(`Tentativa de feedback para resposta inexistente: ${responseId}`);
        return false;
      }

      // Registrar feedback para análise e melhoria
      await userService.recordActivity(userId, 'ASSISTANT_FEEDBACK', {
        responseId,
        question: response.question,
        feedbackType,
        timestamp: new Date()
      });

      logger.info(`Feedback ${feedbackType} registrado para resposta ${responseId} do usuário ${userId}`);
      return true;
    } catch (error) {
      logger.error('Erro ao registrar feedback do assistente:', error);
      return false;
    }
  }

  /**
   * Adiciona nova pergunta/resposta à base de conhecimento
   * @param {string} question - Pergunta a ser adicionada
   * @param {string} answer - Resposta correspondente
   * @param {Array} variations - Variações da pergunta
   */
  async addToKnowledgeBase(question, answer, variations = []) {
    try {
      // Criar novo item na base de conhecimento
      const newEntry = {
        questions: [question, ...variations],
        answer,
        addedAt: new Date()
      };

      this.knowledgeBase.push(newEntry);

      // Limpar caches relacionados
      await this._invalidateRelatedCaches(question, variations);

      logger.info(`Nova entrada adicionada à base de conhecimento: "${question}"`);
      return true;
    } catch (error) {
      logger.error('Erro ao adicionar à base de conhecimento:', error);
      return false;
    }
  }

  // Métodos privados auxiliares

  /**
   * Normaliza uma pergunta para busca
   * @private
   */
  _normalizeQuestion(question) {
    return question
      .toLowerCase()
      .replace(/[^\w\s]/g, '') // Remove pontuação
      .replace(/\s+/g, ' ')    // Remove espaços extras
      .trim();
  }

  /**
   * Encontra a melhor correspondência na base de conhecimento
   * @private
   */
  _findBestMatch(question) {
    const normalizedQuestion = this._normalizeQuestion(question);
    let bestMatch = null;
    let highestConfidence = 0;

    for (const entry of this.knowledgeBase) {
      for (const knownQuestion of entry.questions) {
        const confidence = this._calculateConfidence(normalizedQuestion, this._normalizeQuestion(knownQuestion));

        if (confidence > highestConfidence && confidence > 0.5) {
          highestConfidence = confidence;
          bestMatch = {
            ...entry,
            confidence
          };
        }
      }
    }

    return bestMatch;
  }

  /**
   * Calcula a confiança da correspondência entre duas perguntas
   * @private
   */
  _calculateConfidence(questionA, questionB) {
    // Implementação simples de similaridade
    // Em produção, usar algo como TF-IDF ou embeddings

    // Se são exatamente iguais
    if (questionA === questionB) return 1.0;

    // Verifica se questionA contém questionB ou vice-versa
    if (questionA.includes(questionB)) return 0.9;
    if (questionB.includes(questionA)) return 0.8;

        // Checa palavras em comum
        const wordsA = questionA.split(' ');
        const wordsB = questionB.split(' ');

        const commonWords = wordsA.filter(word => wordsB.includes(word));

        if (commonWords.length === 0) return 0;

        // Calcular similaridade baseada em palavras comuns
        const similarityA = commonWords.length / wordsA.length;
        const similarityB = commonWords.length / wordsB.length;

        return (similarityA + similarityB) / 2;
      }

      /**
       * Gera sugestões de perguntas relacionadas
       * @private
       */
      _generateRelatedSuggestions(question, bestMatch, limit = 3) {
        if (!bestMatch) return [];

        const suggestions = [];
        const normalizedQuestion = this._normalizeQuestion(question);

        // Encontrar outras entradas relacionadas
        for (const entry of this.knowledgeBase) {
          // Pular a própria entrada
          if (entry === bestMatch) continue;

          // Verificar se há relação com a pergunta original
          let highestConfidence = 0;

          for (const knownQuestion of entry.questions) {
            const confidence = this._calculateConfidence(normalizedQuestion, this._normalizeQuestion(knownQuestion));
            highestConfidence = Math.max(highestConfidence, confidence);
          }

          // Se houver alguma relação, adicionar como sugestão
          if (highestConfidence > 0.3) {
            suggestions.push({
              question: entry.questions[0],
              confidence: highestConfidence
            });
          }
        }

        // Ordenar por confiança e pegar as primeiras 'limit'
        return suggestions
          .sort((a, b) => b.confidence - a.confidence)
          .slice(0, limit)
          .map(s => s.question);
      }

      /**
       * Registra uma interação para análise e melhoria contínua
       * @private
       */
      async _recordInteraction(userId, question, response) {
        try {
          await userService.recordActivity(userId, 'ASSISTANT_QUERY', {
            question,
            responseId: response.id,
            hasSuggestions: response.suggestions.length > 0,
            timestamp: new Date()
          });
        } catch (error) {
          logger.error('Erro ao registrar interação com assistente:', error);
        }
      }

      /**
       * Invalida caches relacionados a uma pergunta
       * @private
       */
      async _invalidateRelatedCaches(question, variations) {
        const keys = [question, ...variations].map(q =>
          `${this.cacheKey}${this._normalizeQuestion(q)}`
        );

        for (const key of keys) {
          await cache.del(key);
        }
      }
    }

    // Criar instância do assistente
    const assistant = new VirtualAssistant();

    // Exportar funções públicas
    module.exports = {
      /**
       * Obtém resposta do assistente virtual para uma pergunta
       * @param {string} question - Pergunta do usuário
       * @param {string} userId - ID do usuário
       * @returns {Promise} - Resposta do assistente
       */
      getResponse: async (question, userId) => {
        return await assistant.getResponse(question, userId);
      },

      /**
       * Registra feedback sobre uma resposta
       * @param {string} responseId - ID da resposta
       * @param {string} userId - ID do usuário
       * @param {string} feedbackType - Tipo de feedback ('positive' ou 'negative')
       * @returns {Promise} - Status da operação
       */
      recordFeedback: async (responseId, userId, feedbackType) => {
        return await assistant.recordFeedback(responseId, userId, feedbackType);
      },

      /**
       * Adiciona novo conhecimento ao assistente
       * @param {string} question - Pergunta principal
       * @param {string} answer - Resposta para a pergunta
       * @param {Array} variations - Variações da pergunta
       * @returns {Promise} - Status da operação
       */
      addKnowledge: async (question, answer, variations = []) => {
        return await assistant.addToKnowledgeBase(question, answer, variations);
      }
    };

