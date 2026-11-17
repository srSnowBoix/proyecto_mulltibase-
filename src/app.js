const express = require('express');
const cors = require('cors');
require('dotenv').config();

const connectMongo = require('./config/mongo');
const { connectRedis } = require('./config/redis');

const app = express();
app.use(cors());
app.use(express.json());

// Aquí luego agregaremos las rutas
app.use('/api/usuarios', require('./routes/usuario.routes'));

(async () => {
  await connectMongo();
  await connectRedis();
  app.listen(process.env.PORT, () => {
    console.log(`🚀 Servidor en http://localhost:${process.env.PORT}`);
  });
})();