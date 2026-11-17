const crypto = require('crypto');
const pool = require('../config/postgres');
const { redisClient, scanKeys } = require('../config/redis');

const TTL = Number(process.env.SESSION_TTL_SECONDS) || 3600; // segundos
const key = (token) => `sesion:${token}`;

// Lee una sesión; devuelve null si no existe o está borrada lógicamente
const leer = async (token) => {
  const raw = await redisClient.get(key(token));
  if (!raw) return null;
  const sesion = JSON.parse(raw);
  return sesion.deleted_at ? null : sesion;
};

// GET - Todas las sesiones activas
exports.getAll = async (req, res) => {
  try {
    const keys = await scanKeys('sesion:*');
    const valores = keys.length ? await redisClient.mGet(keys) : [];
    const sesiones = valores
      .filter(Boolean)
      .map((v) => JSON.parse(v))
      .filter((s) => !s.deleted_at);
    res.json(sesiones);
  } catch (e) { res.status(500).json({ error: e.message }); }
};

// GET - Una sesión por token (también sirve para validar si sigue vigente)
exports.getById = async (req, res) => {
  try {
    const sesion = await leer(req.params.token);
    if (!sesion) return res.status(404).json({ error: 'Sesión no encontrada o expirada' });
    const ttl = await redisClient.ttl(key(req.params.token));
    res.json({ ...sesion, expira_en_segundos: ttl });
  } catch (e) { res.status(500).json({ error: e.message }); }
};

// POST - Iniciar sesión (login). Body: { email, password }
exports.create = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ error: 'email y password son obligatorios' });

    const { rows } = await pool.query(
      'SELECT id, nombre, email, password FROM usuarios WHERE email=$1 AND deleted_at IS NULL',
      [email]
    );
    if (!rows.length || rows[0].password !== password)
      return res.status(401).json({ error: 'Credenciales incorrectas' });

    const token = crypto.randomUUID();
    const ahora = new Date().toISOString();
    const sesion = {
      token,
      usuario_id: rows[0].id,
      nombre: rows[0].nombre,
      email: rows[0].email,
      datos: {},
      created_at: ahora,
      updated_at: ahora,
      deleted_at: null,
    };
    await redisClient.set(key(token), JSON.stringify(sesion), { EX: TTL });
    res.status(201).json({ ...sesion, expira_en_segundos: TTL });
  } catch (e) { res.status(500).json({ error: e.message }); }
};

// PATCH - Renovar la sesión (reinicia el tiempo de vida) y/o guardar datos extra.
// Body opcional: { datos: { ... } }
exports.update = async (req, res) => {
  try {
    const sesion = await leer(req.params.token);
    if (!sesion) return res.status(404).json({ error: 'Sesión no encontrada o expirada' });

    if (req.body.datos !== undefined) {
      if (typeof req.body.datos !== 'object' || Array.isArray(req.body.datos) || req.body.datos === null)
        return res.status(400).json({ error: 'datos debe ser un objeto' });
      sesion.datos = { ...sesion.datos, ...req.body.datos };
    }
    sesion.updated_at = new Date().toISOString();
    await redisClient.set(key(sesion.token), JSON.stringify(sesion), { EX: TTL });
    res.json({ ...sesion, expira_en_segundos: TTL });
  } catch (e) { res.status(500).json({ error: e.message }); }
};

// DELETE - Cerrar sesión (borrado lógico: se conserva la llave y se marca deleted_at;
// Redis la eliminará sola cuando llegue su tiempo de expiración)
exports.remove = async (req, res) => {
  try {
    const sesion = await leer(req.params.token);
    if (!sesion) return res.status(404).json({ error: 'Sesión no encontrada o expirada' });

    sesion.deleted_at = new Date().toISOString();
    await redisClient.set(key(sesion.token), JSON.stringify(sesion), { KEEPTTL: true });
    res.json({ mensaje: 'Sesión cerrada lógicamente', token: sesion.token });
  } catch (e) { res.status(500).json({ error: e.message }); }
};
