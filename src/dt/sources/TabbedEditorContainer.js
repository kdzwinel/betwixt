/*
 * Copyright (C) 2011 Google Inc. All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are
 * met:
 *
 * 1. Redistributions of source code must retain the above copyright
 * notice, this list of conditions and the following disclaimer.
 *
 * 2. Redistributions in binary form must reproduce the above
 * copyright notice, this list of conditions and the following disclaimer
 * in the documentation and/or other materials provided with the
 * distribution.
 *
 * THIS SOFTWARE IS PROVIDED BY GOOGLE INC. AND ITS CONTRIBUTORS
 * "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT
 * LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR
 * A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL GOOGLE INC.
 * OR ITS CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL,
 * SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT
 * LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE,
 * DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY
 * THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
 * OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */
/**
 * @interface
 */
Sources.TabbedEditorContainerDelegate = function() {};

Sources.TabbedEditorContainerDelegate.prototype = {
  /**
   * @param {!Workspace.UISourceCode} uiSourceCode
   * @return {!UI.Widget}
   */
  viewForFile(uiSourceCode) {},

  /**
  * @param {!Sources.UISourceCodeFrame} sourceFrame
  * @param {!Workspace.UISourceCode} uiSourceCode
  */
  recycleUISourceCodeFrame(sourceFrame, uiSourceCode) {},
};

/**
 * @unrestricted
 */
