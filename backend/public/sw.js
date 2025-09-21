// Service Worker básico
self.addEventListener('install', () => {
    console.log('Service Worker instalado');
});

self.addEventListener('fetch', (event) => {
    // No hacer cache por ahora
});