const CACHE_NAME = 'logbook-cache-v4'; // 👈 v3로 올려서 기존 스마트폰에 남아있는 고장난 캐시를 강제로 박살냅니다.
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];
const TIMEOUT_DURATION = 3000; // 3초 타임아웃 (구글 통신 제외, 일반 화면 파일용)

// ⏱️ 일반 파일(HTML 등)에 적용할 타임아웃 fetch 함수 (가짜 와이파이 방어용)
const fetchWithTimeout = async (request, timeout) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(request, { signal: controller.signal });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    throw error; 
  }
};

// 1. 앱 설치 시 파일들을 기기에 저장
self.addEventListener('install', event => {
  self.skipWaiting(); // 새 버전 설치 시 즉시 대기상태 해제
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS_TO_CACHE))
  );
});

// 2. 앱 업데이트 시 구버전(v1, v2) 찌꺼기 완벽 삭제
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

// 3. 통신 가로채기 (구글 시트 예외 처리 + Cache First)
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // 🚨 구글 시트 통신(리다이렉트 포함) 및 POST 요청은 서비스 워커가 건드리지 않고 완전히 통과!
  // 브라우저가 알아서 통신이 끝날 때까지 기다리게 됩니다.
  if (url.hostname.includes('script.google.com') || 
      url.hostname.includes('googleusercontent.com') || 
      event.request.method !== 'GET') {
    return; 
  }

  // 🛡️ 일반 화면/파일 요청: 철저한 캐시 우선 (Cache-First) + 동적 캐싱
  event.respondWith(
    (async () => {
      // ① 기기에 저장된 캐시가 있으면 즉시 반환 (0.1초 로딩)
      const cachedResponse = await caches.match(event.request);
      if (cachedResponse) {
        return cachedResponse;
      }
      
      // ② 캐시에 없는 파일은 타임아웃을 걸어 네트워크 요청 (가짜 와이파이 방어)
      try {
        const networkResponse = await fetchWithTimeout(event.request, TIMEOUT_DURATION);
        
        // 💡 핵심: 통신에 성공한 정상 파일(200 OK)만 오프라인용으로 캐시에 동적 저장 (캐시 오염 방지)
        if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
          const cache = await caches.open(CACHE_NAME);
          cache.put(event.request, networkResponse.clone());
        }

        return networkResponse;
      } catch (error) {
        // ③ 완전히 끊겼거나 가짜 와이파이에 갇혔을 때 메인 화면으로 유도
        if (event.request.mode === 'navigate') {
          return await caches.match('./index.html');
        }
        
        return new Response('오프라인 상태이거나 자원을 찾을 수 없습니다.', {
          status: 503,
          statusText: 'Service Unavailable'
        });
      }
    })()
  );
});