Sources.TabbedEditorContainer = class extends Common.Object {
  /**
   * @param {!Sources.TabbedEditorContainerDelegate} delegate
   * @param {!Common.Setting} setting
   * @param {!Element} placeholderElement
   */
  constructor(delegate, setting, placeholderElement) {
    super();
    this._delegate = delegate;

    this._tabbedPane = new UI.TabbedPane();
    this._tabbedPane.setPlaceholderElement(placeholderElement);
    this._tabbedPane.setTabDelegate(new Sources.EditorContainerTabDelegate(this));

    this._tabbedPane.setCloseableTabs(true);
    this._tabbedPane.setAllowTabReorder(true, true);

    this._tabbedPane.addEventListener(UI.TabbedPane.Events.TabClosed, this._tabClosed, this);
    this._tabbedPane.addEventListener(UI.TabbedPane.Events.TabSelected, this._tabSelected, this);

    Persistence.persistence.addEventListener(
        Persistence.Persistence.Events.BindingCreated, this._onBindingCreated, this);
    Persistence.persistence.addEventListener(
        Persistence.Persistence.Events.BindingRemoved, this._onBindingRemoved, this);

    this._tabIds = new Map();
    this._files = {};

    this._previouslyViewedFilesSetting = setting;
    this._history = Sources.TabbedEditorContainer.History.fromObject(this._previouslyViewedFilesSetting.get());
  }

  /**
   * @param {!Common.Event} event
   */
  _onBindingCreated(event) {
    const binding = /** @type {!Persistence.PersistenceBinding} */ (event.data);
    this._updateFileTitle(binding.fileSystem);

    const networkTabId = this._tabIds.get(binding.network);
    let fileSystemTabId = this._tabIds.get(binding.fileSystem);

    const wasSelectedInNetwork = this._currentFile === binding.network;
    const currentSelectionRange = this._history.selectionRange(binding.network.url());
    const currentScrollLineNumber = this._history.scrollLineNumber(binding.network.url());
    this._history.remove(binding.network.url());

    if (!networkTabId)
      return;

    if (!fileSystemTabId) {
      const networkView = this._tabbedPane.tabView(networkTabId);
      const tabIndex = this._tabbedPane.tabIndex(networkTabId);
      if (networkView instanceof Sources.UISourceCodeFrame) {
        this._delegate.recycleUISourceCodeFrame(networkView, binding.fileSystem);
        fileSystemTabId = this._appendFileTab(binding.fileSystem, false, tabIndex, networkView);
      } else {
        fileSystemTabId = this._appendFileTab(binding.fileSystem, false, tabIndex);
        const fileSystemTabView = /** @type {!UI.Widget} */ (this._tabbedPane.tabView(fileSystemTabId));
        this._restoreEditorProperties(fileSystemTabView, currentSelectionRange, currentScrollLineNumber);
      }
    }

    this._closeTabs([networkTabId], true);
    if (wasSelectedInNetwork)
      this._tabbedPane.selectTab(fileSystemTabId, false);

    this._updateHistory();
  }

  /**
   * @param {!Common.Event} event
   */
  _onBindingRemoved(event) {
    const binding = /** @type {!Persistence.PersistenceBinding} */ (event.data);
    this._updateFileTitle(binding.fileSystem);
  }

  /**
   * @return {!UI.Widget}
   */
  get view() {
    return this._tabbedPane;
  }

  /**
   * @return {?UI.Widget}
   */
  get visibleView() {
    return this._tabbedPane.visibleView;
  }

  /**
   * @return {!Array.<!UI.Widget>}
   */
  fileViews() {
    return /** @type {!Array.<!UI.Widget>} */ (this._tabbedPane.tabViews());
  }

  /**
   * @return {!UI.Toolbar}
   */
  leftToolbar() {
    return this._tabbedPane.leftToolbar();
  }

  /**
   * @return {!UI.Toolbar}
   */
  rightToolbar() {
    return this._tabbedPane.rightToolbar();
  }

  /**
   * @param {!Element} parentElement
   */
  show(parentElement) {
    this._tabbedPane.show(parentElement);
  }

  /**
   * @param {!Workspace.UISourceCode} uiSourceCode
   */
  showFile(uiSourceCode) {
    this._innerShowFile(uiSourceCode, true);
  }

  /**
   * @param {!Workspace.UISourceCode} uiSourceCode
   */
  closeFile(uiSourceCode) {
    const tabId = this._tabIds.get(uiSourceCode);
    if (!tabId)
      return;
    this._closeTabs([tabId]);
  }

  closeAllFiles() {
    this._closeTabs(this._tabbedPane.tabIds());
  }

  /**
   * @return {!Array.<!Workspace.UISourceCode>}
   */
  historyUISourceCodes() {
    // FIXME: there should be a way to fetch UISourceCode for its uri.
    const uriToUISourceCode = {};
    for (const id in this._files) {
      const uiSourceCode = this._files[id];
      uriToUISourceCode[uiSourceCode.url()] = uiSourceCode;
    }

    const result = [];
    const uris = this._history._urls();
    for (let i = 0; i < uris.length; ++i) {
      const uiSourceCode = uriToUISourceCode[uris[i]];
      if (uiSourceCode)
        result.push(uiSourceCode);
    }
    return result;
  }

  _addViewListeners() {
    if (!this._currentView || !this._currentView.textEditor)
      return;
    this._currentView.textEditor.addEventListener(
        SourceFrame.SourcesTextEditor.Events.ScrollChanged, this._scrollChanged, this);
    this._currentView.textEditor.addEventListener(
        SourceFrame.SourcesTextEditor.Events.SelectionChanged, this._selectionChanged, this);
  }

  _removeViewListeners() {
    if (!this._currentView || !this._currentView.textEditor)
      return;
    this._currentView.textEditor.removeEventListener(
        SourceFrame.SourcesTextEditor.Events.ScrollChanged, this._scrollChanged, this);
    this._currentView.textEditor.removeEventListener(
        SourceFrame.SourcesTextEditor.Events.SelectionChanged, this._selectionChanged, this);
  }

  /**
   * @param {!Common.Event} event
   */
  _scrollChanged(event) {
    if (this._scrollTimer)
      clearTimeout(this._scrollTimer);
    const lineNumber = /** @type {number} */ (event.data);
    this._scrollTimer = setTimeout(saveHistory.bind(this), 100);
    this._history.updateScrollLineNumber(this._currentFile.url(), lineNumber);

    /**
     * @this {Sources.TabbedEditorContainer}
     */
    function saveHistory() {
      this._history.save(this._previouslyViewedFilesSetting);
    }
  }

  /**
   * @param {!Common.Event} event
   */
  _selectionChanged(event) {
    const range = /** @type {!TextUtils.TextRange} */ (event.data);
    this._history.updateSelectionRange(this._currentFile.url(), range);
    this._history.save(this._previouslyViewedFilesSetting);

    Extensions.extensionServer.sourceSelectionChanged(this._currentFile.url(), range);
  }

  /**
   * @param {!Workspace.UISourceCode} uiSourceCode
   * @param {boolean=} userGesture
   */
  _innerShowFile(uiSourceCode, userGesture) {
    const binding = Persistence.persistence.binding(uiSourceCode);
    uiSourceCode = binding ? binding.fileSystem : uiSourceCode;
    if (this._currentFile === uiSourceCode)
      return;

    this._removeViewListeners();
    this._currentFile = uiSourceCode;

    const tabId = this._tabIds.get(uiSourceCode) || this._appendFileTab(uiSourceCode, userGesture);

    this._tabbedPane.selectTab(tabId, userGesture);
    if (userGesture)
      this._editorSelectedByUserAction();

    const previousView = this._currentView;
    this._currentView = this.visibleView;
    this._addViewListeners();

    const eventData = {
      currentFile: this._currentFile,
      currentView: this._currentView,
      previousView: previousView,
      userGesture: userGesture
    };
    this.dispatchEventToListeners(Sources.TabbedEditorContainer.Events.EditorSelected, eventData);
  }

  /**
   * @param {!Workspace.UISourceCode} uiSourceCode
   * @return {string}
   */
  _titleForFile(uiSourceCode) {
    const maxDisplayNameLength = 30;
    let title = uiSourceCode.displayName(true).trimMiddle(maxDisplayNameLength);
    if (uiSourceCode.isDirty())
      title += '*';
    return title;
  }

  /**
   * @param {string} id
   * @param {string} nextTabId
   */
  _maybeCloseTab(id, nextTabId) {
    const uiSourceCode = this._files[id];
    const shouldPrompt = uiSourceCode.isDirty() && uiSourceCode.project().canSetFileContent();
    // FIXME: this should be replaced with common Save/Discard/Cancel dialog.
    if (!shouldPrompt ||
        confirm(Common.UIString('Are you sure you want to close unsaved file: %s?', uiSourceCode.name()))) {
      uiSourceCode.resetWorkingCopy();
      if (nextTabId)
        this._tabbedPane.selectTab(nextTabId, true);
      this._tabbedPane.closeTab(id, true);
      return true;
    }
    return false;
  }

  /**
   * @param {!Array.<string>} ids
   * @param {boolean=} forceCloseDirtyTabs
   */
  _closeTabs(ids, forceCloseDirtyTabs) {
    const dirtyTabs = [];
    const cleanTabs = [];
    for (let i = 0; i < ids.length; ++i) {
      const id = ids[i];
      const uiSourceCode = this._files[id];
      if (!forceCloseDirtyTabs && uiSourceCode.isDirty())
        dirtyTabs.push(id);
      else
        cleanTabs.push(id);
    }
    if (dirtyTabs.length)
      this._tabbedPane.selectTab(dirtyTabs[0], true);
    this._tabbedPane.closeTabs(cleanTabs, true);
    for (let i = 0; i < dirtyTabs.length; ++i) {
      const nextTabId = i + 1 < dirtyTabs.length ? dirtyTabs[i + 1] : null;
      if (!this._maybeCloseTab(dirtyTabs[i], nextTabId))
        break;
    }
  }

  /**
   * @param {string} tabId
   * @param {!UI.ContextMenu} contextMenu
   */
  _onContextMenu(tabId, contextMenu) {
    const uiSourceCode = this._files[tabId];
    if (uiSourceCode)
      contextMenu.appendApplicableItems(uiSourceCode);
  }

  /**
   * @param {!Workspace.UISourceCode} uiSourceCode
   */
  addUISourceCode(uiSourceCode) {
    const binding = Persistence.persistence.binding(uiSourceCode);
    uiSourceCode = binding ? binding.fileSystem : uiSourceCode;
    if (this._currentFile === uiSourceCode)
      return;

    const uri = uiSourceCode.url();
    const index = this._history.index(uri);
    if (index === -1)
      return;

    if (!this._tabIds.has(uiSourceCode))
      this._appendFileTab(uiSourceCode, false);

    // Select tab if this file was the last to be shown.
    if (!index) {
      this._innerShowFile(uiSourceCode, false);
      return;
    }

    if (!this._currentFile)
      return;

    const currentProjectIsSnippets = Snippets.isSnippetsUISourceCode(this._currentFile);
    const addedProjectIsSnippets = Snippets.isSnippetsUISourceCode(uiSourceCode);
    if (this._history.index(this._currentFile.url()) && currentProjectIsSnippets && !addedProjectIsSnippets)
      this._innerShowFile(uiSourceCode, false);
  }

  /**
   * @param {!Workspace.UISourceCode} uiSourceCode
   */
  removeUISourceCode(uiSourceCode) {
    this.removeUISourceCodes([uiSourceCode]);
  }

  /**
   * @param {!Array.<!Workspace.UISourceCode>} uiSourceCodes
   */
  removeUISourceCodes(uiSourceCodes) {
    const tabIds = [];
    for (let i = 0; i < uiSourceCodes.length; ++i) {
      const uiSourceCode = uiSourceCodes[i];
      const tabId = this._tabIds.get(uiSourceCode);
      if (tabId)
        tabIds.push(tabId);
    }
    this._tabbedPane.closeTabs(tabIds);
  }

  /**
   * @param {!Workspace.UISourceCode} uiSourceCode
   */
  _editorClosedByUserAction(uiSourceCode) {
    this._history.remove(uiSourceCode.url());
    this._updateHistory();
  }

  _editorSelectedByUserAction() {
    this._updateHistory();
  }

  _updateHistory() {
    const tabIds = this._tabbedPane.lastOpenedTabIds(Sources.TabbedEditorContainer.maximalPreviouslyViewedFilesCount);

    /**
     * @param {string} tabId
     * @this {Sources.TabbedEditorContainer}
     */
    function tabIdToURI(tabId) {
      return this._files[tabId].url();
    }

    this._history.update(tabIds.map(tabIdToURI.bind(this)));
    this._history.save(this._previouslyViewedFilesSetting);
  }

  /**
   * @param {!Workspace.UISourceCode} uiSourceCode
   * @return {string}
   */
  _tooltipForFile(uiSourceCode) {
    uiSourceCode = Persistence.persistence.network(uiSourceCode) || uiSourceCode;
    return uiSourceCode.url();
  }

  /**
   * @param {!Workspace.UISourceCode} uiSourceCode
   * @param {boolean=} userGesture
   * @param {number=} index
   * @param {!UI.Widget=} replaceView
   * @return {string}
   */
  _appendFileTab(uiSourceCode, userGesture, index, replaceView) {
    const view = replaceView || this._delegate.viewForFile(uiSourceCode);
    const title = this._titleForFile(uiSourceCode);
    const tooltip = this._tooltipForFile(uiSourceCode);

    const tabId = this._generateTabId();
    this._tabIds.set(uiSourceCode, tabId);
    this._files[tabId] = uiSourceCode;

    if (!replaceView) {
      const savedSelectionRange = this._history.selectionRange(uiSourceCode.url());
      const savedScrollLineNumber = this._history.scrollLineNumber(uiSourceCode.url());
      this._restoreEditorProperties(view, savedSelectionRange, savedScrollLineNumber);
    }

    this._tabbedPane.appendTab(tabId, title, view, tooltip, userGesture, undefined, index);

    this._updateFileTitle(uiSourceCode);
    this._addUISourceCodeListeners(uiSourceCode);
    return tabId;
  }

  /**
   * @param {!UI.Widget} editorView
   * @param {!TextUtils.TextRange=} selection
   * @param {number=} firstLineNumber
   */
  _restoreEditorProperties(editorView, selection, firstLineNumber) {
    const sourceFrame =
        editorView instanceof SourceFrame.SourceFrame ? /** @type {!SourceFrame.SourceFrame} */ (editorView) : null;
    if (!sourceFrame)
      return;
    if (selection)
      sourceFrame.setSelection(selection);
    if (typeof firstLineNumber === 'number')
      sourceFrame.scrollToLine(firstLineNumber);
  }

  /**
   * @param {!Common.Event} event
   */
  _tabClosed(event) {
    const tabId = /** @type {string} */ (event.data.tabId);
    const userGesture = /** @type {boolean} */ (event.data.isUserGesture);

    const uiSourceCode = this._files[tabId];
    if (this._currentFile === uiSourceCode) {
      this._removeViewListeners();
      delete this._currentView;
      delete this._currentFile;
    }
    this._tabIds.remove(uiSourceCode);
    delete this._files[tabId];

    this._removeUISourceCodeListeners(uiSourceCode);

    this.dispatchEventToListeners(Sources.TabbedEditorContainer.Events.EditorClosed, uiSourceCode);

    if (userGesture)
      this._editorClosedByUserAction(uiSourceCode);
  }

  /**
   * @param {!Common.Event} event
   */
  _tabSelected(event) {
    const tabId = /** @type {string} */ (event.data.tabId);
    const userGesture = /** @type {boolean} */ (event.data.isUserGesture);

    const uiSourceCode = this._files[tabId];
    this._innerShowFile(uiSourceCode, userGesture);
  }

  /**
   * @param {!Workspace.UISourceCode} uiSourceCode
   */
  _addUISourceCodeListeners(uiSourceCode) {
    uiSourceCode.addEventListener(Workspace.UISourceCode.Events.TitleChanged, this._uiSourceCodeTitleChanged, this);
    uiSourceCode.addEventListener(
        Workspace.UISourceCode.Events.WorkingCopyChanged, this._uiSourceCodeWorkingCopyChanged, this);
    uiSourceCode.addEventListener(
        Workspace.UISourceCode.Events.WorkingCopyCommitted, this._uiSourceCodeWorkingCopyCommitted, this);
  }

  /**
   * @param {!Workspace.UISourceCode} uiSourceCode
   */
  _removeUISourceCodeListeners(uiSourceCode) {
    uiSourceCode.removeEventListener(Workspace.UISourceCode.Events.TitleChanged, this._uiSourceCodeTitleChanged, this);
    uiSourceCode.removeEventListener(
        Workspace.UISourceCode.Events.WorkingCopyChanged, this._uiSourceCodeWorkingCopyChanged, this);
    uiSourceCode.removeEventListener(
        Workspace.UISourceCode.Events.WorkingCopyCommitted, this._uiSourceCodeWorkingCopyCommitted, this);
  }

  /**
   * @param {!Workspace.UISourceCode} uiSourceCode
   */
  _updateFileTitle(uiSourceCode) {
    const tabId = this._tabIds.get(uiSourceCode);
    if (tabId) {
      const title = this._titleForFile(uiSourceCode);
      this._tabbedPane.changeTabTitle(tabId, title);
      let icon = null;
      if (Persistence.persistence.hasUnsavedCommittedChanges(uiSourceCode)) {
        icon = UI.Icon.create('smallicon-warning');
        icon.title = Common.UIString('Changes to this file were not saved to file system.');
      } else {
        icon = Persistence.PersistenceUtils.iconForUISourceCode(uiSourceCode);
      }
      this._tabbedPane.setTabIcon(tabId, icon);
    }
  }

  /**
   * @param {!Common.Event} event
   */
  _uiSourceCodeTitleChanged(event) {
    const uiSourceCode = /** @type {!Workspace.UISourceCode} */ (event.data);
    this._updateFileTitle(uiSourceCode);
    this._updateHistory();
  }

  /**
   * @param {!Common.Event} event
   */
  _uiSourceCodeWorkingCopyChanged(event) {
    const uiSourceCode = /** @type {!Workspace.UISourceCode} */ (event.data);
    this._updateFileTitle(uiSourceCode);
  }

  /**
   * @param {!Common.Event} event
   */
  _uiSourceCodeWorkingCopyCommitted(event) {
    const uiSourceCode = /** @type {!Workspace.UISourceCode} */ (event.data.uiSourceCode);
    this._updateFileTitle(uiSourceCode);
  }

  /**
   * @return {string}
   */
  _generateTabId() {
    return 'tab_' + (Sources.TabbedEditorContainer._tabId++);
  }

  /**
   * @return {?Workspace.UISourceCode} uiSourceCode
   */
  currentFile() {
    return this._currentFile || null;
  }
};

