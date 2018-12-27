// Copyright (c) 2015 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
/**
 * @implements {UI.ListWidget.Delegate<SDK.NetworkManager.BlockedPattern>}
 */
Network.BlockedURLsPane = class extends UI.VBox {
  constructor() {
    super(true);
    this.registerRequiredCSS('network/blockedURLsPane.css');

    Network.BlockedURLsPane._instance = this;
    this._manager = SDK.multitargetNetworkManager;
    this._manager.addEventListener(SDK.MultitargetNetworkManager.Events.BlockedPatternsChanged, this._update, this);

    this._toolbar = new UI.Toolbar('', this.contentElement);
    this._enabledCheckbox =
        new UI.ToolbarCheckbox(Common.UIString('Enable request blocking'), undefined, this._toggleEnabled.bind(this));
    this._toolbar.appendToolbarItem(this._enabledCheckbox);
    this._toolbar.appendSeparator();
    const addButton = new UI.ToolbarButton(Common.UIString('Add pattern'), 'largeicon-add');
    addButton.addEventListener(UI.ToolbarButton.Events.Click, this._addButtonClicked, this);
    this._toolbar.appendToolbarItem(addButton);
    const clearButton = new UI.ToolbarButton(Common.UIString('Remove all patterns'), 'largeicon-clear');
    clearButton.addEventListener(UI.ToolbarButton.Events.Click, this._removeAll, this);
    this._toolbar.appendToolbarItem(clearButton);

    /** @type {!UI.ListWidget<!SDK.NetworkManager.BlockedPattern>} */
    this._list = new UI.ListWidget(this);
    this._list.element.classList.add('blocked-urls');
    this._list.registerRequiredCSS('network/blockedURLsPane.css');
    this._list.setEmptyPlaceholder(this._createEmptyPlaceholder());
    this._list.show(this.contentElement);

    /** @type {?UI.ListWidget.Editor<!SDK.NetworkManager.BlockedPattern>} */
    this._editor = null;

    /** @type {!Map<string, number>} */
    this._blockedCountForUrl = new Map();
    SDK.targetManager.addModelListener(
        SDK.NetworkManager, SDK.NetworkManager.Events.RequestFinished, this._onRequestFinished, this);

    this._updateThrottler = new Common.Throttler(200);

    this._update();
  }

  /**
   * @return {!Element}
   */
  _createEmptyPlaceholder() {
    const element = this.contentElement.createChild('div', 'no-blocked-urls');
    element.createChild('span').textContent = Common.UIString('Requests are not blocked. ');
    const addLink = element.createChild('span', 'link');
    addLink.textContent = Common.UIString('Add pattern.');
    addLink.href = '';
    addLink.addEventListener('click', this._addButtonClicked.bind(this), false);
    return element;
  }

  static reset() {
    if (Network.BlockedURLsPane._instance)
      Network.BlockedURLsPane._instance.reset();
  }

  _addButtonClicked() {
    this._manager.setBlockingEnabled(true);
    this._list.addNewItem(0, {url: '', enabled: true});
  }

  /**
   * @override
   * @param {!SDK.NetworkManager.BlockedPattern} pattern
   * @param {boolean} editable
   * @return {!Element}
   */
  renderItem(pattern, editable) {
    const count = this._blockedRequestsCount(pattern.url);
    const element = createElementWithClass('div', 'blocked-url');
    const checkbox = element.createChild('input', 'blocked-url-checkbox');
    checkbox.type = 'checkbox';
    checkbox.checked = pattern.enabled;
    checkbox.disabled = !this._manager.blockingEnabled();
    element.createChild('div', 'blocked-url-label').textContent = pattern.url;
    element.createChild('div', 'blocked-url-count').textContent = Common.UIString('%d blocked', count);
    element.addEventListener('click', event => this._togglePattern(pattern, event), false);
    checkbox.addEventListener('click', event => this._togglePattern(pattern, event), false);
    return element;
  }

  /**
   * @param {!SDK.NetworkManager.BlockedPattern} pattern
   * @param {!Event} event
   */
  _togglePattern(pattern, event) {
    event.consume(true);
    const patterns = this._manager.blockedPatterns();
    patterns.splice(patterns.indexOf(pattern), 1, {enabled: !pattern.enabled, url: pattern.url});
    this._manager.setBlockedPatterns(patterns);
  }

  _toggleEnabled() {
    this._manager.setBlockingEnabled(!this._manager.blockingEnabled());
    this._update();
  }

  /**
   * @override
   * @param {!SDK.NetworkManager.BlockedPattern} pattern
   * @param {number} index
   */
  removeItemRequested(pattern, index) {
    const patterns = this._manager.blockedPatterns();
    patterns.splice(index, 1);
    this._manager.setBlockedPatterns(patterns);
  }

  /**
   * @override
   * @param {!SDK.NetworkManager.BlockedPattern} pattern
   * @return {!UI.ListWidget.Editor}
   */
  beginEdit(pattern) {
    this._editor = this._createEditor();
    this._editor.control('url').value = pattern.url;
    return this._editor;
  }

  /**
   * @override
   * @param {!SDK.NetworkManager.BlockedPattern} item
   * @param {!UI.ListWidget.Editor} editor
   * @param {boolean} isNew
   */
  commitEdit(item, editor, isNew) {
    const url = editor.control('url').value;
    const patterns = this._manager.blockedPatterns();
    if (isNew)
      patterns.push({enabled: true, url: url});
    else
      patterns.splice(patterns.indexOf(item), 1, {enabled: true, url: url});

    this._manager.setBlockedPatterns(patterns);
  }

  /**
   * @return {!UI.ListWidget.Editor<!SDK.NetworkManager.BlockedPattern>}
   */
  _createEditor() {
    if (this._editor)
      return this._editor;

    const editor = new UI.ListWidget.Editor();
    const content = editor.contentElement();
    const titles = content.createChild('div', 'blocked-url-edit-row');
    titles.createChild('div').textContent =
        Common.UIString('Text pattern to block matching requests; use * for wildcard');
    const fields = content.createChild('div', 'blocked-url-edit-row');
    const urlInput = editor.createInput(
        'url', 'text', '',
        (item, index, input) =>
            !!input.value && !this._manager.blockedPatterns().find(pattern => pattern.url === input.value));
    fields.createChild('div', 'blocked-url-edit-value').appendChild(urlInput);
    return editor;
  }

  _removeAll() {
    this._manager.setBlockedPatterns([]);
  }

  /**
   * @return {!Promise<?>}
   */
  _update() {
    const enabled = this._manager.blockingEnabled();
    this._list.element.classList.toggle('blocking-disabled', !enabled && !!this._manager.blockedPatterns().length);
    this._enabledCheckbox.setChecked(enabled);
    this._list.clear();
    for (const pattern of this._manager.blockedPatterns())
      this._list.appendItem(pattern, true);
    return Promise.resolve();
  }

  /**
   * @param {string} url
   * @return {number}
   */
  _blockedRequestsCount(url) {
    if (!url)
      return 0;

    let result = 0;
    for (const blockedUrl of this._blockedCountForUrl.keys()) {
      if (this._matches(url, blockedUrl))
        result += this._blockedCountForUrl.get(blockedUrl);
    }
    return result;
  }

  /**
   * @param {string} pattern
   * @param {string} url
   * @return {boolean}
   */
  _matches(pattern, url) {
    let pos = 0;
    const parts = pattern.split('*');
    for (let index = 0; index < parts.length; index++) {
      const part = parts[index];
      if (!part.length)
        continue;
      pos = url.indexOf(part, pos);
      if (pos === -1)
        return false;
      pos += part.length;
    }
    return true;
  }

  reset() {
    this._blockedCountForUrl.clear();
    this._updateThrottler.schedule(this._update.bind(this));
  }

  /**
   * @param {!Common.Event} event
   */
  _onRequestFinished(event) {
    const request = /** @type {!SDK.NetworkRequest} */ (event.data);
    if (request.wasBlocked()) {
      const count = this._blockedCountForUrl.get(request.url()) || 0;
      this._blockedCountForUrl.set(request.url(), count + 1);
      this._updateThrottler.schedule(this._update.bind(this));
    }
  }
};

/** @type {?Network.BlockedURLsPane} */
Network.BlockedURLsPane._instance = null;
