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
 * @unrestricted
 */
HeapSnapshotWorker.HeapSnapshotLoader = class {
  /**
   * @param {!HeapSnapshotWorker.HeapSnapshotWorkerDispatcher} dispatcher
   */
  constructor(dispatcher) {
    this._reset();
    this._progress = new HeapSnapshotWorker.HeapSnapshotProgress(dispatcher);
    this._buffer = '';
    this._dataCallback = null;
    this._done = false;
    this._parseInput();
  }

  dispose() {
    this._reset();
  }

  _reset() {
    this._json = '';
    this._snapshot = {};
  }

  close() {
    this._done = true;
    if (this._dataCallback)
      this._dataCallback('');
  }

  /**
   * @return {!HeapSnapshotWorker.JSHeapSnapshot}
   */
  buildSnapshot() {
    this._progress.updateStatus(ls`Processing snapshot\u2026`);
    const result = new HeapSnapshotWorker.JSHeapSnapshot(this._snapshot, this._progress);
    this._reset();
    return result;
  }

  _parseUintArray() {
    let index = 0;
    const char0 = '0'.charCodeAt(0);
    const char9 = '9'.charCodeAt(0);
    const closingBracket = ']'.charCodeAt(0);
    const length = this._json.length;
    while (true) {
      while (index < length) {
        const code = this._json.charCodeAt(index);
        if (char0 <= code && code <= char9) {
          break;
        } else if (code === closingBracket) {
          this._json = this._json.slice(index + 1);
          return false;
        }
        ++index;
      }
      if (index === length) {
        this._json = '';
        return true;
      }
      let nextNumber = 0;
      const startIndex = index;
      while (index < length) {
        const code = this._json.charCodeAt(index);
        if (char0 > code || code > char9)
          break;
        nextNumber *= 10;
        nextNumber += (code - char0);
        ++index;
      }
      if (index === length) {
        this._json = this._json.slice(startIndex);
        return true;
      }
      this._array[this._arrayIndex++] = nextNumber;
    }
  }

  _parseStringsArray() {
    this._progress.updateStatus('Parsing strings\u2026');
    const closingBracketIndex = this._json.lastIndexOf(']');
    if (closingBracketIndex === -1)
      throw new Error('Incomplete JSON');
    this._json = this._json.slice(0, closingBracketIndex + 1);
    this._snapshot.strings = JSON.parse(this._json);
  }

  /**
   * @param {string} chunk
   */
  write(chunk) {
    this._buffer += chunk;
    if (!this._dataCallback)
      return;
    this._dataCallback(this._buffer);
    this._dataCallback = null;
    this._buffer = '';
  }

  /**
   * @return {!Promise<string>}
   */
  _fetchChunk() {
    return this._done ? Promise.resolve(this._buffer) : new Promise(r => this._dataCallback = r);
  }

  /**
   * @param {string} token
   * @param {number=} startIndex
   * @return {!Promise<number>}
   */
  async _findToken(token, startIndex) {
    while (true) {
      const pos = this._json.indexOf(token, startIndex || 0);
      if (pos !== -1)
        return pos;
      startIndex = this._json.length - token.length + 1;
      this._json += await this._fetchChunk();
    }
  }

  /**
   * @param {string} name
   * @param {string} title
   * @param {number=} length
   * @return {!Promise<!Uint32Array|!Array<number>>}
   */
  async _parseArray(name, title, length) {
    const nameIndex = await this._findToken(name);
    const bracketIndex = await this._findToken('[', nameIndex);
    this._json = this._json.slice(bracketIndex + 1);
    this._array = length ? new Uint32Array(length) : [];
    this._arrayIndex = 0;
    while (this._parseUintArray()) {
      this._progress.updateProgress(title, this._arrayIndex, this._array.length);
      this._json += await this._fetchChunk();
    }
    const result = this._array;
    this._array = null;
    return result;
  }

  async _parseInput() {
    const snapshotToken = '"snapshot"';
    const snapshotTokenIndex = await this._findToken(snapshotToken);
    if (snapshotTokenIndex === -1)
      throw new Error('Snapshot token not found');

    this._progress.updateStatus(ls`Loading snapshot info\u2026`);
    const json = this._json.slice(snapshotTokenIndex + snapshotToken.length + 1);
    this._jsonTokenizer = new TextUtils.TextUtils.BalancedJSONTokenizer(metaJSON => {
      this._json = this._jsonTokenizer.remainder();
      this._jsonTokenizer = null;
      this._snapshot.snapshot = /** @type {!HeapSnapshotHeader} */ (JSON.parse(metaJSON));
    });
    this._jsonTokenizer.write(json);
    while (this._jsonTokenizer)
      this._jsonTokenizer.write(await this._fetchChunk());

    this._snapshot.nodes = await this._parseArray(
        '"nodes"', ls`Loading nodes\u2026 %d%%`,
        this._snapshot.snapshot.meta.node_fields.length * this._snapshot.snapshot.node_count);

    this._snapshot.edges = await this._parseArray(
        '"edges"', ls`Loading edges\u2026 %d%%`,
        this._snapshot.snapshot.meta.edge_fields.length * this._snapshot.snapshot.edge_count);

    // If there is allocation info parse it, otherwise jump straight to strings.
    if (this._snapshot.snapshot.trace_function_count) {
      this._snapshot.trace_function_infos = await this._parseArray(
          '"trace_function_infos"', ls`Loading allocation traces\u2026 %d%%`,
          this._snapshot.snapshot.meta.trace_function_info_fields.length *
              this._snapshot.snapshot.trace_function_count);

      const nextToken = this._snapshot.snapshot.meta.sample_fields ? '"samples"' : '"strings"';
      const nextTokenIndex = await this._findToken(nextToken);
      const bracketIndex = this._json.lastIndexOf(']', nextTokenIndex);
      this._snapshot.trace_tree = JSON.parse(this._json.substring(0, bracketIndex + 1));
      this._json = this._json.slice(bracketIndex + 1);
    }

    if (this._snapshot.snapshot.meta.sample_fields)
      this._snapshot.samples = await this._parseArray('"samples"', ls`Loading samples\u2026`);

    if (this._snapshot.snapshot.meta['location_fields'])
      this._snapshot.locations = await this._parseArray('"locations"', ls`Loading locations\u2026`);
    else
      this._snapshot.locations = [];

    this._progress.updateStatus(ls`Loading strings\u2026`);
    const stringsTokenIndex = await this._findToken('"strings"');
    const bracketIndex = await this._findToken('[', stringsTokenIndex);
    this._json = this._json.slice(bracketIndex);
    while (!this._done)
      this._json += await this._fetchChunk();
    this._parseStringsArray();
  }
};