/** @enum {symbol} */
Sources.TabbedEditorContainer.Events = {
  EditorSelected: Symbol('EditorSelected'),
  EditorClosed: Symbol('EditorClosed')
};

Sources.TabbedEditorContainer._tabId = 0;

Sources.TabbedEditorContainer.maximalPreviouslyViewedFilesCount = 30;

/**
 * @unrestricted
 */
Sources.TabbedEditorContainer.HistoryItem = class {
  /**
   * @param {string} url
   * @param {!TextUtils.TextRange=} selectionRange
   * @param {number=} scrollLineNumber
   */
  constructor(url, selectionRange, scrollLineNumber) {
    /** @const */ this.url = url;
    /** @const */ this._isSerializable =
        url.length < Sources.TabbedEditorContainer.HistoryItem.serializableUrlLengthLimit;
    this.selectionRange = selectionRange;
    this.scrollLineNumber = scrollLineNumber;
  }

  /**
   * @param {!Object} serializedHistoryItem
   * @return {!Sources.TabbedEditorContainer.HistoryItem}
   */
  static fromObject(serializedHistoryItem) {
    const selectionRange = serializedHistoryItem.selectionRange ?
        TextUtils.TextRange.fromObject(serializedHistoryItem.selectionRange) :
        undefined;
    return new Sources.TabbedEditorContainer.HistoryItem(
        serializedHistoryItem.url, selectionRange, serializedHistoryItem.scrollLineNumber);
  }

  /**
   * @return {?Object}
   */
  serializeToObject() {
    if (!this._isSerializable)
      return null;
    const serializedHistoryItem = {};
    serializedHistoryItem.url = this.url;
    serializedHistoryItem.selectionRange = this.selectionRange;
    serializedHistoryItem.scrollLineNumber = this.scrollLineNumber;
    return serializedHistoryItem;
  }
};

