/*
 * Copyright (C) 2013 Google Inc. All rights reserved.
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

Bindings.TempFile = class {
  constructor() {
    /** @type {?Blob} */
    this._lastBlob = null;
  }

  /**
   * @param {!Array<string|!Blob>} pieces
   */
  write(pieces) {
    if (this._lastBlob)
      pieces.unshift(this._lastBlob);
    this._lastBlob = new Blob(pieces, {type: 'text/plain'});
  }

  /**
   * @return {!Promise<?string>}
   */
  read() {
    return this.readRange();
  }

  /**
   * @return {number}
   */
  size() {
    return this._lastBlob ? this._lastBlob.size : 0;
  }

  /**
   * @param {number=} startOffset
   * @param {number=} endOffset
   * @return {!Promise<?string>}
   */
  async readRange(startOffset, endOffset) {
    if (!this._lastBlob) {
      Common.console.error('Attempt to read a temp file that was never written');
      return Promise.resolve('');
    }
    const blob = typeof startOffset === 'number' || typeof endOffset === 'number' ?
        this._lastBlob.slice(/** @type {number} */ (startOffset), /** @type {number} */ (endOffset)) :
        this._lastBlob;

    const reader = new FileReader();
    try {
      await new Promise((resolve, reject) => {
        reader.onloadend = resolve;
        reader.onerror = reject;
        reader.readAsText(blob);
      });
    } catch (error) {
      Common.console.error('Failed to read from temp file: ' + error.message);
    }

    return reader.result;
  }

  /**
   * @param {!Common.OutputStream} outputStream
   * @param {function(!Bindings.ChunkedReader)=} progress
   * @return {!Promise<?FileError>}
   */
  copyToOutputStream(outputStream, progress) {
    if (!this._lastBlob) {
      outputStream.close();
      return Promise.resolve(/** @type {?FileError} */ (null));
    }
    const reader = new Bindings.ChunkedFileReader(/** @type {!Blob} */ (this._lastBlob), 10 * 1000 * 1000, progress);
    return reader.read(outputStream).then(success => success ? null : reader.error());
  }

  remove() {
    this._lastBlob = null;
  }
};

/**
 * @implements {SDK.BackingStorage}
 */
Bindings.TempFileBackingStorage = class {
  constructor() {
    /** @type {?Bindings.TempFile} */
    this._file = null;
    /** @type {!Array<string>} */
    this._strings;
    /** @type {number} */
    this._stringsLength;
    this.reset();
  }

  /**
   * @override
   * @param {string} string
   */
  appendString(string) {
    this._strings.push(string);
    this._stringsLength += string.length;
    const flushStringLength = 10 * 1024 * 1024;
    if (this._stringsLength > flushStringLength)
      this._flush();
  }

  /**
   * @override
   * @param {string} string
   * @return {function():!Promise<?string>}
   */
  appendAccessibleString(string) {
    this._flush();
    const startOffset = this._file.size();
    this._strings.push(string);
    this._flush();
    return this._file.readRange.bind(this._file, startOffset, this._file.size());
  }

  _flush() {
    if (!this._strings.length)
      return;
    if (!this._file)
      this._file = new Bindings.TempFile();
    this._stringsLength = 0;
    this._file.write(this._strings.splice(0));
  }

  /**
   * @override
   */
  finishWriting() {
    this._flush();
  }

  /**
   * @override
   */
  reset() {
    if (this._file)
      this._file.remove();
    this._file = null;
    /** @type {!Array<string>} */
    this._strings = [];
    this._stringsLength = 0;
  }

  /**
   * @param {!Common.OutputStream} outputStream
   * @return {!Promise<?FileError>}
   */
  writeToStream(outputStream) {
    return this._file ? this._file.copyToOutputStream(outputStream) : Promise.resolve(null);
  }
};

/**
 * @typedef {{
 *      startOffset: number,
 *      endOffset: number
 * }}
 */
Bindings.TempFileBackingStorage.Chunk;
