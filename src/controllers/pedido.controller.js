const pool = require('../config/postgres');

const ESTADOS = ['pendiente', 'pagado', 'enviado', 'entregado', 'cancelado'];

// Error con código HTTP para cortar la transacción con un mensaje claro
class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const handleError = (res, e) =>
  res.status(e.status || 500).json({ error: e.message });

const esEnteroPositivo = (n) => Number.isInteger(Number(n)) && Number(n) > 0;

// Trae los items de uno o varios pedidos
const getItems = async (ids) => {
  if (!ids.length) return {};
  const { rows } = await pool.query(
    `SELECT pi.pedido_id, pi.producto_id, p.nombre AS producto, pi.cantidad, pi.precio_unitario
     FROM pedido_items pi JOIN productos p ON p.id = pi.producto_id
     WHERE pi.pedido_id = ANY($1::int[]) ORDER BY pi.id`,
    [ids]
  );
  return rows.reduce((acc, r) => {
    (acc[r.pedido_id] = acc[r.pedido_id] || []).push(r);
    return acc;
  }, {});
};

// GET - Todos los pedidos activos (opcional: ?usuario_id=1&estado=pendiente)
exports.getAll = async (req, res) => {
  try {
    const { usuario_id, estado } = req.query;
    const { rows } = await pool.query(
      `SELECT * FROM pedidos
       WHERE deleted_at IS NULL
         AND ($1::int IS NULL OR usuario_id = $1::int)
         AND ($2::text IS NULL OR estado = $2::text)
       ORDER BY id`,
      [usuario_id || null, estado || null]
    );
    const items = await getItems(rows.map((r) => r.id));
    res.json(rows.map((r) => ({ ...r, items: items[r.id] || [] })));
  } catch (e) { handleError(res, e); }
};

// GET - Un pedido por ID (con sus items)
exports.getById = async (req, res) => {
  try {
    if (!esEnteroPositivo(req.params.id)) throw new HttpError(400, 'ID inválido');
    const { rows } = await pool.query(
      'SELECT * FROM pedidos WHERE id=$1 AND deleted_at IS NULL',
      [req.params.id]
    );
    if (!rows.length) throw new HttpError(404, 'Pedido no encontrado');
    const items = await getItems([rows[0].id]);
    res.json({ ...rows[0], items: items[rows[0].id] || [] });
  } catch (e) { handleError(res, e); }
};

// POST - Crear pedido. Body: { usuario_id, items: [{ producto_id, cantidad }] }
// Calcula el total, valida y descuenta stock, todo dentro de una transacción.
exports.create = async (req, res) => {
  const { usuario_id, items } = req.body;
  const client = await pool.connect();
  try {
    if (!esEnteroPositivo(usuario_id)) throw new HttpError(400, 'usuario_id es obligatorio');
    if (!Array.isArray(items) || !items.length)
      throw new HttpError(400, 'items debe ser un arreglo con al menos un producto');
    for (const it of items) {
      if (!esEnteroPositivo(it.producto_id) || !esEnteroPositivo(it.cantidad))
        throw new HttpError(400, 'Cada item necesita producto_id y cantidad (enteros positivos)');
    }

    await client.query('BEGIN');

    const u = await client.query(
      'SELECT id FROM usuarios WHERE id=$1 AND deleted_at IS NULL', [usuario_id]);
    if (!u.rows.length) throw new HttpError(404, 'Usuario no encontrado');

    // Orden fijo por producto_id para evitar bloqueos cruzados entre pedidos
    const ordenados = [...items].sort((a, b) => a.producto_id - b.producto_id);
    let total = 0;
    const detalle = [];
    for (const it of ordenados) {
      const p = await client.query(
        'SELECT id, nombre, precio, stock FROM productos WHERE id=$1 AND deleted_at IS NULL FOR UPDATE',
        [it.producto_id]
      );
      if (!p.rows.length) throw new HttpError(404, `Producto ${it.producto_id} no encontrado`);
      if (p.rows[0].stock < it.cantidad)
        throw new HttpError(409, `Stock insuficiente para "${p.rows[0].nombre}" (disponible: ${p.rows[0].stock})`);
      await client.query(
        'UPDATE productos SET stock = stock - $1, updated_at = NOW() WHERE id = $2',
        [it.cantidad, it.producto_id]
      );
      total += Number(p.rows[0].precio) * Number(it.cantidad);
      detalle.push({ producto_id: it.producto_id, cantidad: Number(it.cantidad), precio_unitario: p.rows[0].precio });
    }

    const pedido = await client.query(
      'INSERT INTO pedidos (usuario_id, total) VALUES ($1, $2) RETURNING *',
      [usuario_id, total.toFixed(2)]
    );
    for (const d of detalle) {
      await client.query(
        'INSERT INTO pedido_items (pedido_id, producto_id, cantidad, precio_unitario) VALUES ($1,$2,$3,$4)',
        [pedido.rows[0].id, d.producto_id, d.cantidad, d.precio_unitario]
      );
    }
    await client.query('COMMIT');
    res.status(201).json({ ...pedido.rows[0], items: detalle });
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    handleError(res, e);
  } finally {
    client.release();
  }
};

// PATCH - Cambiar el estado del pedido. Body: { estado }
// Si se cancela, el stock de los productos se regresa.
exports.update = async (req, res) => {
  const client = await pool.connect();
  try {
    if (!esEnteroPositivo(req.params.id)) throw new HttpError(400, 'ID inválido');
    const { estado } = req.body;
    if (!ESTADOS.includes(estado))
      throw new HttpError(400, `estado inválido. Valores permitidos: ${ESTADOS.join(', ')}`);

    await client.query('BEGIN');
    const actual = await client.query(
      'SELECT * FROM pedidos WHERE id=$1 AND deleted_at IS NULL FOR UPDATE', [req.params.id]);
    if (!actual.rows.length) throw new HttpError(404, 'Pedido no encontrado');
    if (actual.rows[0].estado === 'cancelado')
      throw new HttpError(409, 'Un pedido cancelado ya no se puede modificar');

    if (estado === 'cancelado') {
      await client.query(
        `UPDATE productos p SET stock = p.stock + pi.cantidad, updated_at = NOW()
         FROM pedido_items pi WHERE pi.pedido_id = $1 AND pi.producto_id = p.id`,
        [req.params.id]
      );
    }
    const { rows } = await client.query(
      'UPDATE pedidos SET estado=$1, updated_at=NOW() WHERE id=$2 RETURNING *',
      [estado, req.params.id]
    );
    await client.query('COMMIT');
    res.json(rows[0]);
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    handleError(res, e);
  } finally {
    client.release();
  }
};

// DELETE - Borrado lógico (solo marca deleted_at)
exports.remove = async (req, res) => {
  try {
    if (!esEnteroPositivo(req.params.id)) throw new HttpError(400, 'ID inválido');
    const { rows } = await pool.query(
      'UPDATE pedidos SET deleted_at = NOW() WHERE id=$1 AND deleted_at IS NULL RETURNING id',
      [req.params.id]
    );
    if (!rows.length) throw new HttpError(404, 'Pedido no encontrado');
    res.json({ mensaje: 'Pedido eliminado lógicamente', id: rows[0].id });
  } catch (e) { handleError(res, e); }
};
