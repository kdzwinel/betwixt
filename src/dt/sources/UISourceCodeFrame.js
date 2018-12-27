/*
 * Copyright (C) 2012 Google Inc. All rights reserved.
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

Sources.UISourceCodeFrame = class extends SourceFrame.SourceFrame {
  /**
   * @param {!Workspace.UISourceCode} uiSourceCode
   */
  constructor(uiSourceCode) {
    super(workingCopy);
    this._uiSourceCode = uiSourceCode;

    if (Runtime.experiments.isEnabled('sourceDiff'))
      this._diff = new SourceFrame.SourceCodeDiff(this.textEditor);

    this._muteSourceCodeEvents = false;
    this._isSettingContent = false;

    /** @type {?Persistence.PersistenceBinding} */
    this._persistenceBinding = Persistence.persistence.binding(uiSourceCode);

    /** @type {!Map<number, !Sources.UISourceCodeFrame.RowMessageBucket>} */
    this._rowMessageBuckets = new Map();
    /** @type {!Set<string>} */
    this._typeDecorationsPending = new Set();

    this._uiSourceCodeEventListeners = [];
    this._messageAndDecorationListeners = [];

    this._boundOnBindingChanged = this._onBindingChanged.bind(this);

    this.textEditor.addEventListener(
        SourceFrame.SourcesTextEditor.Events.EditorBlurred,
        () => UI.context.setFlavor(Sources.UISourceCodeFrame, null));
    this.textEditor.addEventListener(
        SourceFrame.SourcesTextEditor.Events.EditorFocused,
        () => UI.context.setFlavor(Sources.UISourceCodeFrame, this));
    Common.settings.moduleSetting('persistenceNetworkOverridesEnabled')
        .addChangeListener(this._onNetworkPersistenceChanged, this);


    this._errorPopoverHelper = new UI.PopoverHelper(this.element, this._getErrorPopoverContent.bind(this));
    this._errorPopoverHelper.setHasPadding(true);

    this._errorPopoverHelper.setTimeout(100, 100);

    /** @type {!Array<!Sources.UISourceCodeFrame.Plugin>} */
    this._plugins = [];

    this._initializeUISourceCode();

    /**
     * @return {!Promise<?string>}
     */
    function workingCopy() {
      if (uiSourceCode.isDirty())
        return /** @type {!Promise<?string>} */ (Promise.resolve(uiSourceCode.workingCopy()));
      return uiSourceCode.requestContent();
    }
  }

  _installMessageAndDecorationListeners() {
    if (this._persistenceBinding) {
      const networkSourceCode = this._persistenceBinding.network;
      const fileSystemSourceCode = this._persistenceBinding.fileSystem;
      this._messageAndDecorationListeners = [
        networkSourceCode.addEventListener(Workspace.UISourceCode.Events.MessageAdded, this._onMessageAdded, this),
        networkSourceCode.addEventListener(Workspace.UISourceCode.Events.MessageRemoved, this._onMessageRemoved, this),
        networkSourceCode.addEventListener(
            Workspace.UISourceCode.Events.LineDecorationAdded, this._onLineDecorationAdded, this),
        networkSourceCode.addEventListener(
            Workspace.UISourceCode.Events.LineDecorationRemoved, this._onLineDecorationRemoved, this),

        fileSystemSourceCode.addEventListener(Workspace.UISourceCode.Events.MessageAdded, this._onMessageAdded, this),
        fileSystemSourceCode.addEventListener(
            Workspace.UISourceCode.Events.MessageRemoved, this._onMessageRemoved, this),
      ];
    } else {
      this._messageAndDecorationListeners = [
        this._uiSourceCode.addEventListener(Workspace.UISourceCode.Events.MessageAdded, this._onMessageAdded, this),
        this._uiSourceCode.addEventListener(Workspace.UISourceCode.Events.MessageRemoved, this._onMessageRemoved, this),
        this._uiSourceCode.addEventListener(
            Workspace.UISourceCode.Events.LineDecorationAdded, this._onLineDecorationAdded, this),
        this._uiSourceCode.addEventListener(
            Workspace.UISourceCode.Events.LineDecorationRemoved, this._onLineDecorationRemoved, this)
      ];
    }
  }

  /**
   * @return {!Workspace.UISourceCode}
   */
  uiSourceCode() {
    return this._uiSourceCode;
  }

  /**
   * @param {!Workspace.UISourceCode} uiSourceCode
   */
  setUISourceCode(uiSourceCode) {
    this._unloadUISourceCode();
    this._uiSourceCode = uiSourceCode;
    if (uiSourceCode.contentLoaded()) {
      if (uiSourceCode.workingCopy() !== this.textEditor.text())
        this._innerSetContent(uiSourceCode.workingCopy());
    } else {
      uiSourceCode.requestContent().then(() => {
        if (this._uiSourceCode !== uiSourceCode)
          return;
        if (uiSourceCode.workingCopy() !== this.textEditor.text())
          this._innerSetContent(uiSourceCode.workingCopy());
      });
    }
    this._initializeUISourceCode();
  }

  _unloadUISourceCode() {
    this._disposePlugins();
    for (const message of this._allMessages())
      this._removeMessageFromSource(message);
    Common.EventTarget.removeEventListeners(this._messageAndDecorationListeners);
    Common.EventTarget.removeEventListeners(this._uiSourceCodeEventListeners);
    this._uiSourceCode.removeWorkingCopyGetter();
    Persistence.persistence.unsubscribeFromBindingEvent(this._uiSourceCode, this._boundOnBindingChanged);
  }

  _initializeUISourceCode() {
    this._uiSourceCodeEventListeners = [
      this._uiSourceCode.addEventListener(
          Workspace.UISourceCode.Events.WorkingCopyChanged, this._onWorkingCopyChanged, this),
      this._uiSourceCode.addEventListener(
          Workspace.UISourceCode.Events.WorkingCopyCommitted, this._onWorkingCopyCommitted, this),
      this._uiSourceCode.addEventListener(
          Workspace.UISourceCode.Events.TitleChanged, this._refreshHighlighterType, this)
    ];

    Persistence.persistence.subscribeForBindingEvent(this._uiSourceCode, this._boundOnBindingChanged);
    for (const message of this._allMessages())
      this._addMessageToSource(message);
    this._installMessageAndDecorationListeners();
    this._updateStyle();
    this._decorateAllTypes();
    this._refreshHighlighterType();
    if (Runtime.experiments.isEnabled('sourcesPrettyPrint')) {
      const supportedPrettyTypes = new Set(['text/html', 'text/css', 'text/javascript']);
      this.setCanPrettyPrint(supportedPrettyTypes.has(this.highlighterType()), true);
    }
    this._ensurePluginsLoaded();
  }

  /**
   * @override
   */
  wasShown() {
    super.wasShown();
    // We need CodeMirrorTextEditor to be initialized prior to this call as it calls |cursorPositionToCoordinates| internally. @see crbug.com/506566
    setImmediate(this._updateBucketDecorations.bind(this));
    this.setEditable(this._canEditSource());
    for (const plugin of this._plugins)
      plugin.wasShown();
  }

  /**
   * @override
   */
  willHide() {
    for (const plugin of this._plugins)
      plugin.willHide();
    super.willHide();
    UI.context.setFlavor(Sources.UISourceCodeFrame, null);
    this._uiSourceCode.removeWorkingCopyGetter();
  }

  _refreshHighlighterType() {
    const binding = Persistence.persistence.binding(this._uiSourceCode);
    const highlighterType = binding ? binding.network.mimeType() : this._uiSourceCode.mimeType();
    if (this.highlighterType() === highlighterType)
      return;
    this._disposePlugins();
    this.setHighlighterType(highlighterType);
    this._ensurePluginsLoaded();
  }

  /**
   * @return {boolean}
   */
  _canEditSource() {
    if (Persistence.persistence.binding(this._uiSourceCode))
      return true;
    if (this._uiSourceCode.project().canSetFileContent())
      return true;
    if (this._uiSourceCode.project().isServiceProject())
      return false;
    if (this._uiSourceCode.project().type() === Workspace.projectTypes.Network &&
        Persistence.networkPersistenceManager.active())
      return true;
    // Because live edit fails on large whitespace changes, pretty printed scripts are not editable.
    if (this.pretty && this._uiSourceCode.contentType().hasScripts())
      return false;
    return this._uiSourceCode.contentType() !== Common.resourceTypes.Document;
  }

  _onNetworkPersistenceChanged() {
    this.setEditable(this._canEditSource());
  }

  commitEditing() {
    if (!this._uiSourceCode.isDirty())
      return;

    this._muteSourceCodeEvents = true;
    this._uiSourceCode.commitWorkingCopy();
    this._muteSourceCodeEvents = false;
  }

  /**
   * @override
   * @param {?string} content
   */
  setContent(content) {
    this._disposePlugins();
    this._rowMessageBuckets.clear();
    super.setContent(content);
    for (const message of this._allMessages())
      this._addMessageToSource(message);
    this._decorateAllTypes();
    this._ensurePluginsLoaded();
  }

  /**
   * @return {!Set<!Workspace.UISourceCode.Message>}
   */
  _allMessages() {
    if (this._persistenceBinding) {
      const combinedSet = this._persistenceBinding.network.messages();
      combinedSet.addAll(this._persistenceBinding.fileSystem.messages());
      return combinedSet;
    }
    return this._uiSourceCode.messages();
  }

  /**
   * @override
   * @param {!TextUtils.TextRange} oldRange
   * @param {!TextUtils.TextRange} newRange
   */
  onTextChanged(oldRange, newRange) {
    const wasPretty = this.pretty;
    super.onTextChanged(oldRange, newRange);
    this._errorPopoverHelper.hidePopover();
    if (this._isSettingContent)
      return;
    Sources.SourcesPanel.instance().updateLastModificationTime();
    this._muteSourceCodeEvents = true;
    if (this.isClean())
      this._uiSourceCode.resetWorkingCopy();
    else
      this._uiSourceCode.setWorkingCopyGetter(this.textEditor.text.bind(this.textEditor));
    this._muteSourceCodeEvents = false;
    if (wasPretty !== this.pretty) {
      this._updateStyle();
      this._disposePlugins();
      this._ensurePluginsLoaded();
    }
  }

  /**
   * @param {!Common.Event} event
   */
  _onWorkingCopyChanged(event) {
    if (this._muteSourceCodeEvents)
      return;
    this._innerSetContent(this._uiSourceCode.workingCopy());
  }

  /**
   * @param {!Common.Event} event
   */
  _onWorkingCopyCommitted(event) {
    if (!this._muteSourceCodeEvents)
      this._innerSetContent(this._uiSourceCode.workingCopy());
    this.contentCommitted();
    this._updateStyle();
  }

  _ensurePluginsLoaded() {
    if (!this.loaded || this._plugins.length)
      return;

    const binding = Persistence.persistence.binding(this._uiSourceCode);
    const pluginUISourceCode = binding ? binding.network : this._uiSourceCode;

    // The order of these plugins matters for toolbar items
    if (Sources.DebuggerPlugin.accepts(pluginUISourceCode))
      this._plugins.push(new Sources.DebuggerPlugin(this.textEditor, pluginUISourceCode, this.transformer()));
    if (Sources.CSSPlugin.accepts(pluginUISourceCode))
      this._plugins.push(new Sources.CSSPlugin(this.textEditor));
    if (!this.pretty && Sources.JavaScriptCompilerPlugin.accepts(pluginUISourceCode))
      this._plugins.push(new Sources.JavaScriptCompilerPlugin(this.textEditor, pluginUISourceCode));
    if (Sources.SnippetsPlugin.accepts(pluginUISourceCode))
      this._plugins.push(new Sources.SnippetsPlugin(this.textEditor, pluginUISourceCode));
    if (Sources.ScriptOriginPlugin.accepts(pluginUISourceCode))
      this._plugins.push(new Sources.ScriptOriginPlugin(this.textEditor, pluginUISourceCode));
    if (!this.pretty && Runtime.experiments.isEnabled('sourceDiff') &&
        Sources.GutterDiffPlugin.accepts(pluginUISourceCode))
      this._plugins.push(new Sources.GutterDiffPlugin(this.textEditor, pluginUISourceCode));

    this.dispatchEventToListeners(Sources.UISourceCodeFrame.Events.ToolbarItemsChanged);
    for (const plugin of this._plugins)
      plugin.wasShown();
  }

  _disposePlugins() {
    this.textEditor.operation(() => {
      for (const plugin of this._plugins)
        plugin.dispose();
    });
    this._plugins = [];
  }

  _onBindingChanged() {
    const binding = Persistence.persistence.binding(this._uiSourceCode);
    if (binding === this._persistenceBinding)
      return;
    this._unloadUISourceCode();
    this._persistenceBinding = binding;
    this._initializeUISourceCode();
  }

  _updateStyle() {
    this.setEditable(this._canEditSource());
  }

  /**
   * @param {string} content
   */
  _innerSetContent(content) {
    this._isSettingContent = true;
    const oldContent = this.textEditor.text();
    if (this._diff)
      this._diff.highlightModifiedLines(oldContent, content);
    if (oldContent !== content)
      this.setContent(content);
    this._isSettingContent = false;
  }

  /**
   * @override
   * @return {!Promise}
   */
  async populateTextAreaContextMenu(contextMenu, editorLineNumber, editorColumnNumber) {
    await super.populateTextAreaContextMenu(contextMenu, editorLineNumber, editorColumnNumber);
    contextMenu.appendApplicableItems(this._uiSourceCode);
    const location = this.transformer().editorToRawLocation(editorLineNumber, editorColumnNumber);
    contextMenu.appendApplicableItems(new Workspace.UILocation(this._uiSourceCode, location[0], location[1]));
    contextMenu.appendApplicableItems(this);
    for (const plugin of this._plugins)
      await plugin.populateTextAreaContextMenu(contextMenu, editorLineNumber, editorColumnNumber);
  }

  dispose() {
    this._errorPopoverHelper.dispose();
    this._unloadUISourceCode();
    this.textEditor.dispose();
    this.detach();
    Common.settings.moduleSetting('persistenceNetworkOverridesEnabled')
        .removeChangeListener(this._onNetworkPersistenceChanged, this);
  }

  /**
   * @param {!Common.Event} event
   */
  _onMessageAdded(event) {
    const message = /** @type {!Workspace.UISourceCode.Message} */ (event.data);
    this._addMessageToSource(message);
  }

  /**
   * @param {!Workspace.UISourceCode.Message} message
   */
  _addMessageToSource(message) {
    if (!this.loaded)
      return;
    const editorLocation = this.transformer().rawToEditorLocation(message.lineNumber(), message.columnNumber());
    let editorLineNumber = editorLocation[0];
    if (editorLineNumber >= this.textEditor.linesCount)
      editorLineNumber = this.textEditor.linesCount - 1;
    if (editorLineNumber < 0)
      editorLineNumber = 0;

    let messageBucket = this._rowMessageBuckets.get(editorLineNumber);
    if (!messageBucket) {
      messageBucket = new Sources.UISourceCodeFrame.RowMessageBucket(this, this.textEditor, editorLineNumber);
      this._rowMessageBuckets.set(editorLineNumber, messageBucket);
    }
    messageBucket.addMessage(message);
  }

  /**
   * @param {!Common.Event} event
   */
  _onMessageRemoved(event) {
    const message = /** @type {!Workspace.UISourceCode.Message} */ (event.data);
    this._removeMessageFromSource(message);
  }

  /**
   * @param {!Workspace.UISourceCode.Message} message
   */
  _removeMessageFromSource(message) {
    if (!this.loaded)
      return;

    const editorLocation = this.transformer().rawToEditorLocation(message.lineNumber(), message.columnNumber());
    let editorLineNumber = editorLocation[0];
    if (editorLineNumber >= this.textEditor.linesCount)
      editorLineNumber = this.textEditor.linesCount - 1;
    if (editorLineNumber < 0)
      editorLineNumber = 0;

    const messageBucket = this._rowMessageBuckets.get(editorLineNumber);
    if (!messageBucket)
      return;
    messageBucket.removeMessage(message);
    if (!messageBucket.uniqueMessagesCount()) {
      messageBucket.detachFromEditor();
      this._rowMessageBuckets.delete(editorLineNumber);
    }
  }

  /**
   * @param {!Event} event
   * @return {?UI.PopoverRequest}
   */
  _getErrorPopoverContent(event) {
    const element = event.target.enclosingNodeOrSelfWithClass('text-editor-line-decoration-icon') ||
        event.target.enclosingNodeOrSelfWithClass('text-editor-line-decoration-wave');
    if (!element)
      return null;
    const anchor = element.enclosingNodeOrSelfWithClass('text-editor-line-decoration-icon') ?
        element.boxInWindow() :
        new AnchorBox(event.clientX, event.clientY, 1, 1);
    return {
      box: anchor,
      show: popover => {
        const messageBucket = element.enclosingNodeOrSelfWithClass('text-editor-line-decoration')._messageBucket;
        const messagesOutline = messageBucket.messagesDescription();
        popover.contentElement.appendChild(messagesOutline);
        return Promise.resolve(true);
      }
    };
  }

  _updateBucketDecorations() {
    for (const bucket of this._rowMessageBuckets.values())
      bucket._updateDecoration();
  }

  /**
   * @param {!Common.Event} event
   */
  _onLineDecorationAdded(event) {
    const marker = /** @type {!Workspace.UISourceCode.LineMarker} */ (event.data);
    this._decorateTypeThrottled(marker.type());
  }

  /**
   * @param {!Common.Event} event
   */
  _onLineDecorationRemoved(event) {
    const marker = /** @type {!Workspace.UISourceCode.LineMarker} */ (event.data);
    this._decorateTypeThrottled(marker.type());
  }

  /**
   * @param {string} type
   */
  _decorateTypeThrottled(type) {
    if (this._typeDecorationsPending.has(type))
      return;
    this._typeDecorationsPending.add(type);
    self.runtime.extensions(SourceFrame.LineDecorator)
        .find(extension => extension.descriptor()['decoratorType'] === type)
        .instance()
        .then(decorator => {
          this._typeDecorationsPending.delete(type);
          this.textEditor.codeMirror().operation(() => {
            decorator.decorate(
                this._persistenceBinding ? this._persistenceBinding.network : this.uiSourceCode(), this.textEditor);
          });
        });
  }

  _decorateAllTypes() {
    if (!this.loaded)
      return;
    for (const extension of self.runtime.extensions(SourceFrame.LineDecorator)) {
      const type = extension.descriptor()['decoratorType'];
      if (this._uiSourceCode.decorationsForType(type))
        this._decorateTypeThrottled(type);
    }
  }

  /**
   * @override
   * @return {!Array<!UI.ToolbarItem>}
   */
  syncToolbarItems() {
    const leftToolbarItems = super.syncToolbarItems();
    const rightToolbarItems = [];
    for (const plugin of this._plugins) {
      leftToolbarItems.pushAll(plugin.leftToolbarItems());
      rightToolbarItems.pushAll(plugin.rightToolbarItems());
    }

    if (!rightToolbarItems.length)
      return leftToolbarItems;

    return [...leftToolbarItems, new UI.ToolbarSeparator(true), ...rightToolbarItems];
  }

  /**
   * @override
   * @param {!UI.ContextMenu} contextMenu
   * @param {number} lineNumber
   * @return {!Promise}
   */
  async populateLineGutterContextMenu(contextMenu, lineNumber) {
    await super.populateLineGutterContextMenu(contextMenu, lineNumber);
    for (const plugin of this._plugins)
      await plugin.populateLineGutterContextMenu(contextMenu, lineNumber);
  }
};

