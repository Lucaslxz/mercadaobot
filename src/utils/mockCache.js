// src/utils/mockCache.js
const mockStorage = new Map();

async function initCache() {
  console.log('Mock cache inicializado (sem Redis)');
  return true;
}

async function get(key) {
  return mockStorage.get(key) || null;
}

async function set(key, value, ttl = 3600) {
  mockStorage.set(key, value);

  // Simular expiração
  if (ttl > 0) {
    setTimeout(() => {
      mockStorage.delete(key);
    }, ttl * 1000);
  }

  return true;
}

async function del(key) {
  mockStorage.delete(key);
  return true;
}

async function clear() {
  mockStorage.clear();
  return true;
}

async function keys(pattern) {
  // Implementação básica sem suporte a padrões
  return Array.from(mockStorage.keys());
}

module.exports = {
  initCache,
  get,
  set,
  del,
  clear,
  keys,
  client: () => null
};
