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
 * @implements {Common.ContentProvider}
 * @unrestricted
 */
SDK.Script = class {
  /**
   * @param {!SDK.DebuggerModel} debuggerModel
   * @param {string} scriptId
   * @param {string} sourceURL
   * @param {number} startLine
   * @param {number} startColumn
   * @param {number} endLine
   * @param {number} endColumn
   * @param {!Protocol.Runtime.ExecutionContextId} executionContextId
   * @param {string} hash
   * @param {boolean} isContentScript
   * @param {boolean} isLiveEdit
   * @param {string|undefined} sourceMapURL
   * @param {boolean} hasSourceURL
   * @param {number} length
   * @param {?Protocol.Runtime.StackTrace} originStackTrace
   */
  constructor(
      debuggerModel, scriptId, sourceURL, startLine, startColumn, endLine, endColumn, executionContextId, hash,
      isContentScript, isLiveEdit, sourceMapURL, hasSourceURL, length, originStackTrace) {
    this.debuggerModel = debuggerModel;
    this.scriptId = scriptId;
    this.sourceURL = sourceURL;
    this.lineOffset = startLine;
    this.columnOffset = startColumn;
    this.endLine = endLine;
    this.endColumn = endColumn;

    this.executionContextId = executionContextId;
    this.hash = hash;
    this._isContentScript = isContentScript;
    this._isLiveEdit = isLiveEdit;
    this.sourceMapURL = sourceMapURL;
    this.hasSourceURL = hasSourceURL;
    this.contentLength = length;
    this._originalContentProvider = null;
    this._originalSource = null;
    this.originStackTrace = originStackTrace;
  }

  /**
   * @param {string} source
   * @return {string}
   */
  static _trimSourceURLComment(source) {
    let sourceURLIndex = source.lastIndexOf('//# sourceURL=');
    if (sourceURLIndex === -1) {
      sourceURLIndex = source.lastIndexOf('//@ sourceURL=');
      if (sourceURLIndex === -1)
        return source;
    }
    const sourceURLLineIndex = source.lastIndexOf('\n', sourceURLIndex);
    if (sourceURLLineIndex === -1)
      return source;
    const sourceURLLine = source.substr(sourceURLLineIndex + 1).split('\n', 1)[0];
    if (sourceURLLine.search(SDK.Script.sourceURLRegex) === -1)
      return source;
    return source.substr(0, sourceURLLineIndex) + source.substr(sourceURLLineIndex + sourceURLLine.length + 1);
  }

  /**
   * @return {boolean}
   */
  isContentScript() {
    return this._isContentScript;
  }

  /**
   * @return {?SDK.ExecutionContext}
   */
  executionContext() {
    return this.debuggerModel.runtimeModel().executionContext(this.executionContextId);
  }

  /**
   * @return {boolean}
   */
  isLiveEdit() {
    return this._isLiveEdit;
  }

  /**
   * @override
   * @return {string}
   */
  contentURL() {
    return this.sourceURL;
  }

  /**
   * @override
   * @return {!Common.ResourceType}
   */
  contentType() {
    return Common.resourceTypes.Script;
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
  async requestContent() {
    if (this._source)
      return this._source;
    if (!this.scriptId)
      return '';
    const source = await this.debuggerModel.target().debuggerAgent().getScriptSource(this.scriptId);
    if (source && this.hasSourceURL)
      this._source = SDK.Script._trimSourceURLComment(source);
    else
      this._source = source || '';
    if (this._originalSource === null)
      this._originalSource = this._source;
    return this._source;
  }

  /**
   * @return {!Common.ContentProvider}
   */
  originalContentProvider() {
    if (!this._originalContentProvider) {
      const lazyContent = () => this.requestContent().then(() => this._originalSource);
      this._originalContentProvider =
          new Common.StaticContentProvider(this.contentURL(), this.contentType(), lazyContent);
    }
    return this._originalContentProvider;
  }

  /**
   * @override
   * @param {string} query
   * @param {boolean} caseSensitive
   * @param {boolean} isRegex
   * @return {!Promise<!Array<!Common.ContentProvider.SearchMatch>>}
   */
  async searchInContent(query, caseSensitive, isRegex) {
    if (!this.scriptId)
      return [];

    const matches =
        await this.debuggerModel.target().debuggerAgent().searchInContent(this.scriptId, query, caseSensitive, isRegex);
    return (matches || []).map(match => new Common.ContentProvider.SearchMatch(match.lineNumber, match.lineContent));
  }

  /**
   * @param {string} source
   * @return {string}
   */
  _appendSourceURLCommentIfNeeded(source) {
    if (!this.hasSourceURL)
      return source;
    return source + '\n //# sourceURL=' + this.sourceURL;
  }

  /**
   * @param {string} newSource
   * @param {function(?Protocol.Error, !Protocol.Runtime.ExceptionDetails=, !Array.<!Protocol.Debugger.CallFrame>=, !Protocol.Runtime.StackTrace=, !Protocol.Runtime.StackTraceId=, boolean=)} callback
   */
  async editSource(newSource, callback) {
    newSource = SDK.Script._trimSourceURLComment(newSource);
    // We append correct sourceURL to script for consistency only. It's not actually needed for things to work correctly.
    newSource = this._appendSourceURLCommentIfNeeded(newSource);

    if (!this.scriptId) {
      callback('Script failed to parse');
      return;
    }

    await this.requestContent();
    if (this._source === newSource) {
      callback(null);
      return;
    }
    const response = await this.debuggerModel.target().debuggerAgent().invoke_setScriptSource(
        {scriptId: this.scriptId, scriptSource: newSource});

    if (!response[Protocol.Error] && !response.exceptionDetails)
      this._source = newSource;

    const needsStepIn = !!response.stackChanged;
    callback(
        response[Protocol.Error], response.exceptionDetails, response.callFrames, response.asyncStackTrace,
        response.asyncStackTraceId, needsStepIn);
  }

  /**
   * @param {number} lineNumber
   * @param {number=} columnNumber
   * @return {!SDK.DebuggerModel.Location}
   */
  rawLocation(lineNumber, columnNumber) {
    return new SDK.DebuggerModel.Location(this.debuggerModel, this.scriptId, lineNumber, columnNumber || 0);
  }

  /**
   * @return {boolean}
   */
  isInlineScript() {
    const startsAtZero = !this.lineOffset && !this.columnOffset;
    return !!this.sourceURL && !startsAtZero;
  }

  /**
   * @return {boolean}
   */
  isAnonymousScript() {
    return !this.sourceURL;
  }

  /**
   * @return {boolean}
   */
  isInlineScriptWithSourceURL() {
    return !!this.hasSourceURL && this.isInlineScript();
  }

  /**
   * @param {!Array<!Protocol.Debugger.ScriptPosition>} positions
   * @return {!Promise<boolean>}
   */
  async setBlackboxedRanges(positions) {
    const response = await this.debuggerModel.target().debuggerAgent().invoke_setBlackboxedRanges(
        {scriptId: this.scriptId, positions});
    return !response[Protocol.Error];
  }
};

SDK.Script.sourceURLRegex = /^[\040\t]*\/\/[@#] sourceURL=\s*(\S*?)\s*$/m;
