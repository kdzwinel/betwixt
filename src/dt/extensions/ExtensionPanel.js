/*
 * Copyright (C) 2012 Google Inc. All rights reserved.
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
 * @implements {UI.Searchable}
 * @unrestricted
 */
Extensions.ExtensionPanel = class extends UI.Panel {
  /**
   * @param {!Extensions.ExtensionServer} server
   * @param {string} panelName
   * @param {string} id
   * @param {string} pageURL
   */
  constructor(server, panelName, id, pageURL) {
    super(panelName);
    this._server = server;
    this._id = id;
    this.setHideOnDetach();
    this._panelToolbar = new UI.Toolbar('hidden', this.element);

    this._searchableView = new UI.SearchableView(this);
    this._searchableView.show(this.element);

    const extensionView = new Extensions.ExtensionView(server, this._id, pageURL, 'extension');
    extensionView.show(this._searchableView.element);
  }

  /**
   * @param {!UI.ToolbarItem} item
   */
  addToolbarItem(item) {
    this._panelToolbar.element.classList.remove('hidden');
    this._panelToolbar.appendToolbarItem(item);
  }

  /**
   * @override
   */
  searchCanceled() {
    this._server.notifySearchAction(this._id, Extensions.extensionAPI.panels.SearchAction.CancelSearch);
    this._searchableView.updateSearchMatchesCount(0);
  }

  /**
   * @override
   * @return {!UI.SearchableView}
   */
  searchableView() {
    return this._searchableView;
  }

  /**
   * @override
   * @param {!UI.SearchableView.SearchConfig} searchConfig
   * @param {boolean} shouldJump
   * @param {boolean=} jumpBackwards
   */
  performSearch(searchConfig, shouldJump, jumpBackwards) {
    const query = searchConfig.query;
    this._server.notifySearchAction(this._id, Extensions.extensionAPI.panels.SearchAction.PerformSearch, query);
  }

  /**
   * @override
   */
  jumpToNextSearchResult() {
    this._server.notifySearchAction(this._id, Extensions.extensionAPI.panels.SearchAction.NextSearchResult);
  }

  /**
   * @override
   */
  jumpToPreviousSearchResult() {
    this._server.notifySearchAction(this._id, Extensions.extensionAPI.panels.SearchAction.PreviousSearchResult);
  }

  /**
   * @override
   * @return {boolean}
   */
  supportsCaseSensitiveSearch() {
    return false;
  }

  /**
   * @override
   * @return {boolean}
   */
  supportsRegexSearch() {
    return false;
  }
};

/**
 * @unrestricted
 */
Extensions.ExtensionButton = class {
  /**
   * @param {!Extensions.ExtensionServer} server
   * @param {string} id
   * @param {string} iconURL
   * @param {string=} tooltip
   * @param {boolean=} disabled
   */
  constructor(server, id, iconURL, tooltip, disabled) {
    this._id = id;

    this._toolbarButton = new UI.ToolbarButton('', '');
    this._toolbarButton.addEventListener(
        UI.ToolbarButton.Events.Click, server.notifyButtonClicked.bind(server, this._id));
    this.update(iconURL, tooltip, disabled);
  }

  /**
   * @param {string} iconURL
   * @param {string=} tooltip
   * @param {boolean=} disabled
   */
  update(iconURL, tooltip, disabled) {
    if (typeof iconURL === 'string')
      this._toolbarButton.setBackgroundImage(iconURL);
    if (typeof tooltip === 'string')
      this._toolbarButton.setTitle(tooltip);
    if (typeof disabled === 'boolean')
      this._toolbarButton.setEnabled(!disabled);
  }

  /**
   * @return {!UI.ToolbarButton}
   */
  toolbarButton() {
    return this._toolbarButton;
  }
};

/**
 * @unrestricted
 */
Extensions.ExtensionSidebarPane = class extends UI.SimpleView {
  /**
   * @param {!Extensions.ExtensionServer} server
   * @param {string} panelName
   * @param {string} title
   * @param {string} id
   */
  constructor(server, panelName, title, id) {
    super(title);
    this.element.classList.add('fill');
    this._panelName = panelName;
    this._server = server;
    this._id = id;
  }

  /**
   * @return {string}
   */
  id() {
    return this._id;
  }

  /**
   * @return {string}
   */
  panelName() {
    return this._panelName;
  }

  /**
   * @param {!Object} object
   * @param {string} title
   * @param {function(?string=)} callback
   */
  setObject(object, title, callback) {
    this._createObjectPropertiesView();
    this._setObject(SDK.RemoteObject.fromLocalObject(object), title, callback);
  }

  /**
   * @param {string} expression
   * @param {string} title
   * @param {!Object} evaluateOptions
   * @param {string} securityOrigin
   * @param {function(?string=)} callback
   */
  setExpression(expression, title, evaluateOptions, securityOrigin, callback) {
    this._createObjectPropertiesView();
    this._server.evaluate(
        expression, true, false, evaluateOptions, securityOrigin, this._onEvaluate.bind(this, title, callback));
  }

  /**
   * @param {string} url
   */
  setPage(url) {
    if (this._objectPropertiesView) {
      this._objectPropertiesView.detach();
      delete this._objectPropertiesView;
    }
    if (this._extensionView)
      this._extensionView.detach(true);

    this._extensionView = new Extensions.ExtensionView(this._server, this._id, url, 'extension fill');
    this._extensionView.show(this.element);

    if (!this.element.style.height)
      this.setHeight('150px');
  }

  /**
   * @param {string} height
   */
  setHeight(height) {
    this.element.style.height = height;
  }

  /**
   * @param {string} title
   * @param {function(?string=)} callback
   * @param {?Protocol.Error} error
   * @param {?SDK.RemoteObject} result
   * @param {boolean=} wasThrown
   */
  _onEvaluate(title, callback, error, result, wasThrown) {
    if (error || !result)
      callback(error.toString());
    else
      this._setObject(result, title, callback);
  }

  _createObjectPropertiesView() {
    if (this._objectPropertiesView)
      return;
    if (this._extensionView) {
      this._extensionView.detach(true);
      delete this._extensionView;
    }
    this._objectPropertiesView = new Extensions.ExtensionNotifierView(this._server, this._id);
    this._objectPropertiesView.show(this.element);
  }

  /**
   * @param {!SDK.RemoteObject} object
   * @param {string} title
   * @param {function(?string=)} callback
   */
  _setObject(object, title, callback) {
    // This may only happen if setPage() was called while we were evaluating the expression.
    if (!this._objectPropertiesView) {
      callback('operation cancelled');
      return;
    }
    this._objectPropertiesView.element.removeChildren();
    UI.Renderer.render(object, {title, editable: false}).then(result => {
      if (!result) {
        callback();
        return;
      }
      if (result.tree && result.tree.firstChild())
        result.tree.firstChild().expand();
      this._objectPropertiesView.element.appendChild(result.node);
      callback();
    });
  }
};