Sources.UISourceCodeFrame._iconClassPerLevel = {};
Sources.UISourceCodeFrame._iconClassPerLevel[Workspace.UISourceCode.Message.Level.Error] = 'smallicon-error';
Sources.UISourceCodeFrame._iconClassPerLevel[Workspace.UISourceCode.Message.Level.Warning] = 'smallicon-warning';

Sources.UISourceCodeFrame._bubbleTypePerLevel = {};
Sources.UISourceCodeFrame._bubbleTypePerLevel[Workspace.UISourceCode.Message.Level.Error] = 'error';
Sources.UISourceCodeFrame._bubbleTypePerLevel[Workspace.UISourceCode.Message.Level.Warning] = 'warning';

Sources.UISourceCodeFrame._lineClassPerLevel = {};
Sources.UISourceCodeFrame._lineClassPerLevel[Workspace.UISourceCode.Message.Level.Error] =
    'text-editor-line-with-error';
Sources.UISourceCodeFrame._lineClassPerLevel[Workspace.UISourceCode.Message.Level.Warning] =
    'text-editor-line-with-warning';

/**
 * @unrestricted
 */
Sources.UISourceCodeFrame.RowMessage = class {
  /**
   * @param {!Workspace.UISourceCode.Message} message
   */
  constructor(message) {
    this._message = message;
    this._repeatCount = 1;
    this.element = createElementWithClass('div', 'text-editor-row-message');
    this._icon = this.element.createChild('label', '', 'dt-icon-label');
    this._icon.type = Sources.UISourceCodeFrame._iconClassPerLevel[message.level()];
    this._repeatCountElement =
        this.element.createChild('label', 'text-editor-row-message-repeat-count hidden', 'dt-small-bubble');
    this._repeatCountElement.type = Sources.UISourceCodeFrame._bubbleTypePerLevel[message.level()];
    const linesContainer = this.element.createChild('div');
    const lines = this._message.text().split('\n');
    for (let i = 0; i < lines.length; ++i) {
      const messageLine = linesContainer.createChild('div');
      messageLine.textContent = lines[i];
    }
  }

  /**
   * @return {!Workspace.UISourceCode.Message}
   */
  message() {
    return this._message;
  }

  /**
   * @return {number}
   */
  repeatCount() {
    return this._repeatCount;
  }

  setRepeatCount(repeatCount) {
    if (this._repeatCount === repeatCount)
      return;
    this._repeatCount = repeatCount;
    this._updateMessageRepeatCount();
  }

  _updateMessageRepeatCount() {
    this._repeatCountElement.textContent = this._repeatCount;
    const showRepeatCount = this._repeatCount > 1;
    this._repeatCountElement.classList.toggle('hidden', !showRepeatCount);
    this._icon.classList.toggle('hidden', showRepeatCount);
  }
};

