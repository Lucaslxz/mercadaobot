// src/models/user.js
const mongoose = require('mongoose');
const Schema = mongoose.Schema;

// Schema para preferências do usuário
const PreferenceSchema = new Schema({
  theme: { type: String, enum: ['light', 'dark'], default: 'light' },
  categories: [{ type: String }],
  priceRange: [{ type: Number }], // [min, max]
  notifications: { type: Boolean, default: true }
});

// Schema para histórico de atividades
const ActivitySchema = new Schema({
  action: {
    type: String,
    required: true,
    enum: [
      'PRODUCT_VIEW', 'PRODUCT_PURCHASE', 'PAYMENT_INITIATED',
      'PAYMENT_COMPLETED', 'PAYMENT_REJECTED', 'COMMAND_USED',
      'REPORTED_BY_ADMIN', 'ASSISTANT_QUERY', 'ASSISTANT_FEEDBACK',
      'BUTTON_INTERACTION', 'SELECT_INTERACTION', 'MODAL_INTERACTION'
    ]
  },
  timestamp: { type: Date, default: Date.now },
  data: { type: Schema.Types.Mixed }
});

// Schema principal do usuário
const UserSchema = new Schema({
  userId: { type: String, required: true, unique: true },
  username: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
  email: { type: String },
  preferences: { type: PreferenceSchema, default: () => ({}) },
  isBlocked: { type: Boolean, default: false },
  blockReason: { type: String },
  blockedBy: { type: String },
  blockDate: { type: Date },
  activities: [ActivitySchema],
  lastActive: { type: Date, default: Date.now }
});

// Índices para melhor performance
UserSchema.index({ userId: 1 }, { unique: true });
UserSchema.index({ 'activities.timestamp': -1 });
UserSchema.index({ lastActive: -1 });
UserSchema.index({ isBlocked: 1 });

module.exports = mongoose.model('User', UserSchema);

// src/models/product.js
const mongoose = require('mongoose');
const Schema = mongoose.Schema;

// Schema para detalhes específicos do produto
const ProductDetailsSchema = new Schema({
  rank: { type: String },
  skins: { type: Number },
  level: { type: Number },
  agents: { type: Number },
  region: { type: String },
  email_changed: { type: Boolean, default: false },
  vp: { type: Number },
  valorantPoints: { type: Number },
  verification: { type: Boolean, default: true }
}, { _id: false, strict: false }); // strict: false permite campos adicionais

// Schema principal do produto
const ProductSchema = new Schema({
  nome: { type: String, required: true },
  tipo: { type: String, required: true },
  preco: { type: Number, required: true },
  descricao: { type: String, required: true },
  detalhes: { type: ProductDetailsSchema, default: () => ({}) },
  disponivel: { type: Boolean, default: true },
  dataCriacao: { type: Date, default: Date.now },
  ultimaAtualizacao: { type: Date, default: Date.now },
  visualizacoes: { type: Number, default: 0 },
  vendido: { type: Boolean, default: false },
  dataVenda: { type: Date },
  compradoPor: { type: String },
  criadoPor: { type: String },
  origem: { type: String, enum: ['MANUAL', 'LZT', 'API'], default: 'MANUAL' },
  origemId: { type: String }, // ID na plataforma original (LZT, etc)
  imagens: [{ type: String }], // URLs das imagens
});

// Índices para melhor performance
ProductSchema.index({ tipo: 1 });
ProductSchema.index({ preco: 1 });
ProductSchema.index({ disponivel: 1 });
ProductSchema.index({ dataCriacao: -1 });
ProductSchema.index({ visualizacoes: -1 });
ProductSchema.index({ vendido: 1 });

module.exports = mongoose.model('Product', ProductSchema);

// src/models/payment.js
const mongoose = require('mongoose');
const Schema = mongoose.Schema;

