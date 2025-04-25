/**
 * Funções auxiliares utilizadas em todo o sistema
 */

const winston = require('winston');
const { format } = winston;
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');

// Configuração do logger
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: format.combine(
    format.timestamp({
      format: 'YYYY-MM-DD HH:mm:ss'
    }),
    format.errors({ stack: true }),
    format.splat(),
    format.json()
  ),
  defaultMeta: { service: 'discord-bot' },
  transports: [
    // Escrever logs de erro em arquivo
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    // Escrever todos os logs em arquivo
    new winston.transports.File({ filename: 'combined.log' }),
  ]
});

// Se não estiver em produção, também log para console
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: format.combine(
      format.colorize(),
      format.simple()
    )
  }));
}

/**
 * Gera um ID único para uso no sistema
 * @returns {string} - ID único
 */
function generateId() {
  return uuidv4();
}

/**
 * Formata um valor monetário para o formato brasileiro
 * @param {number} value - Valor a ser formatado
 * @returns {string} - Valor formatado (ex: R$ 10,50)
 */
function formatCurrency(value) {
  return `R$ ${value.toFixed(2).replace('.', ',')}`;
}

/**
 * Formata uma data para o formato brasileiro
 * @param {Date} date - Data a ser formatada
 * @returns {string} - Data formatada (ex: 01/01/2023 10:30)
 */
function formatDate(date) {
  if (!date) return '';

  const d = new Date(date);

  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');

  return `${day}/${month}/${year} ${hours}:${minutes}`;
}

/**
 * Formata um intervalo de tempo de forma amigável
 * @param {Date} date - Data para calcular o intervalo até agora
 * @returns {string} - Texto descritivo (ex: há 5 minutos, há 2 horas)
 */
function timeAgo(date) {
  if (!date) return '';

  const seconds = Math.floor((new Date() - new Date(date)) / 1000);

  let interval = Math.floor(seconds / 31536000);
  if (interval > 1) return `há ${interval} anos`;
  if (interval === 1) return `há 1 ano`;

  interval = Math.floor(seconds / 2592000);
  if (interval > 1) return `há ${interval} meses`;
  if (interval === 1) return `há 1 mês`;

  interval = Math.floor(seconds / 86400);
  if (interval > 1) return `há ${interval} dias`;
  if (interval === 1) return `há 1 dia`;

  interval = Math.floor(seconds / 3600);
  if (interval > 1) return `há ${interval} horas`;
  if (interval === 1) return `há 1 hora`;

  interval = Math.floor(seconds / 60);
  if (interval > 1) return `há ${interval} minutos`;
  if (interval === 1) return `há 1 minuto`;

  if (seconds < 10) return `agora mesmo`;
  return `há ${Math.floor(seconds)} segundos`;
}

/**
 * Valida se um endereço de email é válido
 * @param {string} email - Email a ser validado
 * @returns {boolean} - Verdadeiro se válido
 */
function isValidEmail(email) {
  const re = /^(([^<>()[\]\.,;:\s@"]+(\.[^<>()[\]\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
  return re.test(String(email).toLowerCase());
}

/**
 * Trunca um texto para um tamanho específico
 * @param {string} text - Texto a ser truncado
 * @param {number} length - Tamanho máximo
 * @returns {string} - Texto truncado com reticências se necessário
 */
function truncateText(text, length = 100) {
  if (!text) return '';
  if (text.length <= length) return text;
  return text.substring(0, length) + '...';
}

/**
 * Gera um hash MD5 para um texto
 * @param {string} text - Texto para gerar hash
 * @returns {string} - Hash MD5
 */
function md5(text) {
  return crypto.createHash('md5').update(text).digest('hex');
}

/**
 * Remove acentos de um texto
 * @param {string} text - Texto com acentos
 * @returns {string} - Texto sem acentos
 */
function removeAccents(text) {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/**
 * Valida se uma string é um UUID válido
 * @param {string} id - ID para validação
 * @returns {boolean} - Verdadeiro se UUID válido
 */
function isValidUUID(id) {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(id);
}

/**
 * Gera uma senha aleatória
 * @param {number} length - Tamanho da senha
 * @param {boolean} includeSpecial - Incluir caracteres especiais
 * @returns {string} - Senha gerada
 */
function generatePassword(length = 12, includeSpecial = true) {
  const lowercase = 'abcdefghijklmnopqrstuvwxyz';
  const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const numbers = '0123456789';
  const special = '!@#$%^&*()_+~`|}{[]:;?><,./-=';

  let chars = lowercase + uppercase + numbers;
  if (includeSpecial) chars += special;

  let password = '';
  for (let i = 0; i < length; i++) {
    const randomNumber = crypto.randomInt(0, chars.length);
    password += chars.substring(randomNumber, randomNumber + 1);
  }

  return password;
}

module.exports = {
  logger,
  generateId,
  formatCurrency,
  formatDate,
  timeAgo,
  isValidEmail,
  truncateText,
  md5,
  removeAccents,
  isValidUUID,
  generatePassword
};
