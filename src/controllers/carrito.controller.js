const pool = require('../config/postgres');
const { redisClient, scanKeys } = require('../config/redis');

const key = (usuarioId) => `carrito:${usuarioId}`;
const esEnteroPositivo = (n) => Number.isInteger(Number(n)) && Number(n) > 0;

const calcularTotal = (carrito) =>
  Number(carrito.items.reduce((t, i) => t + i.precio * i.cantidad, 0).toFixed(2));

// Lee un carrito; devuelve null si no existe o está borrado lógicamente
const leer = async (usuarioId) => {
  const raw = await redisClient.get(key(usuarioId));
  if (!raw) return null;
  const carrito = JSON.parse(raw);
  return carrito.deleted_at ? null : carrito;
};
const guardar = (carrito) => redisClient.set(key(carrito.usuario_id), JSON.stringify(carrito));
const respuesta = (carrito) => ({ ...carrito, total: calcularTotal(carrito) });

// GET - Todos los carritos activos
exports.getAll = async (req, res) => {
  try {
    const keys = await scanKeys('carrito:*');
    const valores = keys.length ? await redisClient.mGet(keys) : [];
    const carritos = valores
      .filter(Boolean)
      .map((v) => JSON.parse(v))
      .filter((c) => !c.deleted_at)
      .map(respuesta);
    res.json(carritos);
  } catch (e) { res.status(500).json({ error: e.message }); }
};

// GET - Carrito de un usuario
exports.getById = async (req, res) => {
  try {
    const carrito = await leer(req.params.usuario_id);
    if (!carrito) return res.status(404).json({ error: 'Carrito no encontrado' });
    res.json(respuesta(carrito));
  } catch (e) { res.status(500).json({ error: e.message }); }
};

// POST - Agregar un producto al carrito (lo crea si no existe).
// Body: { usuario_id, producto_id, cantidad }. Si el producto ya estaba, suma la cantidad.
exports.create = async (req, res) => {
  try {
    const { usuario_id, producto_id, cantidad } = req.body;
    if (!esEnteroPositivo(usuario_id) || !esEnteroPositivo(producto_id) || !esEnteroPositivo(cantidad))
      return res.status(400).json({ error: 'usuario_id, producto_id y cantidad deben ser enteros positivos' });

    const u = await pool.query('SELECT 1 FROM usuarios WHERE id=$1 AND deleted_at IS NULL', [usuario_id]);
    if (!u.rows.length) return res.status(404).json({ error: 'Usuario no encontrado' });
    const p = await pool.query(
      'SELECT id, nombre, precio, stock FROM productos WHERE id=$1 AND deleted_at IS NULL', [producto_id]);
    if (!p.rows.length) return res.status(404).json({ error: 'Producto no encontrado' });

    const ahora = new Date().toISOString();
    const carrito = (await leer(usuario_id)) ||
      { usuario_id: Number(usuario_id), items: [], created_at: ahora, updated_at: ahora, deleted_at: null };

    const existente = carrito.items.find((i) => i.producto_id === Number(producto_id));
    const nuevaCantidad = (existente ? existente.cantidad : 0) + Number(cantidad);
    if (nuevaCantidad > p.rows[0].stock)
      return res.status(409).json({ error: `Stock insuficiente para "${p.rows[0].nombre}" (disponible: ${p.rows[0].stock})` });

    if (existente) existente.cantidad = nuevaCantidad;
    else carrito.items.push({
      producto_id: Number(producto_id),
      nombre: p.rows[0].nombre,
      precio: Number(p.rows[0].precio),
      cantidad: Number(cantidad),
    });
    carrito.updated_at = ahora;
    await guardar(carrito);
    res.status(201).json(respuesta(carrito));
  } catch (e) { res.status(500).json({ error: e.message }); }
};

// PATCH - Cambiar la cantidad de un producto del carrito.
// Body: { producto_id, cantidad }. Con cantidad 0 el producto se quita del carrito.
exports.update = async (req, res) => {
  try {
    const { producto_id, cantidad } = req.body;
    if (!esEnteroPositivo(producto_id) || !Number.isInteger(Number(cantidad)) || Number(cantidad) < 0)
      return res.status(400).json({ error: 'producto_id y cantidad (entero >= 0) son obligatorios' });

    const carrito = await leer(req.params.usuario_id);
    if (!carrito) return res.status(404).json({ error: 'Carrito no encontrado' });

    const item = carrito.items.find((i) => i.producto_id === Number(producto_id));
    if (!item) return res.status(404).json({ error: 'El producto no está en el carrito' });

    if (Number(cantidad) === 0) {
      carrito.items = carrito.items.filter((i) => i !== item);
    } else {
      const p = await pool.query(
        'SELECT stock FROM productos WHERE id=$1 AND deleted_at IS NULL', [producto_id]);
      if (p.rows.length && Number(cantidad) > p.rows[0].stock)
        return res.status(409).json({ error: `Stock insuficiente (disponible: ${p.rows[0].stock})` });
      item.cantidad = Number(cantidad);
    }
    carrito.updated_at = new Date().toISOString();
    await guardar(carrito);
    res.json(respuesta(carrito));
  } catch (e) { res.status(500).json({ error: e.message }); }
};

// DELETE - Vaciar/eliminar el carrito (borrado lógico: se conserva la llave y se marca deleted_at)
exports.remove = async (req, res) => {
  try {
    const carrito = await leer(req.params.usuario_id);
    if (!carrito) return res.status(404).json({ error: 'Carrito no encontrado' });
    carrito.deleted_at = new Date().toISOString();
    await guardar(carrito);
    res.json({ mensaje: 'Carrito eliminado lógicamente', usuario_id: carrito.usuario_id });
  } catch (e) { res.status(500).json({ error: e.message }); }
};
