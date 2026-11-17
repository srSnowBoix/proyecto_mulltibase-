const mongoose = require('mongoose');
const pool = require('../config/postgres');
const Resena = require('../models/resena.model');

const handleError = (res, e) => {
  if (e.name === 'ValidationError')
    return res.status(400).json({ error: e.message });
  res.status(e.status || 500).json({ error: e.message });
};
const idValido = (id) => mongoose.isValidObjectId(id);

// GET - Todas las reseñas activas (opcional: ?producto_id=1&usuario_id=2)
exports.getAll = async (req, res) => {
  try {
    const filtro = { deleted_at: null };
    if (req.query.producto_id) filtro.producto_id = Number(req.query.producto_id);
    if (req.query.usuario_id)  filtro.usuario_id  = Number(req.query.usuario_id);
    const resenas = await Resena.find(filtro).sort({ created_at: -1 });
    res.json(resenas);
  } catch (e) { handleError(res, e); }
};

// GET - Una reseña por ID
exports.getById = async (req, res) => {
  try {
    if (!idValido(req.params.id)) return res.status(400).json({ error: 'ID inválido' });
    const resena = await Resena.findOne({ _id: req.params.id, deleted_at: null });
    if (!resena) return res.status(404).json({ error: 'Reseña no encontrada' });
    res.json(resena);
  } catch (e) { handleError(res, e); }
};

// POST - Crear reseña (verifica en PostgreSQL que el usuario y el producto existan)
exports.create = async (req, res) => {
  try {
    const { producto_id, usuario_id, calificacion, comentario } = req.body;

    const [u, p] = await Promise.all([
      pool.query('SELECT 1 FROM usuarios  WHERE id=$1 AND deleted_at IS NULL', [usuario_id]),
      pool.query('SELECT 1 FROM productos WHERE id=$1 AND deleted_at IS NULL', [producto_id]),
    ]);
    if (!u.rows.length) return res.status(404).json({ error: 'Usuario no encontrado' });
    if (!p.rows.length) return res.status(404).json({ error: 'Producto no encontrado' });

    const resena = await Resena.create({ producto_id, usuario_id, calificacion, comentario });
    res.status(201).json(resena);
  } catch (e) {
    // Si producto_id / usuario_id no son números, PostgreSQL o Mongoose lo rechazan
    if (e.code === '22P02') return res.status(400).json({ error: 'producto_id y usuario_id deben ser números' });
    handleError(res, e);
  }
};

// PATCH - Editar calificación y/o comentario
exports.update = async (req, res) => {
  try {
    if (!idValido(req.params.id)) return res.status(400).json({ error: 'ID inválido' });
    const cambios = {};
    if (req.body.calificacion !== undefined) cambios.calificacion = req.body.calificacion;
    if (req.body.comentario   !== undefined) cambios.comentario   = req.body.comentario;

    const resena = await Resena.findOneAndUpdate(
      { _id: req.params.id, deleted_at: null },
      cambios,
      { new: true, runValidators: true }
    );
    if (!resena) return res.status(404).json({ error: 'Reseña no encontrada' });
    res.json(resena);
  } catch (e) { handleError(res, e); }
};

// DELETE - Borrado lógico (solo marca deleted_at)
exports.remove = async (req, res) => {
  try {
    if (!idValido(req.params.id)) return res.status(400).json({ error: 'ID inválido' });
    const resena = await Resena.findOneAndUpdate(
      { _id: req.params.id, deleted_at: null },
      { deleted_at: new Date() },
      { new: true }
    );
    if (!resena) return res.status(404).json({ error: 'Reseña no encontrada' });
    res.json({ mensaje: 'Reseña eliminada lógicamente', id: resena._id });
  } catch (e) { handleError(res, e); }
};
