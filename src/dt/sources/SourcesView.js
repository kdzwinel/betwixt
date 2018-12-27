// Copyright 2014 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
/**
 * @implements {Sources.TabbedEditorContainerDelegate}
 * @implements {UI.Searchable}
 * @implements {UI.Replaceable}
 * @unrestricted
 */
Sources.SourcesView = class extends UI.VBox {
  /**
   * @suppressGlobalPropertiesCheck
   */
  constructor() {
    super();
    this.registerRequiredCSS('sources/sourcesView.css');
    this.element.id = 'sources-panel-sources-view';
    this.setMinimumAndPreferredSizes(88, 52, 150, 100);

    const workspace = Workspace.workspace;

    this._searchableView = new UI.SearchableView(this, 'sourcesViewSearchConfig');
    this._searchableView.setMinimalSearchQuerySize(0);
    this._searchableView.show(this.element);

    /** @type {!Map.<!Workspace.UISourceCode, !UI.Widget>} */
    this._sourceViewByUISourceCode = new Map();

    this._editorContainer = new Sources.TabbedEditorContainer(
        this, Common.settings.createLocalSetting('previouslyViewedFiles', []), this._placeholderElement());
    this._editorContainer.show(this._searchableView.element);
    this._editorContainer.addEventListener(
        Sources.TabbedEditorContainer.Events.EditorSelected, this._editorSelected, this);
    this._editorContainer.addEventListener(Sources.TabbedEditorContainer.Events.EditorClosed, this._editorClosed, this);

    this._historyManager = new Sources.EditingLocationHistoryManager(this, this.currentSourceFrame.bind(this));

    this._toolbarContainerElement = this.element.createChild('div', 'sources-toolbar');
    if (!Runtime.experiments.isEnabled('sourcesPrettyPrint')) {
      this._toolbarEditorActions = new UI.Toolbar('', this._toolbarContainerElement);
      self.runtime.allInstances(Sources.SourcesView.EditorAction).then(appendButtonsForExtensions.bind(this));
    }
    /**
     * @param {!Array.<!Sources.SourcesView.EditorAction>} actions
     * @this {Sources.SourcesView}
     */
    function appendButtonsForExtensions(actions) {
      for (let i = 0; i < actions.length; ++i)
        this._toolbarEditorActions.appendToolbarItem(actions[i].button(this));
    }
    this._scriptViewToolbar = new UI.Toolbar('', this._toolbarContainerElement);
    this._scriptViewToolbar.element.style.flex = 'auto';
    this._bottomToolbar = new UI.Toolbar('', this._toolbarContainerElement);

    /** @type {?Common.EventTarget.EventDescriptor} */
    this._toolbarChangedListener = null;

    UI.startBatchUpdate();
    workspace.uiSourceCodes().forEach(this._addUISourceCode.bind(this));
    UI.endBatchUpdate();

    workspace.addEventListener(Workspace.Workspace.Events.UISourceCodeAdded, this._uiSourceCodeAdded, this);
    workspace.addEventListener(Workspace.Workspace.Events.UISourceCodeRemoved, this._uiSourceCodeRemoved, this);
    workspace.addEventListener(Workspace.Workspace.Events.ProjectRemoved, this._projectRemoved.bind(this), this);

    /**
     * @param {!Event} event
     */
    function handleBeforeUnload(event) {
      if (event.returnValue)
        return;

      let unsavedSourceCodes = [];
      const projects = Workspace.workspace.projectsForType(Workspace.projectTypes.FileSystem);
      for (let i = 0; i < projects.length; ++i) {
        unsavedSourceCodes =
            unsavedSourceCodes.concat(projects[i].uiSourceCodes().filter(sourceCode => sourceCode.isDirty()));
      }

      if (!unsavedSourceCodes.length)
        return;

      event.returnValue = Common.UIString('DevTools have unsaved changes that will be permanently lost.');
      UI.viewManager.showView('sources');
      for (let i = 0; i < unsavedSourceCodes.length; ++i)
        Common.Revealer.reveal(unsavedSourceCodes[i]);
    }

    if (!window.opener)
      window.addEventListener('beforeunload', handleBeforeUnload, true);

    this._shortcuts = {};
    this.element.addEventListener('keydown', this._handleKeyDown.bind(this), false);
  }

  /**
   * @return {!Element}
   */
  _placeholderElement() {
    const shortcuts = [
      {actionId: 'quickOpen.show', description: Common.UIString('Open file')},
      {actionId: 'commandMenu.show', description: Common.UIString('Run command')}
    ];

    const element = createElementWithClass('span', 'tabbed-pane-placeholder');
    for (const shortcut of shortcuts) {
      const shortcutKeyText = UI.shortcutRegistry.shortcutTitleForAction(shortcut.actionId);
      const row = element.createChild('div', 'tabbed-pane-placeholder-row');
      row.createChild('div', 'tabbed-pane-placeholder-key').textContent = shortcutKeyText;
      row.createChild('div', 'tabbed-pane-placeholder-value').textContent = shortcut.description;
    }
    element.createChild('div').textContent = Common.UIString('Drop in a folder to add to workspace');

    element.appendChild(UI.XLink.create(
        'https://developers.google.com/web/tools/chrome-devtools/sources?utm_source=devtools&utm_campaign=2018Q1',
        'Learn more'));

    return element;
  }

  /**
   * @return {!Map.<!Workspace.UISourceCode, number>}
   */
  static defaultUISourceCodeScores() {
    /** @type {!Map.<!Workspace.UISourceCode, number>} */
    const defaultScores = new Map();
    const sourcesView = UI.context.flavor(Sources.SourcesView);
    if (sourcesView) {
      const uiSourceCodes = sourcesView._editorContainer.historyUISourceCodes();
      for (let i = 1; i < uiSourceCodes.length; ++i)  // Skip current element
        defaultScores.set(uiSourceCodes[i], uiSourceCodes.length - i);
    }
    return defaultScores;
  }

  /**
   * @return {!UI.Toolbar}
   */
  leftToolbar() {
    return this._editorContainer.leftToolbar();
  }

  /**
   * @return {!UI.Toolbar}
   */
  rightToolbar() {
    return this._editorContainer.rightToolbar();
  }

  /**
   * @return {!UI.Toolbar}
   */
  bottomToolbar() {
    return this._bottomToolbar;
  }

  /**
   * @param {!Array.<!UI.KeyboardShortcut.Descriptor>} keys
   * @param {function(!Event=):boolean} handler
   */
  _registerShortcuts(keys, handler) {
    for (let i = 0; i < keys.length; ++i)
      this._shortcuts[keys[i].key] = handler;
  }

  _handleKeyDown(event) {
    const shortcutKey = UI.KeyboardShortcut.makeKeyFromEvent(event);
    const handler = this._shortcuts[shortcutKey];
    if (handler && handler())
      event.consume(true);
  }

  /**
   * @override
   */
  wasShown() {
    super.wasShown();
    UI.context.setFlavor(Sources.SourcesView, this);
  }

  /**
   * @override
   */
  willHide() {
    UI.context.setFlavor(Sources.SourcesView, null);
    super.willHide();
  }

  /**
   * @return {!Element}
   */
  toolbarContainerElement() {
    return this._toolbarContainerElement;
  }

  /**
   * @return {!UI.SearchableView}
   */
  searchableView() {
    return this._searchableView;
  }

  /**
   * @return {?UI.Widget}
   */
  visibleView() {
    return this._editorContainer.visibleView;
  }

  /**
   * @return {?Sources.UISourceCodeFrame}
   */
  currentSourceFrame() {
    const view = this.visibleView();
    if (!(view instanceof Sources.UISourceCodeFrame))
      return null;
    return /** @type {!Sources.UISourceCodeFrame} */ (view);
  }

  /**
   * @return {?Workspace.UISourceCode}
   */
  currentUISourceCode() {
    return this._editorContainer.currentFile();
  }

  /**
   * @return {boolean}
   */
  _onCloseEditorTab() {
    const uiSourceCode = this._editorContainer.currentFile();
    if (!uiSourceCode)
      return false;
    this._editorContainer.closeFile(uiSourceCode);
    return true;
  }

  _onJumpToPreviousLocation() {
    this._historyManager.rollback();
  }

  _onJumpToNextLocation() {
    this._historyManager.rollover();
  }

  /**
   * @param {!Common.Event} event
   */
  _uiSourceCodeAdded(event) {
    const uiSourceCode = /** @type {!Workspace.UISourceCode} */ (event.data);
    this._addUISourceCode(uiSourceCode);
  }

  /**
   * @param {!Workspace.UISourceCode} uiSourceCode
   */
  _addUISourceCode(uiSourceCode) {
    if (uiSourceCode.project().isServiceProject())
      return;
    if (uiSourceCode.project().type() === Workspace.projectTypes.FileSystem &&
        Persistence.FileSystemWorkspaceBinding.fileSystemType(uiSourceCode.project()) === 'overrides')
      return;
    this._editorContainer.addUISourceCode(uiSourceCode);
  }

  _uiSourceCodeRemoved(event) {
    const uiSourceCode = /** @type {!Workspace.UISourceCode} */ (event.data);
    this._removeUISourceCodes([uiSourceCode]);
  }

  /**
   * @param {!Array.<!Workspace.UISourceCode>} uiSourceCodes
   */
  _removeUISourceCodes(uiSourceCodes) {
    this._editorContainer.removeUISourceCodes(uiSourceCodes);
    for (let i = 0; i < uiSourceCodes.length; ++i) {
      this._removeSourceFrame(uiSourceCodes[i]);
      this._historyManager.removeHistoryForSourceCode(uiSourceCodes[i]);
    }
  }

  _projectRemoved(event) {
    const project = event.data;
    const uiSourceCodes = project.uiSourceCodes();
    this._removeUISourceCodes(uiSourceCodes);
  }

  _updateScriptViewToolbarItems() {
    this._scriptViewToolbar.removeToolbarItems();
    const view = this.visibleView();
    if (view instanceof UI.SimpleView) {
      for (const item of (/** @type {?UI.SimpleView} */ (view)).syncToolbarItems())
        this._scriptViewToolbar.appendToolbarItem(item);
    }
  }

  /**
   * @param {!Workspace.UISourceCode} uiSourceCode
   * @param {number=} lineNumber 0-based
   * @param {number=} columnNumber
   * @param {boolean=} omitFocus
   * @param {boolean=} omitHighlight
   */
  showSourceLocation(uiSourceCode, lineNumber, columnNumber, omitFocus, omitHighlight) {
    this._historyManager.updateCurrentState();
    this._editorContainer.showFile(uiSourceCode);
    const currentSourceFrame = this.currentSourceFrame();
    if (currentSourceFrame && typeof lineNumber === 'number')
      currentSourceFrame.revealPosition(lineNumber, columnNumber, !omitHighlight);
    this._historyManager.pushNewState();
    if (!omitFocus)
      this.visibleView().focus();
  }

  /**
   * @param {!Workspace.UISourceCode} uiSourceCode
   * @return {!UI.Widget}
   */
  _createSourceView(uiSourceCode) {
    let sourceFrame;
    let sourceView;
    const contentType = uiSourceCode.contentType();

    if (contentType === Common.resourceTypes.Image)
      sourceView = new SourceFrame.ImageView(uiSourceCode.mimeType(), uiSourceCode);
    else if (contentType === Common.resourceTypes.Font)
      sourceView = new SourceFrame.FontView(uiSourceCode.mimeType(), uiSourceCode);
    else
      sourceFrame = new Sources.UISourceCodeFrame(uiSourceCode);

    if (sourceFrame)
      this._historyManager.trackSourceFrameCursorJumps(sourceFrame);

    const widget = /** @type {!UI.Widget} */ (sourceFrame || sourceView);
    this._sourceViewByUISourceCode.set(uiSourceCode, widget);
    return widget;
  }

  /**
   * @param {!Workspace.UISourceCode} uiSourceCode
   * @return {!UI.Widget}
   */
  _getOrCreateSourceView(uiSourceCode) {
    return this._sourceViewByUISourceCode.get(uiSourceCode) || this._createSourceView(uiSourceCode);
  }

  /**
   * @override
   * @param {!Sources.UISourceCodeFrame} sourceFrame
   * @param {!Workspace.UISourceCode} uiSourceCode
   */
  recycleUISourceCodeFrame(sourceFrame, uiSourceCode) {
    this._sourceViewByUISourceCode.delete(sourceFrame.uiSourceCode());
    sourceFrame.setUISourceCode(uiSourceCode);
    this._sourceViewByUISourceCode.set(uiSourceCode, sourceFrame);
  }

  /**
   * @override
   * @param {!Workspace.UISourceCode} uiSourceCode
   * @return {!UI.Widget}
   */
  viewForFile(uiSourceCode) {
    return this._getOrCreateSourceView(uiSourceCode);
  }

  /**
   * @param {!Workspace.UISourceCode} uiSourceCode
   */
  _removeSourceFrame(uiSourceCode) {
    const sourceView = this._sourceViewByUISourceCode.get(uiSourceCode);
    this._sourceViewByUISourceCode.remove(uiSourceCode);
    if (sourceView && sourceView instanceof Sources.UISourceCodeFrame)
      /** @type {!Sources.UISourceCodeFrame} */ (sourceView).dispose();
  }

  /**
   * @param {!Common.Event} event
   */
  _editorClosed(event) {
    const uiSourceCode = /** @type {!Workspace.UISourceCode} */ (event.data);
    this._historyManager.removeHistoryForSourceCode(uiSourceCode);

    let wasSelected = false;
    if (!this._editorContainer.currentFile())
      wasSelected = true;

    // SourcesNavigator does not need to update on EditorClosed.
    this._removeToolbarChangedListener();
    this._updateScriptViewToolbarItems();
    this._searchableView.resetSearch();

    const data = {};
    data.uiSourceCode = uiSourceCode;
    data.wasSelected = wasSelected;
    this.dispatchEventToListeners(Sources.SourcesView.Events.EditorClosed, data);
  }

  /**
   * @param {!Common.Event} event
   */
  _editorSelected(event) {
    const previousSourceFrame =
        event.data.previousView instanceof Sources.UISourceCodeFrame ? event.data.previousView : null;
    if (previousSourceFrame)
      previousSourceFrame.setSearchableView(null);
    const currentSourceFrame =
        event.data.currentView instanceof Sources.UISourceCodeFrame ? event.data.currentView : null;
    if (currentSourceFrame)
      currentSourceFrame.setSearchableView(this._searchableView);

    this._searchableView.setReplaceable(!!currentSourceFrame && currentSourceFrame.canEditSource());
    this._searchableView.refreshSearch();
    this._updateToolbarChangedListener();
    this._updateScriptViewToolbarItems();

    this.dispatchEventToListeners(Sources.SourcesView.Events.EditorSelected, this._editorContainer.currentFile());
  }

  _removeToolbarChangedListener() {
    if (this._toolbarChangedListener)
      Common.EventTarget.removeEventListeners([this._toolbarChangedListener]);
    this._toolbarChangedListener = null;
  }

  _updateToolbarChangedListener() {
    this._removeToolbarChangedListener();
    const sourceFrame = this.currentSourceFrame();
    if (!sourceFrame)
      return;
    this._toolbarChangedListener = sourceFrame.addEventListener(
        Sources.UISourceCodeFrame.Events.ToolbarItemsChanged, this._updateScriptViewToolbarItems, this);
  }

  /**
   * @override
   */
  searchCanceled() {
    if (this._searchView)
      this._searchView.searchCanceled();

    delete this._searchView;
    delete this._searchConfig;
  }

  /**
   * @override
   * @param {!UI.SearchableView.SearchConfig} searchConfig
   * @param {boolean} shouldJump
   * @param {boolean=} jumpBackwards
   */
  performSearch(searchConfig, shouldJump, jumpBackwards) {
    const sourceFrame = this.currentSourceFrame();
    if (!sourceFrame)
      return;

    this._searchView = sourceFrame;
    this._searchConfig = searchConfig;

    this._searchView.performSearch(this._searchConfig, shouldJump, jumpBackwards);
  }

  /**
   * @override
   */
  jumpToNextSearchResult() {
    if (!this._searchView)
      return;

    if (this._searchView !== this.currentSourceFrame()) {
      this.performSearch(this._searchConfig, true);
      return;
    }

    this._searchView.jumpToNextSearchResult();
  }

  /**
   * @override
   */
  jumpToPreviousSearchResult() {
    if (!this._searchView)
      return;

    if (this._searchView !== this.currentSourceFrame()) {
      this.performSearch(this._searchConfig, true);
      if (this._searchView)
        this._searchView.jumpToLastSearchResult();
      return;
    }

    this._searchView.jumpToPreviousSearchResult();
  }

  /**
   * @override
   * @return {boolean}
   */
  supportsCaseSensitiveSearch() {
    return true;
  }

  /**
   * @override
   * @return {boolean}
   */
  supportsRegexSearch() {
    return true;
  }

  /**
   * @override
   * @param {!UI.SearchableView.SearchConfig} searchConfig
   * @param {string} replacement
   */
  replaceSelectionWith(searchConfig, replacement) {
    const sourceFrame = this.currentSourceFrame();
    if (!sourceFrame) {
      console.assert(sourceFrame);
      return;
    }
    sourceFrame.replaceSelectionWith(searchConfig, replacement);
  }

  /**
   * @override
   * @param {!UI.SearchableView.SearchConfig} searchConfig
   * @param {string} replacement
   */
  replaceAllWith(searchConfig, replacement) {
    const sourceFrame = this.currentSourceFrame();
    if (!sourceFrame) {
      console.assert(sourceFrame);
      return;
    }
    sourceFrame.replaceAllWith(searchConfig, replacement);
  }

  _showOutlineQuickOpen() {
    QuickOpen.QuickOpen.show('@');
  }

  _showGoToLineQuickOpen() {
    if (this._editorContainer.currentFile())
      QuickOpen.QuickOpen.show(':');
  }

  _save() {
    this._saveSourceFrame(this.currentSourceFrame());
  }

  _saveAll() {
    const sourceFrames = this._editorContainer.fileViews();
    sourceFrames.forEach(this._saveSourceFrame.bind(this));
  }

  /**
   * @param {?UI.Widget} sourceFrame
   */
  _saveSourceFrame(sourceFrame) {
    if (!(sourceFrame instanceof Sources.UISourceCodeFrame))
      return;
    const uiSourceCodeFrame = /** @type {!Sources.UISourceCodeFrame} */ (sourceFrame);
    uiSourceCodeFrame.commitEditing();
  }

  /**
   * @param {boolean} active
   */
  toggleBreakpointsActiveState(active) {
    this._editorContainer.view.element.classList.toggle('breakpoints-deactivated', !active);
  }
};

