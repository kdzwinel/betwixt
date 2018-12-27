// Copyright 2015 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * @interface
 */
Common.OutputStream = function() {};

Common.OutputStream.prototype = {
  /**
   * @param {string} data
   * @return {!Promise}
   */
  write(data) {},

  close() {}
};

/**
 * @implements {Common.OutputStream}
 */
Common.StringOutputStream = class {
  constructor() {
    this._data = '';
  }

  /**
   * @override
   * @param {string} chunk
   * @return {!Promise}
   */
  async write(chunk) {
    this._data += chunk;
  }

  /**
   * @override
   */
  close() {
  }

  /**
   * @return {string}
   */
  data() {
    return this._data;
  }
};
