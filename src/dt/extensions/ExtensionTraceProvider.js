// Copyright 2016 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * @unrestricted
 */
Extensions.ExtensionTraceProvider = class {
  /**
   * @param {string} extensionOrigin
   * @param {string} id
   * @param {string} categoryName
   * @param {string} categoryTooltip
   */
  constructor(extensionOrigin, id, categoryName, categoryTooltip) {
    this._extensionOrigin = extensionOrigin;
    this._id = id;
    this._categoryName = categoryName;
    this._categoryTooltip = categoryTooltip;
  }

  /**
   * @param {!Extensions.TracingSession} session
   */
  start(session) {
    const sessionId = String(++Extensions.ExtensionTraceProvider._lastSessionId);
    Extensions.extensionServer.startTraceRecording(this._id, sessionId, session);
  }

  stop() {
    Extensions.extensionServer.stopTraceRecording(this._id);
  }

  /**
   * @return {string}
   */
  shortDisplayName() {
    return this._categoryName;
  }

  /**
   * @return {string}
   */
  longDisplayName() {
    return this._categoryTooltip;
  }

  /**
   * @return {string}
   */
  persistentIdentifier() {
    return `${this._extensionOrigin}/${this._categoryName}`;
  }
};

Extensions.ExtensionTraceProvider._lastSessionId = 0;

/**
 * @interface
 */
Extensions.TracingSession = function() {};

Extensions.TracingSession.prototype = {
  /**
   * @param {string} url
   * @param {number} timeOffsetMicroseconds
   */
  complete: function(url, timeOffsetMicroseconds) {}
};