// Schema principal de pagamento
const PaymentSchema = new Schema({
  userId: { type: String, required: true },
  userName: { type: String, required: true },
  productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
  productName: { type: String, required: true },
  amount: { type: Number, required: true },
  method: { type: String, enum: ['PIX', 'MANUAL'], default: 'PIX' },
  status: {
    type: String,
    enum: ['PENDING', 'COMPLETED', 'REJECTED', 'EXPIRED'],
    default: 'PENDING'
  },
  pixCode: { type: String },
  qrCodeUrl: { type: String },
  createdAt: { type: Date, default: Date.now },
  expiresAt: { type: Date, required: true },
  completedAt: { type: Date },
  rejectedAt: { type: Date },
  rejectionReason: { type: String },
  approvedBy: { type: String }, // ID do admin que aprovou
  rejectedBy: { type: String }, // ID do admin que rejeitou
  bankInfo: { type: Schema.Types.Mixed }, // Informações bancárias recebidas
  deliveryData: { type: Schema.Types.Mixed }, // Dados da conta entregue
});

// Índices para melhor performance
PaymentSchema.index({ userId: 1 });
PaymentSchema.index({ productId: 1 });
PaymentSchema.index({ status: 1 });
PaymentSchema.index({ createdAt: -1 });
PaymentSchema.index({ expiresAt: 1 });

module.exports = mongoose.model('Payment', PaymentSchema);

// src/models/audit.js
const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const config = require('../config');

// Schema principal de log de auditoria
const AuditLogSchema = new Schema({
  action: { type: String, required: true },
  category: {
    type: String,
    required: true,
    enum: ['USER', 'PRODUCT', 'TRANSACTION', 'SECURITY', 'INTEGRATION', 'MARKETING', 'AI']
  },
  severity: {
    type: String,
    required: true,
    enum: config.audit.logLevels
  },
  status: {
    type: String,
    required: true,
    enum: ['SUCCESS', 'ERROR', 'WARNING', 'INFO', 'BLOCKED']
  },
  timestamp: { type: Date, default: Date.now },
  user: {
    id: { type: String },
    username: { type: String }
  },
  target: {
    id: { type: String },
    type: { type: String }
  },
  product: {
    id: { type: Schema.Types.ObjectId, ref: 'Product' },
    name: { type: String },
    price: { type: Number }
  },
  payment: {
    id: { type: Schema.Types.ObjectId, ref: 'Payment' },
    amount: { type: Number },
    method: { type: String }
  },
  details: { type: Schema.Types.Mixed }, // Detalhes adicionais específicos da ação
  ip: { type: String },
  retentionDate: { type: Date } // Data calculada para retenção do log
});

// Calcular data de retenção antes de salvar
AuditLogSchema.pre('save', function(next) {
  const now = new Date();

  // Calcular data de retenção com base na severidade
  if (this.severity === 'critical') {
    this.retentionDate = new Date(now.getTime() + config.audit.retentionPeriod.critical * 1000);
  } else if (this.severity === 'error') {
    this.retentionDate = new Date(now.getTime() + config.audit.retentionPeriod.error * 1000);
  } else if (this.severity === 'warning') {
    this.retentionDate = new Date(now.getTime() + config.audit.retentionPeriod.warning * 1000);
  } else {
    this.retentionDate = new Date(now.getTime() + config.audit.retentionPeriod.info * 1000);
  }

  next();
});

// Índices para melhor performance
AuditLogSchema.index({ action: 1 });
AuditLogSchema.index({ category: 1 });
AuditLogSchema.index({ severity: 1 });
AuditLogSchema.index({ timestamp: -1 });
AuditLogSchema.index({ 'user.id': 1 });
AuditLogSchema.index({ 'product.id': 1 });
AuditLogSchema.index({ 'payment.id': 1 });
AuditLogSchema.index({ retentionDate: 1 });

module.exports = mongoose.model('AuditLog', AuditLogSchema);

// src/models/promotion.js
const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const config = require('../config');

