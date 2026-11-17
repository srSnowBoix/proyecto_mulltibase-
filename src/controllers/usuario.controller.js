const pool = require('../config/postgres');

// GET - Obtener todos los usuarios activos
exports.getAll = async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, nombre, email, created_at FROM usuarios WHERE deleted_at IS NULL ORDER BY id'
    );
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
};

// GET - Obtener un usuario por ID
exports.getById = async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, nombre, email, created_at FROM usuarios WHERE id = $1 AND deleted_at IS NULL',
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Usuario no encontrado' });
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
};

// POST - Crear usuario
exports.create = async (req, res) => {
  try {
    const { nombre, email, password } = req.body;
    const { rows } = await pool.query(
      'INSERT INTO usuarios (nombre, email, password) VALUES ($1,$2,$3) RETURNING id, nombre, email, created_at',
      [nombre, email, password]
    );
    res.status(201).json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
};

// PATCH - Actualizar usuario
exports.update = async (req, res) => {
  try {
    const { nombre, email, password } = req.body;
    const { rows } = await pool.query(
      `UPDATE usuarios SET nombre=COALESCE($1,nombre), email=COALESCE($2,email),
       password=COALESCE($3,password), updated_at=NOW()
       WHERE id=$4 AND deleted_at IS NULL
       RETURNING id, nombre, email, updated_at`,
      [nombre, email, password, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Usuario no encontrado' });
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
};

// DELETE - Borrado Lógico (solo actualiza la fecha)
exports.remove = async (req, res) => {
  try {
    const { rows } = await pool.query(
      'UPDATE usuarios SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL RETURNING id',
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Usuario no encontrado' });
    res.json({ mensaje: 'Usuario eliminado lógicamente', id: rows[0].id });
  } catch (e) { res.status(500).json({ error: e.message }); }
};