/// <reference lib="webworker" />

// Custom Service Worker extensions for DurianCare PWA
// This file is automatically merged into the generated sw.js by @ducanh2912/next-pwa

// Cache-First strategy for AI assets (WASM, TFLite models)
// This enables OFFLINE mode by storing these large files in a dedicated cache
// after the first successful download, bypassing the main PWA precache.
(self as unknown as ServiceWorkerGlobalScope).addEventListener("fetch", (event: FetchEvent) => {
  const url = event.request.url;
  const isAIAsset = url.endsWith(".wasm") || 
                    url.endsWith(".tflite") || 
                    url.includes("/tflite/") || 
                    url.includes("huggingface.co");

  if (isAIAsset) {
    event.respondWith(
      caches.open("ai-models-cache-v1").then((cache) => {
        return cache.match(event.request).then((cachedResponse) => {
          if (cachedResponse) {
            console.log("Serving AI asset from cache:", url);
            return cachedResponse;
          }

          // Force 'cors' mode to ensure we get a cacheable response from Hugging Face
          return fetch(event.request, { mode: 'cors' }).then((networkResponse) => {
            if (networkResponse.ok) {
              cache.put(event.request, networkResponse.clone());
              console.log("Successfully cached AI asset:", url);
            }
            return networkResponse;
          }).catch((err) => {
            console.error("Offline and asset not in cache:", url);
            return new Response("Offline: AI model not yet cached.", { status: 503 });
          });
        });
      })
    );
  }
});
