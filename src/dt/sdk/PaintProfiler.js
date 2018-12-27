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

SDK.PaintProfilerModel = class extends SDK.SDKModel {
  /**
   * @param {!SDK.Target} target
   */
  constructor(target) {
    super(target);
    this._layerTreeAgent = target.layerTreeAgent();
  }

  /**
   * @param {!Array.<!SDK.PictureFragment>} fragments
   * @return {!Promise<?SDK.PaintProfilerSnapshot>}
   */
  async loadSnapshotFromFragments(fragments) {
    const snapshotId = await this._layerTreeAgent.loadSnapshot(fragments);
    return snapshotId && new SDK.PaintProfilerSnapshot(this, snapshotId);
  }

  /**
   * @param {string} encodedPicture
   * @return {!Promise<?SDK.PaintProfilerSnapshot>}
   */
  loadSnapshot(encodedPicture) {
    const fragment = {x: 0, y: 0, picture: encodedPicture};
    return this.loadSnapshotFromFragments([fragment]);
  }

  /**
   * @param {string} layerId
   * @return {!Promise<?SDK.PaintProfilerSnapshot>}
   */
  async makeSnapshot(layerId) {
    const snapshotId = await this._layerTreeAgent.makeSnapshot(layerId);
    return snapshotId && new SDK.PaintProfilerSnapshot(this, snapshotId);
  }
};

SDK.SDKModel.register(SDK.PaintProfilerModel, SDK.Target.Capability.DOM, false);

/**
 * @typedef {!{x: number, y: number, picture: string}}
 */
SDK.PictureFragment;

SDK.PaintProfilerSnapshot = class {
  /**
   * @param {!SDK.PaintProfilerModel} paintProfilerModel
   * @param {string} snapshotId
   */
  constructor(paintProfilerModel, snapshotId) {
    this._paintProfilerModel = paintProfilerModel;
    this._id = snapshotId;
    this._refCount = 1;
  }

  release() {
    console.assert(this._refCount > 0, 'release is already called on the object');
    if (!--this._refCount)
      this._paintProfilerModel._layerTreeAgent.releaseSnapshot(this._id);
  }

  addReference() {
    ++this._refCount;
    console.assert(this._refCount > 0, 'Referencing a dead object');
  }

  /**
   * @param {number=} scale
   * @param {number=} firstStep
   * @param {number=} lastStep
   * @return {!Promise<?string>}
   */
  replay(scale, firstStep, lastStep) {
    return this._paintProfilerModel._layerTreeAgent.replaySnapshot(this._id, firstStep, lastStep, scale || 1.0);
  }

  /**
   * @param {?Protocol.DOM.Rect} clipRect
   * @return {!Promise<?Array<!Protocol.LayerTree.PaintProfile>>}
   */
  profile(clipRect) {
    return this._paintProfilerModel._layerTreeAgent.profileSnapshot(this._id, 5, 1, clipRect || undefined);
  }

  /**
   * @return {!Promise<?Array<!SDK.PaintProfilerLogItem>>}
   */
  async commandLog() {
    const log = await this._paintProfilerModel._layerTreeAgent.snapshotCommandLog(this._id);
    return log && log.map((entry, index) => new SDK.PaintProfilerLogItem(entry, index));
  }
};

/**
 * @typedef {!{method: string, params: ?Object<string, *>}}
 */
SDK.RawPaintProfilerLogItem;

/**
 * @unrestricted
 */
SDK.PaintProfilerLogItem = class {
  /**
   * @param {!SDK.RawPaintProfilerLogItem} rawEntry
   * @param {number} commandIndex
   */
  constructor(rawEntry, commandIndex) {
    this.method = rawEntry.method;
    this.params = rawEntry.params;
    this.commandIndex = commandIndex;
  }
};
