const pool = require('../config/postgres');

exports.getAll = async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM productos WHERE deleted_at IS NULL ORDER BY id');
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
};

exports.getById = async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM productos WHERE id=$1 AND deleted_at IS NULL', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Producto no encontrado' });
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
};

exports.create = async (req, res) => {
  try {
    const { nombre, descripcion, precio, stock } = req.body;
    const { rows } = await pool.query(
      'INSERT INTO productos (nombre, descripcion, precio, stock) VALUES ($1,$2,$3,$4) RETURNING *',
      [nombre, descripcion, precio, stock]
    );
    res.status(201).json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
};

exports.update = async (req, res) => {
  try {
    const { nombre, descripcion, precio, stock } = req.body;
    const { rows } = await pool.query(
      `UPDATE productos SET nombre=COALESCE($1,nombre), descripcion=COALESCE($2,descripcion),
       precio=COALESCE($3,precio), stock=COALESCE($4,stock), updated_at=NOW()
       WHERE id=$5 AND deleted_at IS NULL RETURNING *`,
      [nombre, descripcion, precio, stock, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Producto no encontrado' });
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
};

exports.remove = async (req, res) => {
  try {
    const { rows } = await pool.query(
      'UPDATE productos SET deleted_at=NOW() WHERE id=$1 AND deleted_at IS NULL RETURNING id',
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Producto no encontrado' });
    res.json({ mensaje: 'Producto eliminado lógicamente', id: rows[0].id });
  } catch (e) { res.status(500).json({ error: e.message }); }
};
