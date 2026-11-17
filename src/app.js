const express = require('express');
const cors = require('cors');
require('dotenv').config();

const connectMongo = require('./config/mongo');
const { connectRedis } = require('./config/redis');

const app = express();
app.use(cors());
app.use(express.json());

// Ruta raíz: resumen de los recursos disponibles
app.get('/', (req, res) => {
  res.json({
    proyecto: 'Tienda multibase (PostgreSQL + MongoDB + Redis)',
    recursos: {
      '/api/usuarios':  'PostgreSQL',
      '/api/productos': 'PostgreSQL',
      '/api/pedidos':   'PostgreSQL',
      '/api/resenas':   'MongoDB',
      '/api/sesiones':  'Redis',
      '/api/carrito':   'Redis',
    },
  });
});

app.use('/api/usuarios',  require('./routes/usuario.routes'));
app.use('/api/productos', require('./routes/producto.routes'));
app.use('/api/pedidos',   require('./routes/pedido.routes'));
app.use('/api/resenas',   require('./routes/resena.routes'));
app.use('/api/sesiones',  require('./routes/sesion.routes'));
app.use('/api/carrito',   require('./routes/carrito.routes'));

// Ruta no encontrada
app.use((req, res) => res.status(404).json({ error: 'Ruta no encontrada' }));

// Errores generales (por ejemplo, JSON mal formado en el body)
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed')
    return res.status(400).json({ error: 'JSON inválido en el cuerpo de la petición' });
  console.error(err);
  res.status(500).json({ error: 'Error interno del servidor' });
});

const PORT = process.env.PORT || 3000;

(async () => {
  try {
    await connectMongo();
    await connectRedis();
    app.listen(PORT, () => {
      console.log(` Servidor en http://localhost:${PORT}`);
    });
  } catch (e) {
    console.error(' No se pudo iniciar el servidor:', e.message);
    process.exit(1);
  }
})();
