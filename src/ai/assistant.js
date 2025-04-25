/**
 * Assistente virtual para atendimento e suporte
 */
const { v4: uuidv4 } = require('uuid');
const { logger } = require('../utils/helpers');
const userService = require('../user/profile');
const cache = require('../utils/cache');

class VirtualAssistant {
  constructor() {
    this.responses = new Map();
    this.cacheKey = 'assistant:';
    this.cacheTTL = 86400; // 24 horas

    // Base de conhecimento inicial
    this.knowledgeBase = [
      {
        questions: ['como comprar', 'como faço para comprar', 'quero comprar'],
        answer: 'Para comprar uma conta, você pode usar o comando /produtos para ver o catálogo completo. Depois, use /comprar <ID> para iniciar o processo de compra. Você receberá instruções de pagamento via PIX e, após a confirmação, a conta será entregue a você.'
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
      }
    ];
  }

  /**
   * Processa uma pergunta e retorna uma resposta
   * @param {string} question - Pergunta do usuário
   * @param {string} userId - ID do usuário
   * @returns {Promise<Object>} - Resposta processada
   */
  async getResponse(question, userId) {
    try {
      // Verificar cache
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
      const suggestions = bestMatch ? this._generateRelatedSuggestions(question, bestMatch) : [];

      // Construir resposta
      const response = {
        id: responseId,
        question,
        answer: bestMatch ? bestMatch.answer : "Desculpe, não tenho uma resposta específica para essa pergunta. Por favor, tente reformular ou use o comando /suporte para falar com nossa equipe.",
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

      // Registrar interação para análise futura
      await userService.recordActivity(userId, 'ASSISTANT_QUERY', {
        question,
        responseId: response.id,
        timestamp: new Date()
      });

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
   * @returns {Promise<boolean>} - Status da operação
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

  // Métodos privados auxiliares

  /**
   * Normaliza uma pergunta para comparação
   * @param {string} question - Pergunta original
   * @returns {string} - Pergunta normalizada
   * @private
   */
  _normalizeQuestion(question) {
    return question.toLowerCase()
      .replace(/[^\w\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Encontra a melhor correspondência na base de conhecimento
   * @param {string} question - Pergunta normalizada
   * @returns {Object} - Melhor correspondência ou null
   * @private
   */
  _findBestMatch(question) {
    const normalizedQuestion = this._normalizeQuestion(question);
    let bestMatch = null;
    let highestConfidence = 0;

    for (const entry of this.knowledgeBase) {
      for (const knownQuestion of entry.questions) {
        const confidence = this._calculateConfidence(
          normalizedQuestion,
          this._normalizeQuestion(knownQuestion)
        );

        if (confidence > highestConfidence && confidence > 0.5) {
          highestConfidence = confidence;
          bestMatch = { ...entry, confidence };
        }
      }
    }

    return bestMatch;
  }

  /**
   * Calcula a confiança da correspondência entre perguntas
   * @param {string} questionA - Primeira pergunta
   * @param {string} questionB - Segunda pergunta
   * @returns {number} - Pontuação de confiança (0-1)
   * @private
   */
  _calculateConfidence(questionA, questionB) {
    // Se são iguais
    if (questionA === questionB) return 1.0;

    // Verifica se uma contém a outra
    if (questionA.includes(questionB)) return 0.9;
    if (questionB.includes(questionA)) return 0.8;

    // Comparar palavras em comum
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
   * @param {string} question - Pergunta original
   * @param {Object} bestMatch - Melhor correspondência
   * @param {number} limit - Limite de sugestões
   * @returns {Array} - Lista de perguntas sugeridas
   * @private
   */
  _generateRelatedSuggestions(question, bestMatch, limit = 3) {
    const suggestions = [];
    const normalizedQuestion = this._normalizeQuestion(question);

    // Encontrar outras perguntas relacionadas
    for (const entry of this.knowledgeBase) {
      // Pular a própria entrada
      if (entry === bestMatch) continue;

      // Verificar se há relação
      let highestConfidence = 0;

      for (const knownQuestion of entry.questions) {
        const confidence = this._calculateConfidence(
          normalizedQuestion,
          this._normalizeQuestion(knownQuestion)
        );
        highestConfidence = Math.max(highestConfidence, confidence);
      }

      // Se houver relação, adicionar como sugestão
      if (highestConfidence > 0.3) {
        suggestions.push({
          question: entry.questions[0],
          confidence: highestConfidence
        });
      }
    }

    // Ordenar por confiança e pegar as melhores
    return suggestions
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, limit)
      .map(s => s.question);
  }
}

// Instanciar assistente
const assistant = new VirtualAssistant();

// Exportar funções públicas
module.exports = {
  getResponse: (question, userId) => assistant.getResponse(question, userId),
  recordFeedback: (responseId, userId, feedbackType) => assistant.recordFeedback(responseId, userId, feedbackType)
};
