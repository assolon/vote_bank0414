const CACHE_NAME = 'vote-bank-v2';

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll([
                '/',
                '/index.html',
                '/style.css',
                '/script.js'
            ]);
        })
    );
    // 새 버전 즉시 활성화
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => {
            // 새로운 서비스워커가 즉시 페이지 제어
            return clients.claim();
        })
    );
});

self.addEventListener('fetch', (event) => {
    if (event.request.method === 'POST') {
        return;
    }
    event.respondWith(
        caches.match(event.request).then((response) => {
            // 항상 네트워크 요청을 먼저 시도
            return fetch(event.request)
                .then((networkResponse) => {
                    // 네트워크 응답을 캐시에 저장
                    if (networkResponse && networkResponse.status === 200) {
                        const responseToCache = networkResponse.clone();
                        caches.open(CACHE_NAME).then((cache) => {
                            cache.put(event.request, responseToCache);
                        });
                    }
                    return networkResponse;
                })
                .catch(() => {
                    // 네트워크 요청 실패시 캐시된 응답 반환
                    return response;
                });
        })
    );
});

// SKIP_WAITING 메시지 처리
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
}); 