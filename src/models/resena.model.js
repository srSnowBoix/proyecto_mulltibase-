const mongoose = require('mongoose');

const resenaSchema = new mongoose.Schema(
  {
    producto_id: { type: Number, required: true, index: true }, // id en PostgreSQL
    usuario_id:  { type: Number, required: true, index: true }, // id en PostgreSQL
    calificacion: { type: Number, required: true, min: 1, max: 5 },
    comentario:  { type: String, trim: true, maxlength: 1000, default: '' },
    deleted_at:  { type: Date, default: null }, // borrado lógico
  },
  { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } }
);

module.exports = mongoose.model('Resena', resenaSchema);
