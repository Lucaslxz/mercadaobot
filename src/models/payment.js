const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const config = require('../config');

/**
 * Schema de pagamento para transações no sistema de vendas
 */
const PaymentSchema = new Schema({
  // Identificação do usuário
  userId: {
    type: String,
    required: true,
    index: true
  },
  userName: {
    type: String,
    required: true
  },

  // Detalhes do produto
  productId: {
    type: Schema.Types.ObjectId,
    ref: 'Product',
    required: true
  },
  productName: {
    type: String,
    required: true
  },

  // Informações financeiras
  amount: {
    type: Number,
    required: true,
    min: [0, 'Valor do pagamento não pode ser negativo']
  },
  method: {
    type: String,
    enum: ['PIX', 'MANUAL', 'CREDIT_CARD', 'CRYPTO'],
    default: 'PIX'
  },

  // Status do pagamento
  status: {
    type: String,
    enum: [
      'PENDING',     // Aguardando pagamento
      'PROCESSING',  // Em processamento
      'COMPLETED',   // Pagamento confirmado
      'FAILED',      // Falha no pagamento
      'REFUNDED',    // Reembolsado
      'CANCELLED',   // Cancelado
      'EXPIRED'      // Expirado
    ],
    default: 'PENDING',
    index: true
  },

  // Detalhes de PIX
  pixDetails: {
    code: { type: String },
    qrCode: { type: String },
    transactionId: { type: String },
    paymentProofUrl: { type: String }
  },

  // Metadados de transação
  metadata: {
    ipAddress: { type: String },
    userAgent: { type: String },
    deviceFingerprint: { type: String }
  },

  // Timestamps de eventos
  createdAt: {
    type: Date,
    default: Date.now,
    index: true
  },
  updatedAt: {
    type: Date,
    default: Date.now
  },
  expiresAt: {
    type: Date,
    default: () => new Date(Date.now() + config.payment.expiration * 1000)
  },
  completedAt: { type: Date },
  failedAt: { type: Date },

  // Informações de aprovação/rejeição
  approvalInfo: {
    approvedBy: { type: String },
    approvedAt: { type: Date },
    rejectionReason: { type: String },
    rejectedBy: { type: String },
    rejectedAt: { type: Date }
  },

  // Informações de entrega
  deliveryDetails: {
    method: {
      type: String,
      enum: ['DIGITAL', 'MANUAL', 'AUTOMATIC']
    },
    deliveredAt: { type: Date },
    accessCredentials: { type: Schema.Types.Mixed }
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Índices para melhor performance
PaymentSchema.index({
  userId: 1,
  status: 1,
  createdAt: -1
});

// Hook para atualizar timestamps
PaymentSchema.pre('save', function(next) {
  this.updatedAt = new Date();

  // Atualizar status específicos
  if (this.status === 'COMPLETED') {
    this.completedAt = new Date();
  } else if (this.status === 'FAILED' || this.status === 'CANCELLED') {
    this.failedAt = new Date();
  }

  next();
});

// Método virtual para verificar se o pagamento expirou
PaymentSchema.virtual('isExpired').get(function() {
  return this.expiresAt < new Date() && this.status === 'PENDING';
});

// Método para gerar relatórios
PaymentSchema.statics.generatePaymentReport = async function(filters = {}) {
  const defaultFilters = {
    createdAt: {
      $gte: new Date(new Date().setDate(new Date().getDate() - 30))
    }
  };

  const mergedFilters = { ...defaultFilters, ...filters };

  return this.aggregate([
    { $match: mergedFilters },
    {
      $group: {
        _id: '$status',
        total: { $sum: 1 },
        totalAmount: { $sum: '$amount' }
      }
    },
    { $sort: { total: -1 } }
  ]);
};

const Payment = mongoose.model('Payment', PaymentSchema);

module.exports = Payment;
