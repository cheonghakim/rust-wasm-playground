export class FileManager {
  static STORAGE_KEY = "mini-playground-v2";

  static EXTENSION_MAP = {
    ".html": { mode: "htmlmixed", icon: "HTML", prettierParser: "html" },
    ".htm": { mode: "htmlmixed", icon: "HTML", prettierParser: "html" },
    ".css": { mode: "css", icon: "CSS", prettierParser: "css" },
    ".js": { mode: "javascript", icon: "JS", prettierParser: "babel" },
    ".mjs": { mode: "javascript", icon: "JS", prettierParser: "babel" },
    ".json": {
      mode: { name: "javascript", json: true },
      icon: "{ }",
      prettierParser: null,
    },
    ".rs": { mode: "rust", icon: "RS", prettierParser: null },
    ".md": { mode: "markdown", icon: "MD", prettierParser: null },
    ".xml": { mode: "xml", icon: "XML", prettierParser: null },
    ".svg": { mode: "xml", icon: "SVG", prettierParser: null },
    ".txt": { mode: null, icon: "TXT", prettierParser: null },
  };

  constructor(containerEl) {
    this.containerEl = containerEl;
    this.editors = new Map();
    this.editorWrappers = new Map();
    this.onChange = null;
    this.state = this.loadState();
    this.render();
  }

  generateId() {
    return "f_" + Date.now() + "_" + Math.random().toString(36).slice(2, 5);
  }

  getExtension(filename) {
    const dot = filename.lastIndexOf(".");
    return dot >= 0 ? filename.slice(dot).toLowerCase() : "";
  }

  getModeForFile(filename) {
    const ext = this.getExtension(filename);
    return FileManager.EXTENSION_MAP[ext]?.mode ?? null;
  }

  getMetaForFile(filename) {
    const ext = this.getExtension(filename);
    return (
      FileManager.EXTENSION_MAP[ext] ?? {
        mode: null,
        icon: "?",
        prettierParser: null,
      }
    );
  }

  loadState() {
    try {
      const raw = localStorage.getItem(FileManager.STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.version === 2) return parsed;
      }
    } catch {}
    return null;
  }

  saveState() {
    this.syncAllEditors();
    try {
      localStorage.setItem(FileManager.STORAGE_KEY, JSON.stringify(this.state));
    } catch {
      console.warn("localStorage is full or blocked.");
    }
  }

  initWithDefaults(defaultFiles) {
    const files = defaultFiles.map((f) => ({
      id: this.generateId(),
      name: f.name,
      content: f.content || "",
    }));
    this.state = {
      version: 2,
      files,
      libs: [],
      activeFileId: files[0]?.id || null,
      openFileIds: files.map((f) => f.id),
      settings: { lineWrapping: false, fontSize: 14, tabSize: 2 },
    };
    this.saveState();
    this.render();
  }

  resetToDefaults(defaultFiles) {
    // 에디터 전부 정리
    for (const [id] of this.editors) {
      this.destroyEditor(id);
    }
    this.initWithDefaults(defaultFiles);
  }

  getFile(fileId) {
    return this.state.files.find((f) => f.id === fileId) || null;
  }

  getFileByName(name) {
    return this.state.files.find((f) => f.name === name) || null;
  }

  getFilesByExtension(ext) {
    return this.state.files.filter((f) => this.getExtension(f.name) === ext);
  }

  createFile(name, content = "") {
    if (!name || !name.includes(".")) return null;
    if (this.getFileByName(name)) return null;

    const file = { id: this.generateId(), name, content };
    this.state.files.push(file);
    this.state.openFileIds.push(file.id);
    this.state.activeFileId = file.id;
    this.saveState();
    this.renderTabBar();
    this.switchToFile(file.id);
    return file;
  }

  renameFile(fileId, newName) {
    if (!newName || !newName.includes(".")) return false;
    const file = this.getFile(fileId);
    if (!file) return false;
    const existing = this.getFileByName(newName);
    if (existing && existing.id !== fileId) return false;

    const oldExt = this.getExtension(file.name);
    const newExt = this.getExtension(newName);
    file.name = newName;

    // 확장자 변경 시 에디터 모드 업데이트
    if (oldExt !== newExt && this.editors.has(fileId)) {
      const cm = this.editors.get(fileId);
      const mode = this.getModeForFile(newName);
      cm.setOption("mode", mode);
    }

    this.saveState();
    this.renderTabBar();
    return true;
  }

  deleteFile(fileId) {
    const idx = this.state.files.findIndex((f) => f.id === fileId);
    if (idx < 0) return;

    this.state.files.splice(idx, 1);
    this.state.openFileIds = this.state.openFileIds.filter(
      (id) => id !== fileId,
    );
    this.destroyEditor(fileId);

    // 활성 탭이었으면 인접 탭으로 전환
    if (this.state.activeFileId === fileId) {
      this.state.activeFileId =
        this.state.openFileIds[
          Math.min(idx, this.state.openFileIds.length - 1)
        ] || null;
    }

    // 파일이 없으면 기본 파일 생성
    if (this.state.files.length === 0) {
      const f = {
        id: this.generateId(),
        name: "index.html",
        content: "",
      };
      this.state.files.push(f);
      this.state.openFileIds.push(f.id);
      this.state.activeFileId = f.id;
    }

    this.saveState();
    this.renderTabBar();
    if (this.state.activeFileId) {
      this.switchToFile(this.state.activeFileId);
    }
  }

  openFile(fileId) {
    if (!this.state.openFileIds.includes(fileId)) {
      this.state.openFileIds.push(fileId);
    }
    this.switchToFile(fileId);
  }

  closeTab(fileId) {
    const openIdx = this.state.openFileIds.indexOf(fileId);
    if (openIdx < 0) return;

    // 에디터 내용 동기화 후 파괴
    if (this.editors.has(fileId)) {
      const file = this.getFile(fileId);
      if (file) file.content = this.editors.get(fileId).getValue();
      this.destroyEditor(fileId);
    }

    this.state.openFileIds.splice(openIdx, 1);

    if (this.state.activeFileId === fileId) {
      const newIdx = Math.min(openIdx, this.state.openFileIds.length - 1);
      this.state.activeFileId = this.state.openFileIds[newIdx] || null;
    }

    this.saveState();
    this.renderTabBar();
    if (this.state.activeFileId) {
      this.switchToFile(this.state.activeFileId);
    }
  }

  switchToFile(fileId) {
    if (!this.state.openFileIds.includes(fileId)) {
      this.state.openFileIds.push(fileId);
    }
    this.state.activeFileId = fileId;

    // 모든 에디터 래퍼 숨기기
    for (const [id, wrapper] of this.editorWrappers) {
      wrapper.classList.toggle("active", id === fileId);
    }

    // 활성 에디터 지연 생성
    this.getOrCreateEditor(fileId);

    // 탭 바 활성 상태 업데이트
    this.updateTabBarActiveState();
    this.saveState();
  }

  getOrCreateEditor(fileId) {
    if (this.editors.has(fileId)) {
      const cm = this.editors.get(fileId);
      setTimeout(() => cm.refresh(), 0);
      return cm;
    }

    const file = this.getFile(fileId);
    if (!file) return null;

    // wrapper div 생성
    const wrapper = document.createElement("div");
    wrapper.className = "editor-instance active";
    wrapper.dataset.fileId = fileId;

    const textarea = document.createElement("textarea");
    textarea.spellcheck = false;
    wrapper.appendChild(textarea);

    const pane = this.containerEl.querySelector("#editorPane");
    if (!pane) return null;
    pane.appendChild(wrapper);

    // 다른 에디터 비활성
    for (const [id, w] of this.editorWrappers) {
      w.classList.toggle("active", id === fileId);
    }
    this.editorWrappers.set(fileId, wrapper);

    const mode = this.getModeForFile(file.name);
    const ext = this.getExtension(file.name);
    const isHTML = ext === ".html" || ext === ".htm";
    const settings = this.state.settings || {};

    const cm = CodeMirror.fromTextArea(textarea, {
      lineNumbers: true,
      mode: mode,
      tabSize: settings.tabSize || 2,
      indentWithTabs: false,
      autoCloseBrackets: true,
      autoCloseTags: isHTML,
      matchBrackets: true,
      styleActiveLine: true,
      lineWrapping: settings.lineWrapping || false,
      foldGutter: true,
      gutters: ["CodeMirror-linenumbers", "CodeMirror-foldgutter"],
      extraKeys: {
        "Ctrl-Space": "autocomplete",
        "Ctrl-F": "findPersistent",
        "Ctrl-H": "replace",
        "Ctrl-G": "jumpToLine",
      },
    });

    cm.setValue(file.content || "");
    cm.on("changes", () => {
      if (this.onChange) this.onChange();
    });

    if (settings.fontSize) {
      cm.getWrapperElement().style.fontSize = settings.fontSize + "px";
    }

    this.editors.set(fileId, cm);
    setTimeout(() => cm.refresh(), 0);
    return cm;
  }

  destroyEditor(fileId) {
    if (this.editors.has(fileId)) {
      const cm = this.editors.get(fileId);
      cm.toTextArea();
      this.editors.delete(fileId);
    }
    if (this.editorWrappers.has(fileId)) {
      this.editorWrappers.get(fileId).remove();
      this.editorWrappers.delete(fileId);
    }
  }

  refreshActiveEditor() {
    if (!this.state.activeFileId) return;
    const cm = this.editors.get(this.state.activeFileId);
    if (cm) setTimeout(() => cm.refresh(), 0);
  }

  syncAllEditors() {
    for (const [id, cm] of this.editors) {
      const file = this.getFile(id);
      if (file) file.content = cm.getValue();
    }
  }

  getAllFilesSnapshot() {
    this.syncAllEditors();
    const result = { html: [], css: [], js: [], rs: [], other: [] };
    for (const file of this.state.files) {
      const ext = this.getExtension(file.name);
      if (ext === ".html" || ext === ".htm") result.html.push(file);
      else if (ext === ".css") result.css.push(file);
      else if (ext === ".js" || ext === ".mjs") result.js.push(file);
      else if (ext === ".rs") result.rs.push(file);
      else result.other.push(file);
    }
    return result;
  }

  getActiveEditor() {
    if (!this.state.activeFileId) return null;
    return this.editors.get(this.state.activeFileId) || null;
  }

  getActiveFile() {
    return this.getFile(this.state.activeFileId);
  }

  toggleLineWrapping() {
    this.state.settings.lineWrapping = !this.state.settings.lineWrapping;
    for (const [, cm] of this.editors) {
      cm.setOption("lineWrapping", this.state.settings.lineWrapping);
    }
    this.saveState();
    return this.state.settings.lineWrapping;
  }

  changeFontSize(delta) {
    const s = this.state.settings;
    s.fontSize = Math.max(10, Math.min(24, (s.fontSize || 14) + delta));
    for (const [, cm] of this.editors) {
      cm.getWrapperElement().style.fontSize = s.fontSize + "px";
      cm.refresh();
    }
    this.saveState();
    return s.fontSize;
  }

  render() {
    if (!this.state) return;

    // 탭 바
    let tabBar = this.containerEl.querySelector("#fileTabBar");
    if (!tabBar) return;

    // 에디터 패널
    let pane = this.containerEl.querySelector("#editorPane");
    if (!pane) return;

    this.renderTabBar();
    if (this.state.activeFileId) {
      this.switchToFile(this.state.activeFileId);
    }
  }

  renderTabBar() {
    const bar = this.containerEl.querySelector("#fileTabBar");
    if (!bar) return;
    bar.innerHTML = "";

    for (const fileId of this.state.openFileIds) {
      const file = this.getFile(fileId);
      if (!file) continue;

      const ext = this.getExtension(file.name);
      const meta = this.getMetaForFile(file.name);
      const isActive = fileId === this.state.activeFileId;

      const tab = document.createElement("div");
      tab.className = "file-tab" + (isActive ? " active" : "");
      tab.dataset.fileId = fileId;

      // 아이콘
      const icon = document.createElement("span");
      icon.className = "tab-icon type-" + ext.slice(1);
      icon.textContent = meta.icon;
      tab.appendChild(icon);

      // 파일명
      const label = document.createElement("span");
      label.className = "tab-label";
      label.textContent = file.name;
      tab.appendChild(label);

      // 닫기 버튼
      const close = document.createElement("button");
      close.className = "tab-close";
      close.textContent = "\u00d7";
      close.title = "Close tab";
      close.addEventListener("click", (e) => {
        e.stopPropagation();
        this.closeTab(fileId);
      });
      tab.appendChild(close);

      // 클릭 → 전환
      tab.addEventListener("click", () => this.switchToFile(fileId));

      // 우클릭 → 컨텍스트 메뉴
      tab.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        this.showFileContextMenu(fileId, e.clientX, e.clientY);
      });

      // 더블클릭 → 인라인 이름 변경
      label.addEventListener("dblclick", (e) => {
        e.stopPropagation();
        this.showInlineRename(fileId, label);
      });

      bar.appendChild(tab);
    }

    // "+" 새 파일 버튼
    const addBtn = document.createElement("button");
    addBtn.className = "file-tab-new";
    addBtn.textContent = "+";
    addBtn.title = "New file";
    addBtn.addEventListener("click", () => this.showNewFileDialog());
    bar.appendChild(addBtn);
  }

  updateTabBarActiveState() {
    const bar = this.containerEl.querySelector("#fileTabBar");
    if (!bar) return;
    bar.querySelectorAll(".file-tab").forEach((el) => {
      el.classList.toggle(
        "active",
        el.dataset.fileId === this.state.activeFileId,
      );
    });
  }

  showNewFileDialog() {
    const bar = this.containerEl.querySelector("#fileTabBar");
    if (!bar) return;

    // 이미 입력 중이면 무시
    if (bar.querySelector(".file-name-input")) return;

    const input = document.createElement("input");
    input.className = "file-name-input";
    input.placeholder = "filename.ext";
    input.style.margin = "3px 4px";

    const addBtn = bar.querySelector(".file-tab-new");
    bar.insertBefore(input, addBtn);
    input.focus();

    let committed = false;
    const commit = () => {
      if (committed) return;
      committed = true;
      const name = input.value.trim();
      input.remove();
      if (!name) return;

      if (!name.includes(".")) {
        alert("파일명에 확장자를 포함해주세요 (예: utils.js)");
        return;
      }
      if (this.getFileByName(name)) {
        alert("같은 이름의 파일이 이미 존재합니다");
        return;
      }
      this.createFile(name);
    };

    input.addEventListener("blur", commit);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        commit();
      }
      if (e.key === "Escape") {
        committed = true;
        input.remove();
      }
    });
  }

  showInlineRename(fileId, labelEl) {
    const file = this.getFile(fileId);
    if (!file) return;

    const input = document.createElement("input");
    input.className = "file-name-input";
    input.value = file.name;

    let committed = false;
    const commit = () => {
      if (committed) return;
      committed = true;
      const newName = input.value.trim();
      if (newName && newName !== file.name) {
        if (!newName.includes(".")) {
          alert("파일명에 확장자를 포함해주세요");
          this.renderTabBar();
          return;
        }
        if (
          this.getFileByName(newName) &&
          this.getFileByName(newName).id !== fileId
        ) {
          alert("같은 이름의 파일이 이미 존재합니다");
          this.renderTabBar();
          return;
        }
        this.renameFile(fileId, newName);
      } else {
        this.renderTabBar();
      }
    };

    input.addEventListener("blur", commit);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        commit();
      }
      if (e.key === "Escape") {
        committed = true;
        this.renderTabBar();
      }
    });

    labelEl.replaceWith(input);
    input.focus();
    input.select();
  }

  showFileContextMenu(fileId, x, y) {
    document.querySelector(".context-menu")?.remove();

    const menu = document.createElement("div");
    menu.className = "context-menu";
    menu.style.left = x + "px";
    menu.style.top = y + "px";

    const items = [
      {
        label: "Rename",
        action: () => {
          const tab = this.containerEl.querySelector(
            `.file-tab[data-file-id="${fileId}"] .tab-label`,
          );
          if (tab) this.showInlineRename(fileId, tab);
        },
      },
      { label: "Close Tab", action: () => this.closeTab(fileId) },
      { separator: true },
      {
        label: "Delete File",
        danger: true,
        action: () => {
          if (
            confirm(`"${this.getFile(fileId)?.name}" 파일을 삭제하시겠습니까?`)
          ) {
            this.deleteFile(fileId);
          }
        },
      },
    ];

    for (const item of items) {
      if (item.separator) {
        const sep = document.createElement("div");
        sep.className = "context-menu-separator";
        menu.appendChild(sep);
        continue;
      }
      const btn = document.createElement("button");
      btn.className = "context-menu-item" + (item.danger ? " danger" : "");
      btn.textContent = item.label;
      btn.addEventListener("click", () => {
        menu.remove();
        item.action();
      });
      menu.appendChild(btn);
    }

    document.body.appendChild(menu);

    const dismiss = (e) => {
      if (!menu.contains(e.target)) {
        menu.remove();
        document.removeEventListener("click", dismiss, true);
      }
    };
    setTimeout(() => document.addEventListener("click", dismiss, true), 0);
  }

  destruct() {
    for (const [id] of this.editors) {
      this.destroyEditor(id);
    }
  }
}
