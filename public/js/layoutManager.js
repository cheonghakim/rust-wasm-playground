export class LayoutManager {
  static DEFAULT_STATE = {
    itemA: {
      id: "itemA",
      content: `
          <div class="panel">
            <header class="grid-item-header">
              <div class="widget-title">WASM Playground(<span class="muted" id="status">Idle</span>) </div>

              <div class="d-flex align-items-center">
                <input
                id="libUrl"
                type="text"
                placeholder="e.g. https://cdn.jsdelivr.net/npm/lodash-es@4/lodash.min.js"
                />
                <button class="btn" id="addLib">Add</button>
              </div>

              <div class="d-flex align-items-center">
                <button class="btn text-btn" id="fontMinus" title="Decrease font size">A-</button>
                <button class="btn text-btn" id="fontPlus" title="Increase font size">A+</button>
                <button class="btn text-btn" id="wrapToggle" title="Toggle line wrapping">Wrap</button>
                <button class="btn mini info" id="formatting" title="Format code (all open files)">
                  <img src="/icons/tool.svg" alt="format_button" />
                </button>
                <button class="btn mini" id="runBtn" title="Run (Ctrl/Cmd+Enter)">
                  <img src="/icons/play.svg" alt="play_button" />
                </button>
                <button class="btn mini" id="resetBtn" title="Reset to starter project">
                  <img src="/icons/trash.svg" alt="reset_button" />
                </button>
              </div>
            </header>
          
            <div class="editor grid-item-body" id="editorContainer">
              <div class="file-tab-bar" id="fileTabBar"></div>
              <div class="editor-pane" id="editorPane"></div>
            </div>
          </div>
  `,
      x: 0,
      y: 0,
      w: 12,
      h: 11,
      minH: 3,
      minW: 3,
    },
    itemD: {
      id: "itemD",
      content: `  
          <div class="panel preview">
            <header class="grid-item-header"> 
              <div class="widget-title">Preview (sandboxed)</div>
            </header>
            <iframe
              class="grid-item-body"
              id="frame"
              sandbox="allow-scripts allow-modals allow-forms"
            ></iframe>
            <div class="console" id="console"></div>
          </div>`,
      x: 13,
      y: 0,
      w: 12,
      h: 11,
      minH: 3,
      minW: 3,
    },
  };

  constructor() {
    this.config = {
      float: false,
      margin: 2,
      column: 24,
      handle: ".grid-item-header",
      draggable: {
        handle: ".grid-item-header",
        cancel: ".grid-item-body",
      },
    };
    this.gridManager = GridStack.init(this.config);
    this.state = LayoutManager.DEFAULT_STATE;
  }

  addAjaxItemToGrid(state, useCompact = false) {
    const existing = document.querySelector(
      `.grid-stack-item[gs-id="${state.id}"]`,
    );
    if (existing) return;

    const wrapper = document.createElement("div");
    wrapper.className = "grid-stack-item";
    wrapper.setAttribute("gs-id", state.id);

    const content = document.createElement("div");
    content.className = "grid-stack-item-content";
    const mountEle = document.createElement("div");
    mountEle.style.cssText = "height:100%; width:100%;";

    mountEle.innerHTML = state.content;
    content.appendChild(mountEle);
    wrapper.appendChild(content);

    this.gridManager.el.appendChild(wrapper);

    this.gridManager.makeWidget(wrapper, {
      w: state.w || 4,
      h: state.h || 2,
      x: state.x || 0,
      y: state.y || 0,
      minW: state.minW || 2,
      minH: state.minH || 2,
      id: state.id,
    });

    // if (useCompact) this.gridManager.compact();
  }

  init() {
    const contentArea = document.querySelector(".grid-stack");
    if (contentArea) {
      const scrollWidth = this.getScrollbarWidth();
      contentArea.setAttribute("style", `width: calc(100% - ${scrollWidth}px)`);
    }

    Object.values(this.state).forEach((item) => {
      this.addAjaxItemToGrid(item);
    });

    this.bindEvents();
  }

  bindEvents() {
    this.gridManager.on("resizestop", () => {
      this.gridManager.compact();
    });

    this.gridManager.on("change", () => {
      this.gridManager.compact();
    });
  }

  getScrollbarWidth() {
    const outer = document.createElement("div");
    outer.style.visibility = "hidden";
    outer.style.overflow = "scroll";
    outer.style.msOverflowStyle = "scrollbar"; // IE 지원 일부
    outer.style.width = "100px";
    outer.style.height = "100px";
    document.body.appendChild(outer);

    const inner = document.createElement("div");
    inner.style.width = "100%";
    inner.style.height = "100%";
    outer.appendChild(inner);

    const scrollbarWidth = outer.offsetWidth - inner.clientWidth;

    document.body.removeChild(outer);

    return scrollbarWidth;
  }
}