// Schema principal para promoções
const PromotionSchema = new Schema({
  titulo: { type: String, required: true },
  descricao: { type: String, required: true },
  tipo: {
    type: String,
    required: true,
    enum: config.marketing.promotionTypes
  },
  desconto: {
    type: Number,
    required: true,
    min: config.marketing.discountLimits.min,
    max: config.marketing.discountLimits.max
  },
  dataInicio: { type: Date, default: Date.now },
  dataFim: { type: Date, required: true },
  duracao: { type: Number, required: true }, // duração em horas
  ativa: { type: Boolean, default: true },
  criadoPor: { type: String, required: true },
  produtos: [{ type: Schema.Types.ObjectId, ref: 'Product' }], // Produtos específicos ou vazio para todos
  categorias: [{ type: String }], // Categorias afetadas ou vazio para todas
  codigoPromo: { type: String },
  usoLimitado: { type: Boolean, default: false },
  limiteUsos: { type: Number },
  usosAtuais: { type: Number, default: 0 },
  imageUrl: { type: String } // URL da imagem promocional
});

// Método para verificar se a promoção está ativa
PromotionSchema.methods.isActive = function() {
  const now = new Date();
  return this.ativa && now >= this.dataInicio && now <= this.dataFim;
};

// Método para verificar se um produto está na promoção
PromotionSchema.methods.appliesToProduct = function(productId, categoria) {
  // Se não tem produtos específicos, aplica a todos
  if (this.produtos.length === 0) {
    // Se tem categorias específicas, verifica
    if (this.categorias.length > 0) {
      return this.categorias.includes(categoria);
    }
    return true; // Aplica a todos
  }

  // Verifica se o produto específico está incluído
  return this.produtos.some(p => p.toString() === productId.toString());
};

// Índices para melhor performance
PromotionSchema.index({ ativa: 1 });
PromotionSchema.index({ dataInicio: 1 });
PromotionSchema.index({ dataFim: 1 });
PromotionSchema.index({ tipo: 1 });
PromotionSchema.index({ codigoPromo: 1 });
PromotionSchema.index({ 'produtos': 1 });
PromotionSchema.index({ 'categorias': 1 });

module.exports = mongoose.model('Promotion', PromotionSchema);

// src/models/loyalty.js
const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const config = require('../config');

// Schema para transações de pontos
const PointTransactionSchema = new Schema({
  amount: { type: Number, required: true }, // Pode ser positivo (ganho) ou negativo (gasto)
  reason: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
  expiresAt: { type: Date, required: true },
  status: {
    type: String,
    enum: ['ACTIVE', 'USED', 'EXPIRED', 'CANCELLED'],
    default: 'ACTIVE'
  },
  relatedProductId: { type: Schema.Types.ObjectId, ref: 'Product' },
  relatedPaymentId: { type: Schema.Types.ObjectId, ref: 'Payment' },
  actionBy: { type: String } // Admin ID se for uma ação manual
});

// Schema principal para o sistema de fidelidade
const LoyaltySchema = new Schema({
  userId: { type: String, required: true, unique: true },
  userName: { type: String, required: true },
  totalPoints: { type: Number, default: 0 }, // Saldo atual
  lifetimePoints: { type: Number, default: 0 }, // Total acumulado na vida
  level: { type: Number, default: 1 },
  transactions: [PointTransactionSchema],
  lastUpdated: { type: Date, default: Date.now }
});

// Calcular data de expiração para novos pontos
PointTransactionSchema.pre('save', function(next) {
  if (this.isNew && !this.expiresAt) {
    const now = new Date();
    this.expiresAt = new Date(now.getTime() + (config.marketing.loyaltyPoints.expirationDays * 24 * 60 * 60 * 1000));
  }
  next();
});

// Índices para melhor performance
LoyaltySchema.index({ userId: 1 }, { unique: true });
LoyaltySchema.index({ totalPoints: -1 });
LoyaltySchema.index({ level: -1 });
LoyaltySchema.index({ 'transactions.status': 1 });
LoyaltySchema.index({ 'transactions.expiresAt': 1 });

module.exports = mongoose.model('Loyalty', LoyaltySchema);
