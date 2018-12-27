/*
 * Copyright (C) 2011 Google Inc. All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are
 * met:
 *
 *     * Redistributions of source code must retain the above copyright
 * notice, this list of conditions and the following disclaimer.
 *     * Redistributions in binary form must reproduce the above
 * copyright notice, this list of conditions and the following disclaimer
 * in the documentation and/or other materials provided with the
 * distribution.
 *     * Neither the name of Google Inc. nor the names of its
 * contributors may be used to endorse or promote products derived from
 * this software without specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS
 * "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT
 * LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR
 * A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT
 * OWNER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL,
 * SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT
 * LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE,
 * DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY
 * THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
 * OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */

/**
 * @implements {UI.ContextFlavorListener}
 */
BrowserDebugger.DOMBreakpointsSidebarPane = class extends UI.VBox {
  constructor() {
    super(true);
    this.registerRequiredCSS('browser_debugger/domBreakpointsSidebarPane.css');

    this._listElement = this.contentElement.createChild('div', 'breakpoint-list hidden');
    this._emptyElement = this.contentElement.createChild('div', 'gray-info-message');
    this._emptyElement.textContent = Common.UIString('No breakpoints');

    /** @type {!Map<!SDK.DOMDebuggerModel.DOMBreakpoint, !BrowserDebugger.DOMBreakpointsSidebarPane.Item>} */
    this._items = new Map();
    SDK.targetManager.addModelListener(
        SDK.DOMDebuggerModel, SDK.DOMDebuggerModel.Events.DOMBreakpointAdded, this._breakpointAdded, this);
    SDK.targetManager.addModelListener(
        SDK.DOMDebuggerModel, SDK.DOMDebuggerModel.Events.DOMBreakpointToggled, this._breakpointToggled, this);
    SDK.targetManager.addModelListener(
        SDK.DOMDebuggerModel, SDK.DOMDebuggerModel.Events.DOMBreakpointsRemoved, this._breakpointsRemoved, this);

    for (const domDebuggerModel of SDK.targetManager.models(SDK.DOMDebuggerModel)) {
      domDebuggerModel.retrieveDOMBreakpoints();
      for (const breakpoint of domDebuggerModel.domBreakpoints())
        this._addBreakpoint(breakpoint);
    }

    this._highlightedElement = null;
    this._update();
  }

  /**
   * @param {!Common.Event} event
   */
  _breakpointAdded(event) {
    this._addBreakpoint(/** @type {!SDK.DOMDebuggerModel.DOMBreakpoint} */ (event.data));
  }

  /**
   * @param {!Common.Event} event
   */
  _breakpointToggled(event) {
    const breakpoint = /** @type {!SDK.DOMDebuggerModel.DOMBreakpoint} */ (event.data);
    const item = this._items.get(breakpoint);
    if (item)
      item.checkbox.checked = breakpoint.enabled;
  }

  /**
   * @param {!Common.Event} event
   */
  _breakpointsRemoved(event) {
    const breakpoints = /** @type {!Array<!SDK.DOMDebuggerModel.DOMBreakpoint>} */ (event.data);
    for (const breakpoint of breakpoints) {
      const item = this._items.get(breakpoint);
      if (item) {
        this._items.delete(breakpoint);
        this._listElement.removeChild(item.element);
      }
    }
    if (!this._listElement.firstChild) {
      this._emptyElement.classList.remove('hidden');
      this._listElement.classList.add('hidden');
    }
  }

  /**
   * @param {!SDK.DOMDebuggerModel.DOMBreakpoint} breakpoint
   */
  _addBreakpoint(breakpoint) {
    const element = createElementWithClass('div', 'breakpoint-entry');
    element.addEventListener('contextmenu', this._contextMenu.bind(this, breakpoint), true);

    const checkboxLabel = UI.CheckboxLabel.create('', breakpoint.enabled);
    const checkboxElement = checkboxLabel.checkboxElement;
    checkboxElement.addEventListener('click', this._checkboxClicked.bind(this, breakpoint), false);
    element.appendChild(checkboxLabel);

    const labelElement = createElementWithClass('div', 'dom-breakpoint');
    element.appendChild(labelElement);

    const linkifiedNode = createElementWithClass('monospace');
    linkifiedNode.style.display = 'block';
    labelElement.appendChild(linkifiedNode);
    Common.Linkifier.linkify(breakpoint.node).then(linkified => linkifiedNode.appendChild(linkified));

    const description = createElement('div');
    description.textContent = BrowserDebugger.DOMBreakpointsSidebarPane.BreakpointTypeLabels.get(breakpoint.type);
    labelElement.appendChild(description);

    const item = {breakpoint: breakpoint, element: element, checkbox: checkboxElement};
    element._item = item;
    this._items.set(breakpoint, item);

    let currentElement = this._listElement.firstChild;
    while (currentElement) {
      if (currentElement._item && currentElement._item.breakpoint.type < breakpoint.type)
        break;
      currentElement = currentElement.nextSibling;
    }
    this._listElement.insertBefore(element, currentElement);
    this._emptyElement.classList.add('hidden');
    this._listElement.classList.remove('hidden');
  }

  /**
   * @param {!SDK.DOMDebuggerModel.DOMBreakpoint} breakpoint
   * @param {!Event} event
   */
  _contextMenu(breakpoint, event) {
    const contextMenu = new UI.ContextMenu(event);
    contextMenu.defaultSection().appendItem(Common.UIString('Remove breakpoint'), () => {
      breakpoint.domDebuggerModel.removeDOMBreakpoint(breakpoint.node, breakpoint.type);
    });
    contextMenu.defaultSection().appendItem(Common.UIString('Remove all DOM breakpoints'), () => {
      breakpoint.domDebuggerModel.removeAllDOMBreakpoints();
    });
    contextMenu.show();
  }

  /**
   * @param {!SDK.DOMDebuggerModel.DOMBreakpoint} breakpoint
   */
  _checkboxClicked(breakpoint) {
    const item = this._items.get(breakpoint);
    if (!item)
      return;
    breakpoint.domDebuggerModel.toggleDOMBreakpoint(breakpoint, item.checkbox.checked);
  }

  /**
   * @override
   * @param {?Object} object
   */
  flavorChanged(object) {
    this._update();
  }

  _update() {
    const details = UI.context.flavor(SDK.DebuggerPausedDetails);
    if (!details || !details.auxData || details.reason !== SDK.DebuggerModel.BreakReason.DOM) {
      if (this._highlightedElement) {
        this._highlightedElement.classList.remove('breakpoint-hit');
        delete this._highlightedElement;
      }
      return;
    }
    const domDebuggerModel = details.debuggerModel.target().model(SDK.DOMDebuggerModel);
    if (!domDebuggerModel)
      return;
    const data = domDebuggerModel.resolveDOMBreakpointData(/** @type {!Object} */ (details.auxData));
    if (!data)
      return;

    let element = null;
    for (const item of this._items.values()) {
      if (item.breakpoint.node === data.node && item.breakpoint.type === data.type)
        element = item.element;
    }
    if (!element)
      return;
    UI.viewManager.showView('sources.domBreakpoints');
    element.classList.add('breakpoint-hit');
    this._highlightedElement = element;
  }
};

