const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const ProductDetailsSchema = new Schema({
  rank: { type: String },
  skins: { type: Number, default: 0 },
  level: { type: Number, default: 0 },
  agents: { type: Number, default: 0 },
  region: { type: String },
  email_changed: { type: Boolean, default: false },
  valorantPoints: { type: Number, default: 0 },
  verification: { type: Boolean, default: true }
}, { _id: false, strict: false });

const ProductSchema = new Schema({
  nome: {
    type: String,
    required: true,
    trim: true
  },
  tipo: {
    type: String,
    required: true,
    lowercase: true,
    index: true
  },
  preco: {
    type: Number,
    required: true,
    min: [0, 'Preço não pode ser negativo']
  },
  descricao: {
    type: String,
    required: true
  },
  detalhes: {
    type: ProductDetailsSchema,
    default: () => ({})
  },
  disponivel: {
    type: Boolean,
    default: true,
    index: true
  },
  vendido: {
    type: Boolean,
    default: false,
    index: true
  },
  dataCriacao: {
    type: Date,
    default: Date.now,
    index: true
  },
  dataVenda: {
    type: Date
  },
  ultimaAtualizacao: {
    type: Date,
    default: Date.now
  },
  visualizacoes: {
    type: Number,
    default: 0
  },
  compradoPor: {
    type: String
  },
  criadoPor: {
    type: String
  },
  origem: {
    type: String,
    enum: ['MANUAL', 'LZT', 'API'],
    default: 'MANUAL'
  },
  origemId: {
    type: String
  },
  imagens: [{
    type: String
  }]
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Índices para otimização de consultas
ProductSchema.index({
  tipo: 1,
  preco: 1,
  disponivel: 1,
  dataCriacao: -1
});

// Hook para atualizar visualizações
ProductSchema.methods.incrementViews = function() {
  this.visualizacoes += 1;
  return this.save();
};

// Método para buscar produtos similares
ProductSchema.methods.findSimilarProducts = async function(limit = 5) {
  return this.model('Product').find({
    tipo: this.tipo,
    _id: { $ne: this._id },
    disponivel: true,
    preco: {
      $gte: this.preco * 0.8,
      $lte: this.preco * 1.2
    }
  }).limit(limit);
};

// Método estático para busca avançada
ProductSchema.statics.searchProducts = async function(filters = {}) {
  const {
    tipo,
    precoMin,
    precoMax,
    disponivel,
    vendido,
    origem
  } = filters;

  const query = {};

  if (tipo) query.tipo = tipo;
  if (precoMin) query.preco = { ...query.preco, $gte: precoMin };
  if (precoMax) query.preco = { ...query.preco, $lte: precoMax };
  if (disponivel !== undefined) query.disponivel = disponivel;
  if (vendido !== undefined) query.vendido = vendido;
  if (origem) query.origem = origem;

  return this.find(query)
    .sort({ dataCriacao: -1 })
    .lean();
};

const Product = mongoose.model('Product', ProductSchema);

module.exports = Product;
