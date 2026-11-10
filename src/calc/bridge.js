// 런처(부모 창)와 계산기(iframe) 사이 연결 - 런처의 window.nugul.calc 을 postMessage 로 빌려 씀
(function () {
  'use strict';
  document.documentElement.classList.add('embed');
  let seq = 0;
  const waits = new Map();
  const listeners = { data: [] };
  // 런처 쪽이 아직 준비 전일 수 있어서, 연결(ack)될 때까지 요청을 모아 두고 인사를 반복
  let connected = false;
  const queue = [];
  const send = (msg) => (connected ? parent.postMessage(msg, '*') : queue.push(msg));
  const hello = setInterval(() => parent.postMessage({ ns: 'nc', ready: true }, '*'), 150);
  function call(method, ...args) {
    return new Promise((resolve, reject) => {
      const id = ++seq;
      waits.set(id, { resolve, reject });
      send({ ns: 'nc', id, method, args });
    });
  }
  window.addEventListener('message', (e) => {
    if (e.source !== parent) return;
    const m = e.data;
    if (!m || m.ns !== 'nc') return;
    if (m.push === 'ack') {
      if (!connected) { connected = true; clearInterval(hello); queue.splice(0).forEach((q) => parent.postMessage(q, '*')); }
      return;
    }
    if (m.id && waits.has(m.id)) {
      const w = waits.get(m.id); waits.delete(m.id);
      m.error ? w.reject(new Error(m.error)) : w.resolve(m.result);
    } else if (m.push === 'data') {
      listeners.data.forEach((cb) => cb(m.payload));
    } else if (m.push === 'theme') {
      const root = document.documentElement.style;
      for (const k in m.vars) root.setProperty(k, m.vars[k]);
      document.documentElement.dataset.scheme = m.scheme || 'dark';
    } else if (m.push === 'tab' && window.__ncGo) {
      window.__ncGo(m.page);
    }
  });
  window.api = {
    getData: () => call('get'),
    refresh: () => call('refresh'),
    copy: (t) => call('copy', t),
    saveFile: (n, t) => call('saveFile', n, t),
    openFile: () => call('openFile'),
    getSettings: async () => ({}),
    setSettings: async () => true,
    onData: (cb) => listeners.data.push(cb),
    win: () => {},
  };
  parent.postMessage({ ns: 'nc', ready: true }, '*');
})();
