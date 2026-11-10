const { contextBridge, ipcRenderer } = require("electron");

const invoke = (ch, ...a) => ipcRenderer.invoke(ch, ...a);
const on = (ch) => (cb) => {
  const fn = (_e, data) => cb(data);
  ipcRenderer.on(ch, fn);
  return () => ipcRenderer.removeListener(ch, fn);
};

contextBridge.exposeInMainWorld("nugul", {
  info: () => invoke("app:info"),
  minimize: () => ipcRenderer.send("win:minimize"),
  close: () => ipcRenderer.send("win:close"),
  openExternal: (url) => invoke("open:external", url),
  openFolder: (which) => invoke("open:folder", which),
  systemMemory: () => invoke("system:memory"),

  settings: {
    get: () => invoke("settings:get"),
    set: (partial) => invoke("settings:set", partial),
  },

  auth: {
    init: () => invoke("auth:init"),
    login: () => invoke("auth:login"),
    logout: () => invoke("auth:logout"),
  },

  server: { status: () => invoke("server:status") },

  launch: {
    start: () => invoke("launch:start"),
    stop: () => invoke("launch:stop"),
    status: () => invoke("launch:status"),
    onProgress: on("launch:progress"),
    onStarted: on("launch:started"),
    onClosed: on("launch:closed"),
  },

  installed: {
    list: (kind) => invoke("installed:list", kind),
    toggle: (kind, fileName) => invoke("installed:toggle", kind, fileName),
    remove: (kind, fileName) => invoke("installed:remove", kind, fileName),
    addFiles: (kind) => invoke("installed:add-files", kind),
  },

  apply: {
    state: () => invoke("apply:state"),
    resourcepack: (fileName, on) => invoke("apply:resourcepack", fileName, on),
    shader: (fileName) => invoke("apply:shader", fileName),
  },

  neogulMods: {
    list: () => invoke("neogul:list"),
    install: (id) => invoke("neogul:install", id),
    remove: (id) => invoke("neogul:remove", id),
    installResourcePack: () => invoke("neogul:install-resourcepack"),
    installAll: () => invoke("neogul:install-all"),
  },

  modrinth: {
    search: (params) => invoke("modrinth:search", params),
    project: (id) => invoke("modrinth:project", id),
    install: (params) => invoke("modrinth:install", params),
  },
  onDownloadProgress: on("dl:progress"),

  cosmetics: {
    state: () => invoke("cosmetics:state"),
    pull: () => invoke("cosmetics:pull"),
    equip: (kind, id) => invoke("cosmetics:equip", kind, id),
    importNova: () => invoke("cosmetics:import-nova"),
  },

  update: {
    state: () => invoke("update:state"),
    check: () => invoke("update:check"),
    install: () => invoke("update:install"),
    onState: on("update:state"),
    onInstalling: on("update:installing"),
  },

  calc: {
    get: () => invoke("calc:get"),
    refresh: () => invoke("calc:refresh"),
    copy: (text) => invoke("calc:copy", text),
    saveFile: (name, text) => invoke("calc:save-file", name, text),
    openFile: () => invoke("calc:open-file"),
    onData: on("calc:data"),
  },
  kb: { get: (force) => invoke("kb:get", force) },

  rank: {
    get: () => invoke("rank:get"),
    refresh: () => invoke("rank:refresh"),
    onData: on("rank:data"),
  },
  images: {
    get: () => invoke("images:get"),
    onUpdated: on("images:updated"),
  },
  onNeogulUpdated: on("neogul:updated"),
  onToast: on("toast"),
  picks: {
    get: () => invoke("picks:get"),
    installAll: (kind) => invoke("picks:install-all", kind),
    onProgress: on("picks:progress"),
  },

  skin: {
    current: () => invoke("skin:current"),
    pick: () => invoke("skin:pick"),
    upload: (params) => invoke("skin:upload", params),
    recent: () => invoke("skin:recent"),
  },
});
