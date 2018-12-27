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
 * @implements {Common.ContentProvider}
 * @unrestricted
 */
SDK.CompilerSourceMappingContentProvider = class {
  /**
   * @param {string} sourceURL
   * @param {!Common.ResourceType} contentType
   */
  constructor(sourceURL, contentType) {
    this._sourceURL = sourceURL;
    this._contentType = contentType;
  }

  /**
   * @override
   * @return {string}
   */
  contentURL() {
    return this._sourceURL;
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
    let callback;
    const promise = new Promise(fulfill => callback = fulfill);
    SDK.multitargetNetworkManager.loadResource(this._sourceURL, contentLoaded.bind(this));
    return promise;

    /**
     * @param {number} statusCode
     * @param {!Object.<string, string>} headers
     * @param {string} content
     * @this {SDK.CompilerSourceMappingContentProvider}
     */
    function contentLoaded(statusCode, headers, content) {
      if (statusCode >= 400) {
        console.error(
            'Could not load content for ' + this._sourceURL + ' : ' +
            'HTTP status code: ' + statusCode);
        callback(null);
        return;
      }

      callback(content);
    }
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
    if (typeof content !== 'string')
      return [];
    return Common.ContentProvider.performSearchInContent(content, query, caseSensitive, isRegex);
  }
};
