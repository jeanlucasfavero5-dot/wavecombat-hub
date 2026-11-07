self.addEventListener('install', (event) => {
    console.log('Service Worker instalado com sucesso.');
});

self.addEventListener('fetch', (event) => {
    // Apenas passa os pedidos normalmente
    event.respondWith(fetch(event.request));
});
