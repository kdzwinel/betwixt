/*
 * Copyright (C) 2008 Apple Inc. All Rights Reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions
 * are met:
 * 1. Redistributions of source code must retain the above copyright
 *    notice, this list of conditions and the following disclaimer.
 * 2. Redistributions in binary form must reproduce the above copyright
 *    notice, this list of conditions and the following disclaimer in the
 *    documentation and/or other materials provided with the distribution.
 *
 * THIS SOFTWARE IS PROVIDED BY APPLE INC. ``AS IS'' AND ANY
 * EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
 * IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR
 * PURPOSE ARE DISCLAIMED.  IN NO EVENT SHALL APPLE INC. OR
 * CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL,
 * EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO,
 * PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR
 * PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY
 * OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
 * OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */

/**
 * @implements {UI.ContextFlavorListener}
 * @implements {UI.ListDelegate<!Sources.CallStackSidebarPane.Item>}
 * @unrestricted
 */
Sources.CallStackSidebarPane = class extends UI.SimpleView {
  constructor() {
    super(Common.UIString('Call Stack'), true);
    this.registerRequiredCSS('sources/callStackSidebarPane.css');

    this._blackboxedMessageElement = this._createBlackboxedMessageElement();
    this.contentElement.appendChild(this._blackboxedMessageElement);

    this._notPausedMessageElement = this.contentElement.createChild('div', 'gray-info-message');
    this._notPausedMessageElement.textContent = Common.UIString('Not paused');

    /** @type {!UI.ListModel<!Sources.CallStackSidebarPane.Item>} */
    this._items = new UI.ListModel();
    /** @type {!UI.ListControl<!Sources.CallStackSidebarPane.Item>} */
    this._list = new UI.ListControl(this._items, this, UI.ListMode.NonViewport);
    this.contentElement.appendChild(this._list.element);
    this._list.element.addEventListener('contextmenu', this._onContextMenu.bind(this), false);
    this._list.element.addEventListener('click', this._onClick.bind(this), false);

    this._showMoreMessageElement = this._createShowMoreMessageElement();
    this._showMoreMessageElement.classList.add('hidden');
    this.contentElement.appendChild(this._showMoreMessageElement);

    this._showBlackboxed = false;
    this._locationPool = new Bindings.LiveLocationPool();

    this._updateThrottler = new Common.Throttler(100);
    this._maxAsyncStackChainDepth = Sources.CallStackSidebarPane._defaultMaxAsyncStackChainDepth;
    this._update();

    this._updateItemThrottler = new Common.Throttler(100);
    this._scheduledForUpdateItems = new Set();
  }

  /**
   * @override
   * @param {?Object} object
   */
  flavorChanged(object) {
    this._showBlackboxed = false;
    this._maxAsyncStackChainDepth = Sources.CallStackSidebarPane._defaultMaxAsyncStackChainDepth;
    this._update();
  }

  _update() {
    this._updateThrottler.schedule(() => this._doUpdate());
  }

  /**
   * @return {!Promise<undefined>}
   */
  async _doUpdate() {
    this._locationPool.disposeAll();

    const details = UI.context.flavor(SDK.DebuggerPausedDetails);
    if (!details) {
      this._notPausedMessageElement.classList.remove('hidden');
      this._blackboxedMessageElement.classList.add('hidden');
      this._showMoreMessageElement.classList.add('hidden');
      this._items.replaceAll([]);
      UI.context.setFlavor(SDK.DebuggerModel.CallFrame, null);
      return;
    }

    let debuggerModel = details.debuggerModel;
    this._notPausedMessageElement.classList.add('hidden');

    const items = details.callFrames.map(frame => {
      const item = Sources.CallStackSidebarPane.Item.createForDebuggerCallFrame(
          frame, this._locationPool, this._refreshItem.bind(this));
      item[Sources.CallStackSidebarPane._debuggerCallFrameSymbol] = frame;
      return item;
    });

    let asyncStackTrace = details.asyncStackTrace;
    if (!asyncStackTrace && details.asyncStackTraceId) {
      if (details.asyncStackTraceId.debuggerId)
        debuggerModel = SDK.DebuggerModel.modelForDebuggerId(details.asyncStackTraceId.debuggerId);
      asyncStackTrace = debuggerModel ? await debuggerModel.fetchAsyncStackTrace(details.asyncStackTraceId) : null;
    }
    let peviousStackTrace = details.callFrames;
    let maxAsyncStackChainDepth = this._maxAsyncStackChainDepth;
    while (asyncStackTrace && maxAsyncStackChainDepth > 0) {
      let title = '';
      const isAwait = asyncStackTrace.description === 'async function';
      if (isAwait && peviousStackTrace.length && asyncStackTrace.callFrames.length) {
        const lastPreviousFrame = peviousStackTrace[peviousStackTrace.length - 1];
        const lastPreviousFrameName = UI.beautifyFunctionName(lastPreviousFrame.functionName);
        title = UI.asyncStackTraceLabel('await in ' + lastPreviousFrameName);
      } else {
        title = UI.asyncStackTraceLabel(asyncStackTrace.description);
      }

      items.push(...Sources.CallStackSidebarPane.Item.createItemsForAsyncStack(
          title, debuggerModel, asyncStackTrace.callFrames, this._locationPool, this._refreshItem.bind(this)));

      --maxAsyncStackChainDepth;
      peviousStackTrace = asyncStackTrace.callFrames;
      if (asyncStackTrace.parent) {
        asyncStackTrace = asyncStackTrace.parent;
      } else if (asyncStackTrace.parentId) {
        if (asyncStackTrace.parentId.debuggerId)
          debuggerModel = SDK.DebuggerModel.modelForDebuggerId(asyncStackTrace.parentId.debuggerId);
        asyncStackTrace = debuggerModel ? await debuggerModel.fetchAsyncStackTrace(asyncStackTrace.parentId) : null;
      } else {
        asyncStackTrace = null;
      }
    }
    this._showMoreMessageElement.classList.toggle('hidden', !asyncStackTrace);
    this._items.replaceAll(items);
    if (this._maxAsyncStackChainDepth === Sources.CallStackSidebarPane._defaultMaxAsyncStackChainDepth)
      this._list.selectNextItem(true /* canWrap */, false /* center */);
    this._updatedForTest();
  }

  _updatedForTest() {
  }

  /**
   * @param {!Sources.CallStackSidebarPane.Item} item
   */
  _refreshItem(item) {
    this._scheduledForUpdateItems.add(item);
    this._updateItemThrottler.schedule(innerUpdate.bind(this));

    /**
     * @this {!Sources.CallStackSidebarPane}
     * @return {!Promise<undefined>}
     */
    function innerUpdate() {
      const items = Array.from(this._scheduledForUpdateItems);
      this._scheduledForUpdateItems.clear();

      this._muteActivateItem = true;
      if (!this._showBlackboxed && this._items.every(item => item.isBlackboxed)) {
        this._showBlackboxed = true;
        for (let i = 0; i < this._items.length; ++i)
          this._list.refreshItemByIndex(i);
        this._blackboxedMessageElement.classList.toggle('hidden', true);
      } else {
        const itemsSet = new Set(items);
        let hasBlackboxed = false;
        for (let i = 0; i < this._items.length; ++i) {
          const item = this._items.at(i);
          if (itemsSet.has(item))
            this._list.refreshItemByIndex(i);
          hasBlackboxed = hasBlackboxed || item.isBlackboxed;
        }
        this._blackboxedMessageElement.classList.toggle('hidden', this._showBlackboxed || !hasBlackboxed);
      }
      delete this._muteActivateItem;
      return Promise.resolve();
    }
  }

  /**
   * @override
   * @param {!Sources.CallStackSidebarPane.Item} item
   * @return {!Element}
   */
  createElementForItem(item) {
    const element = createElementWithClass('div', 'call-frame-item');
    const title = element.createChild('div', 'call-frame-item-title');
    title.createChild('div', 'call-frame-title-text').textContent = item.title;
    if (item.isAsyncHeader) {
      element.classList.add('async-header');
    } else {
      const linkElement = element.createChild('div', 'call-frame-location');
      linkElement.textContent = item.linkText.trimMiddle(30);
      linkElement.title = item.linkText;
      element.classList.toggle('blackboxed-call-frame', item.isBlackboxed);
    }
    element.classList.toggle('hidden', !this._showBlackboxed && item.isBlackboxed);
    element.appendChild(UI.Icon.create('smallicon-thick-right-arrow', 'selected-call-frame-icon'));
    return element;
  }

  /**
   * @override
   * @param {!Sources.CallStackSidebarPane.Item} item
   * @return {number}
   */
  heightForItem(item) {
    console.assert(false);  // Should not be called.
    return 0;
  }

  /**
   * @override
   * @param {!Sources.CallStackSidebarPane.Item} item
   * @return {boolean}
   */
  isItemSelectable(item) {
    return !!item[Sources.CallStackSidebarPane._debuggerCallFrameSymbol];
  }

  /**
   * @override
   * @param {?Sources.CallStackSidebarPane.Item} from
   * @param {?Sources.CallStackSidebarPane.Item} to
   * @param {?Element} fromElement
   * @param {?Element} toElement
   */
  selectedItemChanged(from, to, fromElement, toElement) {
    if (fromElement)
      fromElement.classList.remove('selected');
    if (toElement)
      toElement.classList.add('selected');
    if (to)
      this._activateItem(to);
  }

  /**
   * @return {!Element}
   */
  _createBlackboxedMessageElement() {
    const element = createElementWithClass('div', 'blackboxed-message');
    element.createChild('span');
    const showAllLink = element.createChild('span', 'link');
    showAllLink.textContent = Common.UIString('Show blackboxed frames');
    showAllLink.addEventListener('click', () => {
      this._showBlackboxed = true;
      for (const item of this._items)
        this._refreshItem(item);
      this._blackboxedMessageElement.classList.toggle('hidden', true);
    });
    return element;
  }

  /**
   * @return {!Element}
   */
  _createShowMoreMessageElement() {
    const element = createElementWithClass('div', 'show-more-message');
    element.createChild('span');
    const showAllLink = element.createChild('span', 'link');
    showAllLink.textContent = Common.UIString('Show more');
    showAllLink.addEventListener('click', () => {
      this._maxAsyncStackChainDepth += Sources.CallStackSidebarPane._defaultMaxAsyncStackChainDepth;
      this._update();
    }, false);
    return element;
  }

  /**
   * @param {!Event} event
   */
  _onContextMenu(event) {
    const item = this._list.itemForNode(/** @type {?Node} */ (event.target));
    if (!item)
      return;
    const contextMenu = new UI.ContextMenu(event);
    const debuggerCallFrame = item[Sources.CallStackSidebarPane._debuggerCallFrameSymbol];
    if (debuggerCallFrame)
      contextMenu.defaultSection().appendItem(Common.UIString('Restart frame'), () => debuggerCallFrame.restart());
    contextMenu.defaultSection().appendItem(Common.UIString('Copy stack trace'), this._copyStackTrace.bind(this));
    if (item.uiLocation)
      this.appendBlackboxURLContextMenuItems(contextMenu, item.uiLocation.uiSourceCode);
    contextMenu.show();
  }

  /**
   * @param {!Event} event
   */
  _onClick(event) {
    const item = this._list.itemForNode(/** @type {?Node} */ (event.target));
    if (item)
      this._activateItem(item);
  }

  /**
   * @param {!Sources.CallStackSidebarPane.Item} item
   */
  _activateItem(item) {
    const uiLocation = item.uiLocation;
    if (this._muteActivateItem || !uiLocation)
      return;
    const debuggerCallFrame = item[Sources.CallStackSidebarPane._debuggerCallFrameSymbol];
    if (debuggerCallFrame && UI.context.flavor(SDK.DebuggerModel.CallFrame) !== debuggerCallFrame) {
      debuggerCallFrame.debuggerModel.setSelectedCallFrame(debuggerCallFrame);
      UI.context.setFlavor(SDK.DebuggerModel.CallFrame, debuggerCallFrame);
    } else {
      Common.Revealer.reveal(uiLocation);
    }
  }

  /**
   * @param {!UI.ContextMenu} contextMenu
   * @param {!Workspace.UISourceCode} uiSourceCode
   */
  appendBlackboxURLContextMenuItems(contextMenu, uiSourceCode) {
    const binding = Persistence.persistence.binding(uiSourceCode);
    if (binding)
      uiSourceCode = binding.network;
    if (uiSourceCode.project().type() === Workspace.projectTypes.FileSystem)
      return;
    const canBlackbox = Bindings.blackboxManager.canBlackboxUISourceCode(uiSourceCode);
    const isBlackboxed = Bindings.blackboxManager.isBlackboxedUISourceCode(uiSourceCode);
    const isContentScript = uiSourceCode.project().type() === Workspace.projectTypes.ContentScripts;

    const manager = Bindings.blackboxManager;
    if (canBlackbox) {
      if (isBlackboxed) {
        contextMenu.defaultSection().appendItem(
            Common.UIString('Stop blackboxing'), manager.unblackboxUISourceCode.bind(manager, uiSourceCode));
      } else {
        contextMenu.defaultSection().appendItem(
            Common.UIString('Blackbox script'), manager.blackboxUISourceCode.bind(manager, uiSourceCode));
      }
    }
    if (isContentScript) {
      if (isBlackboxed) {
        contextMenu.defaultSection().appendItem(
            Common.UIString('Stop blackboxing all content scripts'), manager.blackboxContentScripts.bind(manager));
      } else {
        contextMenu.defaultSection().appendItem(
            Common.UIString('Blackbox all content scripts'), manager.unblackboxContentScripts.bind(manager));
      }
    }
  }

  /**
   * @return {boolean}
   */
  _selectNextCallFrameOnStack() {
    return this._list.selectNextItem(false /* canWrap */, false /* center */);
  }

  /**
   * @return {boolean}
   */
  _selectPreviousCallFrameOnStack() {
    return this._list.selectPreviousItem(false /* canWrap */, false /* center */);
  }

  _copyStackTrace() {
    const text = [];
    for (const item of this._items) {
      let itemText = item.title;
      if (item.uiLocation)
        itemText += ' (' + item.uiLocation.linkText(true /* skipTrim */) + ')';
      text.push(itemText);
    }
    InspectorFrontendHost.copyText(text.join('\n'));
  }
};