Sources.UISourceCodeFrame.RowMessageBucket = class {
  /**
   * @param {!Sources.UISourceCodeFrame} sourceFrame
   * @param {!TextEditor.CodeMirrorTextEditor} textEditor
   * @param {number} editorLineNumber
   */
  constructor(sourceFrame, textEditor, editorLineNumber) {
    this._sourceFrame = sourceFrame;
    this.textEditor = textEditor;
    this._lineHandle = textEditor.textEditorPositionHandle(editorLineNumber, 0);
    this._decoration = createElementWithClass('div', 'text-editor-line-decoration');
    this._decoration._messageBucket = this;
    this._wave = this._decoration.createChild('div', 'text-editor-line-decoration-wave');
    this._icon = this._wave.createChild('label', 'text-editor-line-decoration-icon', 'dt-icon-label');
    /** @type {?number} */
    this._decorationStartColumn = null;

    this._messagesDescriptionElement = createElementWithClass('div', 'text-editor-messages-description-container');
    /** @type {!Array.<!Sources.UISourceCodeFrame.RowMessage>} */
    this._messages = [];

    this._level = null;
  }

  /**
   * @param {number} editorLineNumber
   * @param {number} columnNumber
   */
  _updateWavePosition(editorLineNumber, columnNumber) {
    editorLineNumber = Math.min(editorLineNumber, this.textEditor.linesCount - 1);
    const lineText = this.textEditor.line(editorLineNumber);
    columnNumber = Math.min(columnNumber, lineText.length);
    const lineIndent = TextUtils.TextUtils.lineIndent(lineText).length;
    const startColumn = Math.max(columnNumber - 1, lineIndent);
    if (this._decorationStartColumn === startColumn)
      return;
    if (this._decorationStartColumn !== null)
      this.textEditor.removeDecoration(this._decoration, editorLineNumber);
    this.textEditor.addDecoration(this._decoration, editorLineNumber, startColumn);
    this._decorationStartColumn = startColumn;
  }

  /**
   * @return {!Element}
   */
  messagesDescription() {
    this._messagesDescriptionElement.removeChildren();
    UI.appendStyle(this._messagesDescriptionElement, 'source_frame/messagesPopover.css');
    for (let i = 0; i < this._messages.length; ++i)
      this._messagesDescriptionElement.appendChild(this._messages[i].element);

    return this._messagesDescriptionElement;
  }

  detachFromEditor() {
    const position = this._lineHandle.resolve();
    if (!position)
      return;
    const editorLineNumber = position.lineNumber;
    if (this._level) {
      this.textEditor.toggleLineClass(
          editorLineNumber, Sources.UISourceCodeFrame._lineClassPerLevel[this._level], false);
    }
    if (this._decorationStartColumn !== null) {
      this.textEditor.removeDecoration(this._decoration, editorLineNumber);
      this._decorationStartColumn = null;
    }
  }

  /**
   * @return {number}
   */
  uniqueMessagesCount() {
    return this._messages.length;
  }

  /**
   * @param {!Workspace.UISourceCode.Message} message
   */
  addMessage(message) {
    for (let i = 0; i < this._messages.length; ++i) {
      const rowMessage = this._messages[i];
      if (rowMessage.message().isEqual(message)) {
        rowMessage.setRepeatCount(rowMessage.repeatCount() + 1);
        return;
      }
    }

    const rowMessage = new Sources.UISourceCodeFrame.RowMessage(message);
    this._messages.push(rowMessage);
    this._updateDecoration();
  }

  /**
   * @param {!Workspace.UISourceCode.Message} message
   */
  removeMessage(message) {
    for (let i = 0; i < this._messages.length; ++i) {
      const rowMessage = this._messages[i];
      if (!rowMessage.message().isEqual(message))
        continue;
      rowMessage.setRepeatCount(rowMessage.repeatCount() - 1);
      if (!rowMessage.repeatCount())
        this._messages.splice(i, 1);
      this._updateDecoration();
      return;
    }
  }

  _updateDecoration() {
    if (!this._sourceFrame.isShowing())
      return;
    if (!this._messages.length)
      return;
    const position = this._lineHandle.resolve();
    if (!position)
      return;

    const editorLineNumber = position.lineNumber;
    let columnNumber = Number.MAX_VALUE;
    let maxMessage = null;
    for (let i = 0; i < this._messages.length; ++i) {
      const message = this._messages[i].message();
      const editorLocation =
          this._sourceFrame.transformer().rawToEditorLocation(editorLineNumber, message.columnNumber());
      columnNumber = Math.min(columnNumber, editorLocation[1]);
      if (!maxMessage || Workspace.UISourceCode.Message.messageLevelComparator(maxMessage, message) < 0)
        maxMessage = message;
    }
    this._updateWavePosition(editorLineNumber, columnNumber);

    if (this._level === maxMessage.level())
      return;
    if (this._level) {
      this.textEditor.toggleLineClass(
          editorLineNumber, Sources.UISourceCodeFrame._lineClassPerLevel[this._level], false);
      this._icon.type = '';
    }
    this._level = maxMessage.level();
    if (!this._level)
      return;
    this.textEditor.toggleLineClass(editorLineNumber, Sources.UISourceCodeFrame._lineClassPerLevel[this._level], true);
    this._icon.type = Sources.UISourceCodeFrame._iconClassPerLevel[this._level];
  }
};

