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
 * @interface
 */
Bindings.ChunkedReader = function() {};

Bindings.ChunkedReader.prototype = {
  /**
   * @return {number}
   */
  fileSize() {},

  /**
   * @return {number}
   */
  loadedSize() {},

  /**
   * @return {string}
   */
  fileName() {},

  cancel() {},

  /**
   * @return {?FileError}
   */
  error() {}
};

/**
 * @implements {Bindings.ChunkedReader}
 * @unrestricted
 */
Bindings.ChunkedFileReader = class {
  /**
   * @param {!Blob} blob
   * @param {number} chunkSize
   * @param {function(!Bindings.ChunkedReader)=} chunkTransferredCallback
   */
  constructor(blob, chunkSize, chunkTransferredCallback) {
    this._file = blob;
    this._fileSize = blob.size;
    this._loadedSize = 0;
    this._chunkSize = chunkSize;
    this._chunkTransferredCallback = chunkTransferredCallback;
    this._decoder = new TextDecoder();
    this._isCanceled = false;
    /** @type {?FileError} */
    this._error = null;
  }

  /**
   * @param {!Common.OutputStream} output
   * @return {!Promise<boolean>}
   */
  read(output) {
    if (this._chunkTransferredCallback)
      this._chunkTransferredCallback(this);
    this._output = output;
    this._reader = new FileReader();
    this._reader.onload = this._onChunkLoaded.bind(this);
    this._reader.onerror = this._onError.bind(this);
    this._loadChunk();
    return new Promise(resolve => this._transferFinished = resolve);
  }

  /**
   * @override
   */
  cancel() {
    this._isCanceled = true;
  }

  /**
   * @override
   * @return {number}
   */
  loadedSize() {
    return this._loadedSize;
  }

  /**
   * @override
   * @return {number}
   */
  fileSize() {
    return this._fileSize;
  }

  /**
   * @override
   * @return {string}
   */
  fileName() {
    return this._file.name;
  }

  /**
   * @override
   * @return {?FileError}
   */
  error() {
    return this._error;
  }

  /**
   * @param {!Event} event
   */
  _onChunkLoaded(event) {
    if (this._isCanceled)
      return;

    if (event.target.readyState !== FileReader.DONE)
      return;

    const buffer = this._reader.result;
    this._loadedSize += buffer.byteLength;
    const endOfFile = this._loadedSize === this._fileSize;
    const decodedString = this._decoder.decode(buffer, {stream: !endOfFile});
    this._output.write(decodedString);
    if (this._isCanceled)
      return;
    if (this._chunkTransferredCallback)
      this._chunkTransferredCallback(this);

    if (endOfFile) {
      this._file = null;
      this._reader = null;
      this._output.close();
      this._transferFinished(!this._error);
      return;
    }

    this._loadChunk();
  }

  _loadChunk() {
    const chunkStart = this._loadedSize;
    const chunkEnd = Math.min(this._fileSize, chunkStart + this._chunkSize);
    const nextPart = this._file.slice(chunkStart, chunkEnd);
    this._reader.readAsArrayBuffer(nextPart);
  }

  /**
   * @param {!Event} event
   */
  _onError(event) {
    this._error = event.target.error;
    this._transferFinished(false);
  }
};

/**
 * @implements {Common.OutputStream}
 * @unrestricted
 */
Bindings.FileOutputStream = class {
  /**
   * @param {string} fileName
   * @return {!Promise<boolean>}
   */
  async open(fileName) {
    this._closed = false;
    /** @type {!Array<function()>} */
    this._writeCallbacks = [];
    this._fileName = fileName;
    const saveResponse = await Workspace.fileManager.save(this._fileName, '', true);
    if (saveResponse)
      Workspace.fileManager.addEventListener(Workspace.FileManager.Events.AppendedToURL, this._onAppendDone, this);
    return !!saveResponse;
  }

  /**
   * @override
   * @param {string} data
   * @return {!Promise}
   */
  write(data) {
    return new Promise(resolve => {
      this._writeCallbacks.push(resolve);
      Workspace.fileManager.append(this._fileName, data);
    });
  }

  /**
   * @override
   */
  close() {
    this._closed = true;
    if (this._writeCallbacks.length)
      return;
    Workspace.fileManager.removeEventListener(Workspace.FileManager.Events.AppendedToURL, this._onAppendDone, this);
    Workspace.fileManager.close(this._fileName);
  }

  /**
   * @param {!Common.Event} event
   */
  _onAppendDone(event) {
    if (event.data !== this._fileName)
      return;
    this._writeCallbacks.shift()();
    if (this._writeCallbacks.length)
      return;
    if (!this._closed)
      return;
    Workspace.fileManager.removeEventListener(Workspace.FileManager.Events.AppendedToURL, this._onAppendDone, this);
    Workspace.fileManager.close(this._fileName);
  }
};
