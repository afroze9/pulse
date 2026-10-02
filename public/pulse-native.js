// Pulse RPC over MAUI HybridWebView raw messages. Payloads never enter a URL.
(() => {
  const pending = new Map();
  const receive = message => {
    let reply;
    try { reply = typeof message === 'string' ? JSON.parse(message) : message; } catch { return; }
    if (reply?.channel === 'pulse-ui') { window.dispatchEvent(new CustomEvent('pulse-native', {detail:reply})); return; }
    if (!reply || reply.channel !== 'pulse') return;
    const request = pending.get(reply.id);
    if (!request) return;
    pending.delete(reply.id);
    reply.error ? request.reject(new Error('Desktop operation failed.')) : request.resolve(reply.result);
  };
  if (window.chrome?.webview) window.chrome.webview.addEventListener('message', event => receive(event.data));
  else if (window.webkit?.messageHandlers?.webwindowinterop) window.external = { receiveMessage: receive };
  else window.addEventListener('message', event => receive(event.data));
  window.HybridWebView = {
    SendEvent(type, payload = null) {
      const message = '__RawMessage|' + JSON.stringify({channel:'pulse-ui',type,payload});
      if (window.chrome?.webview) window.chrome.webview.postMessage(message);
      else if (window.webkit?.messageHandlers?.webwindowinterop) window.webkit.messageHandlers.webwindowinterop.postMessage(message);
      else if (window.hybridWebViewHost) window.hybridWebViewHost.sendMessage(message);
    },
    InvokeDotNet(method, args) {
      if (method !== 'Dispatch' || args?.length !== 1 || typeof args[0] !== 'string') return Promise.reject(new Error('Unknown desktop operation.'));
      return new Promise((resolve, reject) => {
        const id = crypto.randomUUID();
        pending.set(id, { resolve, reject });
        const message = '__RawMessage|' + JSON.stringify({channel:'pulse', id, request:args[0]});
        try {
          if (window.chrome?.webview) window.chrome.webview.postMessage(message);
          else if (window.webkit?.messageHandlers?.webwindowinterop) window.webkit.messageHandlers.webwindowinterop.postMessage(message);
          else if (window.hybridWebViewHost) window.hybridWebViewHost.sendMessage(message);
          else throw new Error('Native host unavailable.');
        } catch (error) { pending.delete(id); reject(error); }
      });
    }
  };
})();
