// Copyright 2016 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
/**
 * @implements {Common.ContentProvider}
 * @unrestricted
 */
SDK.CSSStyleSheetHeader = class {
  /**
   * @param {!SDK.CSSModel} cssModel
   * @param {!Protocol.CSS.CSSStyleSheetHeader} payload
   */
  constructor(cssModel, payload) {
    this._cssModel = cssModel;
    this.id = payload.styleSheetId;
    this.frameId = payload.frameId;
    this.sourceURL = payload.sourceURL;
    this.hasSourceURL = !!payload.hasSourceURL;
    this.origin = payload.origin;
    this.title = payload.title;
    this.disabled = payload.disabled;
    this.isInline = payload.isInline;
    this.startLine = payload.startLine;
    this.startColumn = payload.startColumn;
    this.contentLength = payload.length;
    if (payload.ownerNode)
      this.ownerNode = new SDK.DeferredDOMNode(cssModel.target(), payload.ownerNode);
    this.setSourceMapURL(payload.sourceMapURL);
  }

  /**
   * @return {!Common.ContentProvider}
   */
  originalContentProvider() {
    if (!this._originalContentProvider) {
      const lazyContent = this._cssModel.originalStyleSheetText.bind(this._cssModel, this);
      this._originalContentProvider = new Common.StaticContentProvider(
          this.contentURL(), this.contentType(), /** @type {function():!Promise<?string>} */ (lazyContent));
    }
    return this._originalContentProvider;
  }

  /**
   * @param {string=} sourceMapURL
   */
  setSourceMapURL(sourceMapURL) {
    this.sourceMapURL = sourceMapURL;
  }

  /**
   * @return {!SDK.CSSModel}
   */
  cssModel() {
    return this._cssModel;
  }

  /**
   * @return {boolean}
   */
  isAnonymousInlineStyleSheet() {
    return !this.resourceURL() && !this._cssModel.sourceMapManager().sourceMapForClient(this);
  }

  /**
   * @return {string}
   */
  resourceURL() {
    return this.isViaInspector() ? this._viaInspectorResourceURL() : this.sourceURL;
  }

  /**
   * @return {string}
   */
  _viaInspectorResourceURL() {
    const frame = this._cssModel.target().model(SDK.ResourceTreeModel).frameForId(this.frameId);
    console.assert(frame);
    const parsedURL = new Common.ParsedURL(frame.url);
    let fakeURL = 'inspector://' + parsedURL.host + parsedURL.folderPathComponents;
    if (!fakeURL.endsWith('/'))
      fakeURL += '/';
    fakeURL += 'inspector-stylesheet';
    return fakeURL;
  }

  /**
   * @param {number} lineNumberInStyleSheet
   * @return {number}
   */
  lineNumberInSource(lineNumberInStyleSheet) {
    return this.startLine + lineNumberInStyleSheet;
  }

  /**
   * @param {number} lineNumberInStyleSheet
   * @param {number} columnNumberInStyleSheet
   * @return {number|undefined}
   */
  columnNumberInSource(lineNumberInStyleSheet, columnNumberInStyleSheet) {
    return (lineNumberInStyleSheet ? 0 : this.startColumn) + columnNumberInStyleSheet;
  }

  /**
   * @override
   * @return {string}
   */
  contentURL() {
    return this.resourceURL();
  }

  /**
   * @override
   * @return {!Common.ResourceType}
   */
  contentType() {
    return Common.resourceTypes.Stylesheet;
  }

  /**
   * @override
   * @return {!Promise<boolean>}
   */
  contentEncoded() {
    return Promise.resolve(false);
  }

  /**
   * @override
   * @return {!Promise<?string>}
   */
  requestContent() {
    return this._cssModel.getStyleSheetText(this.id);
  }

  /**
   * @override
   * @param {string} query
   * @param {boolean} caseSensitive
   * @param {boolean} isRegex
   * @return {!Promise<!Array<!Common.ContentProvider.SearchMatch>>}
   */
  async searchInContent(query, caseSensitive, isRegex) {
    const content = await this.requestContent();
    return Common.ContentProvider.performSearchInContent(content, query, caseSensitive, isRegex);
  }

  /**
   * @return {boolean}
   */
  isViaInspector() {
    return this.origin === 'inspector';
  }
};
