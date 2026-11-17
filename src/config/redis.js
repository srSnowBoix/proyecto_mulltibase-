const { createClient } = require('redis');
require('dotenv').config();

const redisClient = createClient({
  socket: { host: process.env.REDIS_HOST, port: process.env.REDIS_PORT }
});

redisClient.on('error', (err) => console.error('Redis Error:', err));

const connectRedis = async () => {
  await redisClient.connect();
  console.log('Redis conectado');
};

// Devuelve todas las llaves que coinciden con un patrón (usa SCAN, no bloquea Redis)
const scanKeys = async (pattern) => {
  const keys = [];
  for await (const chunk of redisClient.scanIterator({ MATCH: pattern, COUNT: 100 })) {
    Array.isArray(chunk) ? keys.push(...chunk) : keys.push(chunk);
  }
  return keys;
};

module.exports = { redisClient, connectRedis, scanKeys };
