// Copyright 2017 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * @implements {Network.GroupLookupInterface}
 */
Network.NetworkFrameGrouper = class {
  /**
   * @param {!Network.NetworkLogView} parentView
   */
  constructor(parentView) {
    this._parentView = parentView;
    /** @type {!Map<!SDK.ResourceTreeFrame, !Network.FrameGroupNode>} */
    this._activeGroups = new Map();
  }

  /**
   * @override
   * @param {!SDK.NetworkRequest} request
   * @return {?Network.NetworkGroupNode}
   */
  groupNodeForRequest(request) {
    const frame = SDK.ResourceTreeModel.frameForRequest(request);
    if (!frame || frame.isTopFrame())
      return null;
    let groupNode = this._activeGroups.get(frame);
    if (groupNode)
      return groupNode;
    groupNode = new Network.FrameGroupNode(this._parentView, frame);
    this._activeGroups.set(frame, groupNode);
    return groupNode;
  }

  /**
   * @override
   */
  reset() {
    this._activeGroups.clear();
  }
};

Network.FrameGroupNode = class extends Network.NetworkGroupNode {
  /**
   * @param {!Network.NetworkLogView} parentView
   * @param {!SDK.ResourceTreeFrame} frame
   */
  constructor(parentView, frame) {
    super(parentView);
    this._frame = frame;
    /** @type {?Element} */
    this._productBadge = null;
  }

  /**
   * @override
   */
  displayName() {
    return new Common.ParsedURL(this._frame.url).domain() || this._frame.name || '<iframe>';
  }

  /**
   * @override
   * @param {!Element} cell
   * @param {string} columnId
   */
  renderCell(cell, columnId) {
    super.renderCell(cell, columnId);
    if (columnId === 'name') {
      const name = this.displayName();
      if (!this._productBadge) {
        this._productBadge = this.parentView().badgePool.badgeForFrame(this._frame);
        this._productBadge.classList.add('network-frame-group-badge');
      }
      cell.appendChild(UI.Icon.create('largeicon-navigator-frame', 'network-frame-group-icon'));
      cell.appendChild(this._productBadge);
      cell.createTextChild(name);
      cell.title = name;
    }
  }
};
