const CACHE_NAME = 'logbook-cache-v2';
const ASSETS_TO_CACHE = [
    './',
    './index.html',
    './manifest.json',
    './icon-192.png',
    './icon-512.png'
];

// 1. 설치 시점에 파일들을 기기에 캐시(저장)
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(ASSETS_TO_CACHE))
    );
});

// 2. 가짜 와이파이/오프라인 대응 (Cache First 전략)
self.addEventListener('fetch', event => {
    // 구글 시트 동기화(fetch) 요청은 캐시하지 않고 무조건 네트워크로 보냄
    if (event.request.url.includes('script.google.com')) {
        return; 
    }

    event.respondWith(
        caches.match(event.request)
            .then(cachedResponse => {
                // 기기에 저장된 캐시(HTML 파일 등)가 있으면 네트워크를 확인하지 않고 즉시 반환
                // 이 로직 덕분에 가짜 와이파이에서도 무한 로딩 없이 1초 만에 앱이 켜집니다.
                if (cachedResponse) {
                    return cachedResponse;
                }
                // 캐시에 없으면 그때 통신 시도
                return fetch(event.request);
            })
    );
});