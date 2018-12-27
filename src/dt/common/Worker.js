/*
 * Copyright (C) 2014 Google Inc. All rights reserved.
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
 * @unrestricted
 */
Common.Worker = class {
  /**
   * @param {string} appName
   */
  constructor(appName) {
    let url = appName + '.js';
    url += Runtime.queryParamsString();

    /** @type {!Promise<!Worker>} */
    this._workerPromise = new Promise(fulfill => {
      this._worker = new Worker(url);
      this._worker.onmessage = onMessage.bind(this);

      /**
       * @param {!Event} event
       * @this {Common.Worker}
       */
      function onMessage(event) {
        console.assert(event.data === 'workerReady');
        this._worker.onmessage = null;
        fulfill(this._worker);
        // No need to hold a reference to worker anymore as it's stored in
        // the resolved promise.
        this._worker = null;
      }
    });
  }

  /**
   * @param {*} message
   */
  postMessage(message) {
    this._workerPromise.then(worker => {
      if (!this._disposed)
        worker.postMessage(message);
    });
  }

  dispose() {
    this._disposed = true;
    this._workerPromise.then(worker => worker.terminate());
  }

  terminate() {
    this.dispose();
  }

  /**
   * @param {?function(!MessageEvent<*>)} listener
   */
  set onmessage(listener) {
    this._workerPromise.then(worker => worker.onmessage = listener);
  }

  /**
   * @param {?function(!Event)} listener
   */
  set onerror(listener) {
    this._workerPromise.then(worker => worker.onerror = listener);
  }
};
