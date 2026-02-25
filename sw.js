const CACHE_NAME = 'logbook-cache-v2';
const ASSETS_TO_CACHE = [
    './',
    './index.html',
    './manifest.json',
    './icon-192.png',
    './icon-512.png'
];
const TIMEOUT_DURATION = 3000; // 3초 타임아웃 설정

// ⏱️ 타임아웃이 적용된 커스텀 fetch 함수 (가짜 와이파이 무한 로딩 방어)
const fetchWithTimeout = async (request, timeout) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
        const response = await fetch(request, { signal: controller.signal });
        clearTimeout(timeoutId);
        return response;
    } catch (error) {
        clearTimeout(timeoutId);
        throw error; // 타임아웃 시 강제로 에러 발생
    }
};

// 1. 설치 시점에 파일들을 기기에 캐시(저장)
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(ASSETS_TO_CACHE))
    );
    self.skipWaiting(); // 새 버전 설치 시 즉시 대기상태 해제
});

// 🌟 2. [추가됨] 앱 업데이트 시 오래된 과거 캐시 완벽 삭제
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    if (cacheName !== CACHE_NAME) {
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
    self.clients.claim(); // 새 서비스 워커가 즉시 제어권 획득
});

// 3. 가짜 와이파이/오프라인 대응 (Cache First 전략 + 타임아웃)
self.addEventListener('fetch', event => {
    const url = new URL(event.request.url);

    // 구글 시트 동기화(fetch) 요청: 5초 안에 응답 없으면 강제 차단하여 멈춤 현상 방지
    if (url.hostname.includes('script.google.com') || event.request.method !== 'GET') {
        event.respondWith(
            fetchWithTimeout(event.request, 5000).catch(() => {
                // 가짜 와이파이에서 무한 로딩하지 않고 즉시 에러 메시지 반환
                return new Response(JSON.stringify({ result: "error", msg: "네트워크가 불안정하거나 오프라인 상태입니다." }), {
                    headers: { 'Content-Type': 'application/json' }
                });
            })
        );
        return; 
    }

    // 일반 화면/파일 요청: 캐시 우선 (Cache-First)
    event.respondWith(
        caches.match(event.request)
            .then(cachedResponse => {
                // 기기에 저장된 캐시가 있으면 즉시 반환 (0.1초 로딩)
                if (cachedResponse) {
                    return cachedResponse;
                }
                
                // 캐시에 없는 파일은 타임아웃을 걸어 네트워크 요청 (가짜 와이파이 방어)
                return fetchWithTimeout(event.request, TIMEOUT_DURATION).catch(() => {
                    // 완전히 끊겼을 때 메인 화면으로 유도
                    if (event.request.mode === 'navigate') {
                        return caches.match('./index.html');
                    }
                    return new Response('오프라인 상태입니다.', { status: 503 });
                });
            })
    );
});