/** @enum {symbol} */
Sources.SourcesView.Events = {
  EditorClosed: Symbol('EditorClosed'),
  EditorSelected: Symbol('EditorSelected'),
};

/**
 * @interface
 */
Sources.SourcesView.EditorAction = function() {};

Sources.SourcesView.EditorAction.prototype = {
  /**
   * @param {!Sources.SourcesView} sourcesView
   * @return {!UI.ToolbarButton}
   */
  button(sourcesView) {}
};

/**
 * @implements {UI.ActionDelegate}
 * @unrestricted
 */
Sources.SourcesView.SwitchFileActionDelegate = class {
  /**
   * @param {!Workspace.UISourceCode} currentUISourceCode
   * @return {?Workspace.UISourceCode}
   */
  static _nextFile(currentUISourceCode) {
    /**
     * @param {string} name
     * @return {string}
     */
    function fileNamePrefix(name) {
      const lastDotIndex = name.lastIndexOf('.');
      const namePrefix = name.substr(0, lastDotIndex !== -1 ? lastDotIndex : name.length);
      return namePrefix.toLowerCase();
    }

    const uiSourceCodes = currentUISourceCode.project().uiSourceCodes();
    const candidates = [];
    const url = currentUISourceCode.parentURL();
    const name = currentUISourceCode.name();
    const namePrefix = fileNamePrefix(name);
    for (let i = 0; i < uiSourceCodes.length; ++i) {
      const uiSourceCode = uiSourceCodes[i];
      if (url !== uiSourceCode.parentURL())
        continue;
      if (fileNamePrefix(uiSourceCode.name()) === namePrefix)
        candidates.push(uiSourceCode.name());
    }
    candidates.sort(String.naturalOrderComparator);
    const index = mod(candidates.indexOf(name) + 1, candidates.length);
    const fullURL = (url ? url + '/' : '') + candidates[index];
    const nextUISourceCode = currentUISourceCode.project().uiSourceCodeForURL(fullURL);
    return nextUISourceCode !== currentUISourceCode ? nextUISourceCode : null;
  }

  /**
   * @override
   * @param {!UI.Context} context
   * @param {string} actionId
   * @return {boolean}
   */
  handleAction(context, actionId) {
    const sourcesView = UI.context.flavor(Sources.SourcesView);
    const currentUISourceCode = sourcesView.currentUISourceCode();
    if (!currentUISourceCode)
      return false;
    const nextUISourceCode = Sources.SourcesView.SwitchFileActionDelegate._nextFile(currentUISourceCode);
    if (!nextUISourceCode)
      return false;
    sourcesView.showSourceLocation(nextUISourceCode);
    return true;
  }
};


/**
 * @implements {UI.ActionDelegate}
 * @unrestricted
 */
Sources.SourcesView.ActionDelegate = class {
  /**
   * @override
   * @param {!UI.Context} context
   * @param {string} actionId
   * @return {boolean}
   */
  handleAction(context, actionId) {
    const sourcesView = UI.context.flavor(Sources.SourcesView);
    if (!sourcesView)
      return false;

    switch (actionId) {
      case 'sources.close-all':
        sourcesView._editorContainer.closeAllFiles();
        return true;
      case 'sources.jump-to-previous-location':
        sourcesView._onJumpToPreviousLocation();
        return true;
      case 'sources.jump-to-next-location':
        sourcesView._onJumpToNextLocation();
        return true;
      case 'sources.close-editor-tab':
        return sourcesView._onCloseEditorTab();
      case 'sources.go-to-line':
        sourcesView._showGoToLineQuickOpen();
        return true;
      case 'sources.go-to-member':
        sourcesView._showOutlineQuickOpen();
        return true;
      case 'sources.save':
        sourcesView._save();
        return true;
      case 'sources.save-all':
        sourcesView._saveAll();
        return true;
    }

    return false;
  }
};