/** @typedef {!{element: !Element, checkbox: !Element, breakpoint: !SDK.DOMDebuggerModel.DOMBreakpoint}} */
BrowserDebugger.DOMBreakpointsSidebarPane.Item;

BrowserDebugger.DOMBreakpointsSidebarPane.BreakpointTypeLabels = new Map([
  [SDK.DOMDebuggerModel.DOMBreakpoint.Type.SubtreeModified, Common.UIString('Subtree modified')],
  [SDK.DOMDebuggerModel.DOMBreakpoint.Type.AttributeModified, Common.UIString('Attribute modified')],
  [SDK.DOMDebuggerModel.DOMBreakpoint.Type.NodeRemoved, Common.UIString('Node removed')],
]);

/**
 * @implements {UI.ContextMenu.Provider}
 */
BrowserDebugger.DOMBreakpointsSidebarPane.ContextMenuProvider = class {
  /**
   * @override
   * @param {!Event} event
   * @param {!UI.ContextMenu} contextMenu
   * @param {!Object} object
   */
  appendApplicableItems(event, contextMenu, object) {
    const node = /** @type {!SDK.DOMNode} */ (object);
    if (node.pseudoType())
      return;
    const domDebuggerModel = node.domModel().target().model(SDK.DOMDebuggerModel);
    if (!domDebuggerModel)
      return;

    /**
     * @param {!SDK.DOMDebuggerModel.DOMBreakpoint.Type} type
     */
    function toggleBreakpoint(type) {
      if (domDebuggerModel.hasDOMBreakpoint(node, type))
        domDebuggerModel.removeDOMBreakpoint(node, type);
      else
        domDebuggerModel.setDOMBreakpoint(node, type);
    }

    const breakpointsMenu = contextMenu.debugSection().appendSubMenuItem(Common.UIString('Break on'));
    for (const key in SDK.DOMDebuggerModel.DOMBreakpoint.Type) {
      const type = SDK.DOMDebuggerModel.DOMBreakpoint.Type[key];
      const label = Sources.DebuggerPausedMessage.BreakpointTypeNouns.get(type);
      breakpointsMenu.defaultSection().appendCheckboxItem(
          label, toggleBreakpoint.bind(null, type), domDebuggerModel.hasDOMBreakpoint(node, type));
    }
  }
};