Sources.CallStackSidebarPane._debuggerCallFrameSymbol = Symbol('debuggerCallFrame');
Sources.CallStackSidebarPane._elementSymbol = Symbol('element');
Sources.CallStackSidebarPane._defaultMaxAsyncStackChainDepth = 32;

/**
 * @implements {UI.ActionDelegate}
 */
Sources.CallStackSidebarPane.ActionDelegate = class {
  /**
   * @override
   * @param {!UI.Context} context
   * @param {string} actionId
   * @return {boolean}
   */
  handleAction(context, actionId) {
    const callStackSidebarPane = self.runtime.sharedInstance(Sources.CallStackSidebarPane);
    switch (actionId) {
      case 'debugger.next-call-frame':
        callStackSidebarPane._selectNextCallFrameOnStack();
        return true;
      case 'debugger.previous-call-frame':
        callStackSidebarPane._selectPreviousCallFrameOnStack();
        return true;
    }
    return false;
  }
};

Sources.CallStackSidebarPane.Item = class {
  /**
   * @param {!SDK.DebuggerModel.CallFrame} frame
   * @param {!Bindings.LiveLocationPool} locationPool
   * @param {function(!Sources.CallStackSidebarPane.Item)} updateDelegate
   * @return {!Sources.CallStackSidebarPane.Item}
   */
  static createForDebuggerCallFrame(frame, locationPool, updateDelegate) {
    const item = new Sources.CallStackSidebarPane.Item(UI.beautifyFunctionName(frame.functionName), updateDelegate);
    Bindings.debuggerWorkspaceBinding.createCallFrameLiveLocation(
        frame.location(), item._update.bind(item), locationPool);
    return item;
  }

  /**
   * @param {string} title
   * @param {?SDK.DebuggerModel} debuggerModel
   * @param {!Array<!Protocol.Runtime.CallFrame>} frames
   * @param {!Bindings.LiveLocationPool} locationPool
   * @param {function(!Sources.CallStackSidebarPane.Item)} updateDelegate
   * @return {!Array<!Sources.CallStackSidebarPane.Item>}
   */
  static createItemsForAsyncStack(title, debuggerModel, frames, locationPool, updateDelegate) {
    const whiteboxedItemsSymbol = Symbol('whiteboxedItems');
    const asyncHeaderItem = new Sources.CallStackSidebarPane.Item(title, updateDelegate);
    asyncHeaderItem[whiteboxedItemsSymbol] = new Set();
    asyncHeaderItem.isAsyncHeader = true;

    const asyncFrameItems = frames.map(frame => {
      const item = new Sources.CallStackSidebarPane.Item(UI.beautifyFunctionName(frame.functionName), update);
      const rawLocation = debuggerModel ?
          debuggerModel.createRawLocationByScriptId(frame.scriptId, frame.lineNumber, frame.columnNumber) :
          null;
      if (!rawLocation) {
        item.linkText = (frame.url || '<unknown>') + ':' + (frame.lineNumber + 1);
        item.updateDelegate(item);
      } else {
        Bindings.debuggerWorkspaceBinding.createCallFrameLiveLocation(
            rawLocation, item._update.bind(item), locationPool);
      }
      return item;
    });

    updateDelegate(asyncHeaderItem);
    return [asyncHeaderItem, ...asyncFrameItems];

    /**
     * @param {!Sources.CallStackSidebarPane.Item} item
     */
    function update(item) {
      updateDelegate(item);
      let shouldUpdate = false;
      const items = asyncHeaderItem[whiteboxedItemsSymbol];
      if (item.isBlackboxed) {
        items.delete(item);
        shouldUpdate = items.size === 0;
      } else {
        shouldUpdate = items.size === 0;
        items.add(item);
      }
      asyncHeaderItem.isBlackboxed = asyncHeaderItem[whiteboxedItemsSymbol].size === 0;
      if (shouldUpdate)
        updateDelegate(asyncHeaderItem);
    }
  }

  /**
   * @param {string} title
   * @param {function(!Sources.CallStackSidebarPane.Item)} updateDelegate
   */
  constructor(title, updateDelegate) {
    this.isBlackboxed = false;
    this.title = title;
    this.linkText = '';
    this.uiLocation = null;
    this.isAsyncHeader = false;
    this.updateDelegate = updateDelegate;
  }

  /**
   * @param {!Bindings.LiveLocation} liveLocation
   */
  _update(liveLocation) {
    const uiLocation = liveLocation.uiLocation();
    this.isBlackboxed = uiLocation ? Bindings.blackboxManager.isBlackboxedUISourceCode(uiLocation.uiSourceCode) : false;
    this.linkText = uiLocation ? uiLocation.linkText() : '';
    this.uiLocation = uiLocation;
    this.updateDelegate(this);
  }
};
