// Copyright (c) 2015 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
Host.ResourceLoader = {};

Host.ResourceLoader._lastStreamId = 0;
/** @type {!Object.<number, !Common.OutputStream>} */
Host.ResourceLoader._boundStreams = {};

/**
 * @param {!Common.OutputStream} stream
 * @return {number}
 */
Host.ResourceLoader._bindOutputStream = function(stream) {
  Host.ResourceLoader._boundStreams[++Host.ResourceLoader._lastStreamId] = stream;
  return Host.ResourceLoader._lastStreamId;
};

/**
 * @param {number} id
 */
Host.ResourceLoader._discardOutputStream = function(id) {
  Host.ResourceLoader._boundStreams[id].close();
  delete Host.ResourceLoader._boundStreams[id];
};

/**
 * @param {number} id
 * @param {string} chunk
 */
Host.ResourceLoader.streamWrite = function(id, chunk) {
  Host.ResourceLoader._boundStreams[id].write(chunk);
};

/**
 * @param {string} url
 * @param {?Object.<string, string>} headers
 * @param {function(number, !Object.<string, string>, string)} callback
 */
Host.ResourceLoader.load = function(url, headers, callback) {
  const stream = new Common.StringOutputStream();
  Host.ResourceLoader.loadAsStream(url, headers, stream, mycallback);

  /**
   * @param {number} statusCode
   * @param {!Object.<string, string>} headers
   */
  function mycallback(statusCode, headers) {
    callback(statusCode, headers, stream.data());
  }
};

/**
 * @param {string} url
 * @param {?Object.<string, string>} headers
 * @param {!Common.OutputStream} stream
 * @param {function(number, !Object.<string, string>)=} callback
 */
Host.ResourceLoader.loadAsStream = function(url, headers, stream, callback) {
  const streamId = Host.ResourceLoader._bindOutputStream(stream);
  const parsedURL = new Common.ParsedURL(url);
  if (parsedURL.isDataURL()) {
    loadXHR(url).then(dataURLDecodeSuccessful).catch(dataURLDecodeFailed);
    return;
  }

  const rawHeaders = [];
  if (headers) {
    for (const key in headers)
      rawHeaders.push(key + ': ' + headers[key]);
  }
  InspectorFrontendHost.loadNetworkResource(url, rawHeaders.join('\r\n'), streamId, finishedCallback);

  /**
   * @param {!InspectorFrontendHostAPI.LoadNetworkResourceResult} response
   */
  function finishedCallback(response) {
    if (callback)
      callback(response.statusCode, response.headers || {});
    Host.ResourceLoader._discardOutputStream(streamId);
  }

  /**
   * @param {string} text
   */
  function dataURLDecodeSuccessful(text) {
    Host.ResourceLoader.streamWrite(streamId, text);
    finishedCallback(/** @type {!InspectorFrontendHostAPI.LoadNetworkResourceResult} */ ({statusCode: 200}));
  }

  function dataURLDecodeFailed() {
    finishedCallback(/** @type {!InspectorFrontendHostAPI.LoadNetworkResourceResult} */ ({statusCode: 404}));
  }
};