Sources.TabbedEditorContainer.HistoryItem.serializableUrlLengthLimit = 4096;


/**
 * @unrestricted
 */
Sources.TabbedEditorContainer.History = class {
  /**
   * @param {!Array.<!Sources.TabbedEditorContainer.HistoryItem>} items
   */
  constructor(items) {
    this._items = items;
    this._rebuildItemIndex();
  }

  /**
   * @param {!Array.<!Object>} serializedHistory
   * @return {!Sources.TabbedEditorContainer.History}
   */
  static fromObject(serializedHistory) {
    const items = [];
    for (let i = 0; i < serializedHistory.length; ++i)
      items.push(Sources.TabbedEditorContainer.HistoryItem.fromObject(serializedHistory[i]));
    return new Sources.TabbedEditorContainer.History(items);
  }

  /**
   * @param {string} url
   * @return {number}
   */
  index(url) {
    return this._itemsIndex.has(url) ? /** @type {number} */ (this._itemsIndex.get(url)) : -1;
  }

  _rebuildItemIndex() {
    /** @type {!Map<string, number>} */
    this._itemsIndex = new Map();
    for (let i = 0; i < this._items.length; ++i) {
      console.assert(!this._itemsIndex.has(this._items[i].url));
      this._itemsIndex.set(this._items[i].url, i);
    }
  }

  /**
   * @param {string} url
   * @return {!TextUtils.TextRange|undefined}
   */
  selectionRange(url) {
    const index = this.index(url);
    return index !== -1 ? this._items[index].selectionRange : undefined;
  }

  /**
   * @param {string} url
   * @param {!TextUtils.TextRange=} selectionRange
   */
  updateSelectionRange(url, selectionRange) {
    if (!selectionRange)
      return;
    const index = this.index(url);
    if (index === -1)
      return;
    this._items[index].selectionRange = selectionRange;
  }

  /**
   * @param {string} url
   * @return {number|undefined}
   */
  scrollLineNumber(url) {
    const index = this.index(url);
    return index !== -1 ? this._items[index].scrollLineNumber : undefined;
  }

  /**
   * @param {string} url
   * @param {number} scrollLineNumber
   */
  updateScrollLineNumber(url, scrollLineNumber) {
    const index = this.index(url);
    if (index === -1)
      return;
    this._items[index].scrollLineNumber = scrollLineNumber;
  }

  /**
   * @param {!Array.<string>} urls
   */
  update(urls) {
    for (let i = urls.length - 1; i >= 0; --i) {
      const index = this.index(urls[i]);
      let item;
      if (index !== -1) {
        item = this._items[index];
        this._items.splice(index, 1);
      } else {
        item = new Sources.TabbedEditorContainer.HistoryItem(urls[i]);
      }
      this._items.unshift(item);
      this._rebuildItemIndex();
    }
  }

  /**
   * @param {string} url
   */
  remove(url) {
    const index = this.index(url);
    if (index !== -1) {
      this._items.splice(index, 1);
      this._rebuildItemIndex();
    }
  }

  /**
   * @param {!Common.Setting} setting
   */
  save(setting) {
    setting.set(this._serializeToObject());
  }

  /**
   * @return {!Array.<!Object>}
   */
  _serializeToObject() {
    const serializedHistory = [];
    for (let i = 0; i < this._items.length; ++i) {
      const serializedItem = this._items[i].serializeToObject();
      if (serializedItem)
        serializedHistory.push(serializedItem);
      if (serializedHistory.length === Sources.TabbedEditorContainer.maximalPreviouslyViewedFilesCount)
        break;
    }
    return serializedHistory;
  }

  /**
   * @return {!Array.<string>}
   */
  _urls() {
    const result = [];
    for (let i = 0; i < this._items.length; ++i)
      result.push(this._items[i].url);
    return result;
  }
};


/**
 * @implements {UI.TabbedPaneTabDelegate}
 * @unrestricted
 */
Sources.EditorContainerTabDelegate = class {
  /**
   * @param {!Sources.TabbedEditorContainer} editorContainer
   */
  constructor(editorContainer) {
    this._editorContainer = editorContainer;
  }

  /**
   * @override
   * @param {!UI.TabbedPane} tabbedPane
   * @param {!Array.<string>} ids
   */
  closeTabs(tabbedPane, ids) {
    this._editorContainer._closeTabs(ids);
  }

  /**
   * @override
   * @param {string} tabId
   * @param {!UI.ContextMenu} contextMenu
   */
  onContextMenu(tabId, contextMenu) {
    this._editorContainer._onContextMenu(tabId, contextMenu);
  }
};
