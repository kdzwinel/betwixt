// Copyright 2014 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

Layers.LayerPaintProfilerView = class extends UI.SplitWidget {
  /**
   * @param {function(string=)} showImageCallback
   */
  constructor(showImageCallback) {
    super(true, false);

    this._logTreeView = new LayerViewer.PaintProfilerCommandLogView();
    this.setSidebarWidget(this._logTreeView);
    this._paintProfilerView = new LayerViewer.PaintProfilerView(showImageCallback);
    this.setMainWidget(this._paintProfilerView);

    this._paintProfilerView.addEventListener(
        LayerViewer.PaintProfilerView.Events.WindowChanged, this._onWindowChanged, this);
  }

  reset() {
    this._paintProfilerView.setSnapshotAndLog(null, [], null);
  }

  /**
   * @param {!SDK.PaintProfilerSnapshot} snapshot
   */
  profile(snapshot) {
    snapshot.commandLog().then(log => setSnapshotAndLog.call(this, snapshot, log));

    /**
     * @param {?SDK.PaintProfilerSnapshot} snapshot
     * @param {?Array<!SDK.PaintProfilerLogItem>} log
     * @this {Layers.LayerPaintProfilerView}
     */
    function setSnapshotAndLog(snapshot, log) {
      this._logTreeView.setCommandLog(log || []);
      this._paintProfilerView.setSnapshotAndLog(snapshot, log || [], null);
      if (snapshot)
        snapshot.release();
    }
  }

  /**
   * @param {number} scale
   */
  setScale(scale) {
    this._paintProfilerView.setScale(scale);
  }

  _onWindowChanged() {
    this._logTreeView.updateWindow(this._paintProfilerView.selectionWindow());
  }
};
