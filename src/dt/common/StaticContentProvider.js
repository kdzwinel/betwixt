// Copyright 2014 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
/**
 * @implements {Common.ContentProvider}
 * @unrestricted
 */
Common.StaticContentProvider = class {
  /**
   * @param {string} contentURL
   * @param {!Common.ResourceType} contentType
   * @param {function():!Promise<?string>} lazyContent
   */
  constructor(contentURL, contentType, lazyContent) {
    this._contentURL = contentURL;
    this._contentType = contentType;
    this._lazyContent = lazyContent;
  }

  /**
   * @param {string} contentURL
   * @param {!Common.ResourceType} contentType
   * @param {string} content
   * @return {!Common.StaticContentProvider}
   */
  static fromString(contentURL, contentType, content) {
    const lazyContent = () => Promise.resolve(content);
    return new Common.StaticContentProvider(contentURL, contentType, lazyContent);
  }

  /**
   * @override
   * @return {string}
   */
  contentURL() {
    return this._contentURL;
  }

  /**
   * @override
   * @return {!Common.ResourceType}
   */
  contentType() {
    return this._contentType;
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
    return this._lazyContent();
  }

  /**
   * @override
   * @param {string} query
   * @param {boolean} caseSensitive
   * @param {boolean} isRegex
   * @return {!Promise<!Array<!Common.ContentProvider.SearchMatch>>}
   */
  async searchInContent(query, caseSensitive, isRegex) {
    const content = await this._lazyContent();
    return content ? Common.ContentProvider.performSearchInContent(content, query, caseSensitive, isRegex) : [];
  }
};