Workspace.UISourceCode.Message._messageLevelPriority = {
  'Warning': 3,
  'Error': 4
};

/**
 * @param {!Workspace.UISourceCode.Message} a
 * @param {!Workspace.UISourceCode.Message} b
 * @return {number}
 */
Workspace.UISourceCode.Message.messageLevelComparator = function(a, b) {
  return Workspace.UISourceCode.Message._messageLevelPriority[a.level()] -
      Workspace.UISourceCode.Message._messageLevelPriority[b.level()];
};

Sources.UISourceCodeFrame.Plugin = class {
  /**
   * @param {!Workspace.UISourceCode} uiSourceCode
   * @return {boolean}
   */
  static accepts(uiSourceCode) {
    return false;
  }

  wasShown() {
  }

  willHide() {
  }

  /**
   * @return {!Array<!UI.ToolbarItem>}
   */
  rightToolbarItems() {
    return [];
  }

  /**
   * @return {!Array<!UI.ToolbarItem>}
   */
  leftToolbarItems() {
    return [];
  }

  /**
   * @param {!UI.ContextMenu} contextMenu
   * @param {number} lineNumber
   * @return {!Promise}
   */
  populateLineGutterContextMenu(contextMenu, lineNumber) {
    return Promise.resolve();
  }

  /**
   * @param {!UI.ContextMenu} contextMenu
   * @param {number} lineNumber
   * @param {number} columnNumber
   * @return {!Promise}
   */
  populateTextAreaContextMenu(contextMenu, lineNumber, columnNumber) {
    return Promise.resolve();
  }

  dispose() {
  }
};

/** @enum {symbol} */
Sources.UISourceCodeFrame.Events = {
  ToolbarItemsChanged: Symbol('ToolbarItemsChanged')
};
