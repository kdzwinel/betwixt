/*
 * Copyright (C) 2010 Apple Inc. All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions
 * are met:
 * 1. Redistributions of source code must retain the above copyright
 *    notice, this list of conditions and the following disclaimer.
 * 2. Redistributions in binary form must reproduce the above copyright
 *    notice, this list of conditions and the following disclaimer in the
 *    documentation and/or other materials provided with the distribution.
 *
 * THIS SOFTWARE IS PROVIDED BY APPLE INC. AND ITS CONTRIBUTORS ``AS IS''
 * AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO,
 * THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR
 * PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL APPLE INC. OR ITS CONTRIBUTORS
 * BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR
 * CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF
 * SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS
 * INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN
 * CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE)
 * ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF
 * THE POSSIBILITY OF SUCH DAMAGE.
 */

/**
 * @unrestricted
 */
Resources.ApplicationCacheItemsView = class extends UI.SimpleView {
  constructor(model, frameId) {
    super(Common.UIString('AppCache'));

    this._model = model;

    this.element.classList.add('storage-view', 'table');

    this._deleteButton = new UI.ToolbarButton(Common.UIString('Delete'), 'largeicon-delete');
    this._deleteButton.setVisible(false);
    this._deleteButton.addEventListener(UI.ToolbarButton.Events.Click, this._deleteButtonClicked, this);

    this._connectivityIcon = createElement('label', 'dt-icon-label');
    this._connectivityIcon.style.margin = '0 2px 0 5px';
    this._statusIcon = createElement('label', 'dt-icon-label');
    this._statusIcon.style.margin = '0 2px 0 5px';

    this._frameId = frameId;

    this._emptyWidget = new UI.EmptyWidget(Common.UIString('No Application Cache information available.'));
    this._emptyWidget.show(this.element);

    this._markDirty();

    const status = this._model.frameManifestStatus(frameId);
    this.updateStatus(status);
    this.updateNetworkState(this._model.onLine);

    // FIXME: Status bar items don't work well enough yet, so they are being hidden.
    // http://webkit.org/b/41637 Web Inspector: Give Semantics to "Refresh" and "Delete" Buttons in ApplicationCache DataGrid
    this._deleteButton.element.style.display = 'none';
  }

  /**
   * @override
   * @return {!Array.<!UI.ToolbarItem>}
   */
  syncToolbarItems() {
    return [
      this._deleteButton, new UI.ToolbarItem(this._connectivityIcon), new UI.ToolbarSeparator(),
      new UI.ToolbarItem(this._statusIcon)
    ];
  }

  /**
   * @override
   */
  wasShown() {
    this._maybeUpdate();
  }

  /**
   * @override
   */
  willHide() {
    this._deleteButton.setVisible(false);
  }

  _maybeUpdate() {
    if (!this.isShowing() || !this._viewDirty)
      return;

    this._update();
    this._viewDirty = false;
  }

  _markDirty() {
    this._viewDirty = true;
  }

  /**
   * @param {number} status
   */
  updateStatus(status) {
    const oldStatus = this._status;
    this._status = status;

    const statusInformation = {};
    // We should never have UNCACHED status, since we remove frames with UNCACHED application cache status from the tree.
    statusInformation[applicationCache.UNCACHED] = {type: 'smallicon-red-ball', text: 'UNCACHED'};
    statusInformation[applicationCache.IDLE] = {type: 'smallicon-green-ball', text: 'IDLE'};
    statusInformation[applicationCache.CHECKING] = {type: 'smallicon-orange-ball', text: 'CHECKING'};
    statusInformation[applicationCache.DOWNLOADING] = {type: 'smallicon-orange-ball', text: 'DOWNLOADING'};
    statusInformation[applicationCache.UPDATEREADY] = {type: 'smallicon-green-ball', text: 'UPDATEREADY'};
    statusInformation[applicationCache.OBSOLETE] = {type: 'smallicon-red-ball', text: 'OBSOLETE'};

    const info = statusInformation[status] || statusInformation[applicationCache.UNCACHED];

    this._statusIcon.type = info.type;
    this._statusIcon.textContent = info.text;

    if (this.isShowing() && this._status === applicationCache.IDLE &&
        (oldStatus === applicationCache.UPDATEREADY || !this._resources))
      this._markDirty();
    this._maybeUpdate();
  }

  /**
   * @param {boolean} isNowOnline
   */
  updateNetworkState(isNowOnline) {
    if (isNowOnline) {
      this._connectivityIcon.type = 'smallicon-green-ball';
      this._connectivityIcon.textContent = Common.UIString('Online');
    } else {
      this._connectivityIcon.type = 'smallicon-red-ball';
      this._connectivityIcon.textContent = Common.UIString('Offline');
    }
  }

  async _update() {
    const applicationCache = await this._model.requestApplicationCache(this._frameId);

    if (!applicationCache || !applicationCache.manifestURL) {
      delete this._manifest;
      delete this._creationTime;
      delete this._updateTime;
      delete this._size;
      delete this._resources;

      this._emptyWidget.show(this.element);
      this._deleteButton.setVisible(false);
      if (this._dataGrid)
        this._dataGrid.element.classList.add('hidden');
      return;
    }
    // FIXME: are these variables needed anywhere else?
    this._manifest = applicationCache.manifestURL;
    this._creationTime = applicationCache.creationTime;
    this._updateTime = applicationCache.updateTime;
    this._size = applicationCache.size;
    this._resources = applicationCache.resources;

    if (!this._dataGrid)
      this._createDataGrid();

    this._populateDataGrid();
    this._dataGrid.autoSizeColumns(20, 80);
    this._dataGrid.element.classList.remove('hidden');
    this._emptyWidget.detach();
    this._deleteButton.setVisible(true);

    // FIXME: For Chrome, put creationTime and updateTime somewhere.
    // NOTE: localizedString has not yet been added.
    // Common.UIString("(%s) Created: %s Updated: %s", this._size, this._creationTime, this._updateTime);
  }

  _createDataGrid() {
    const columns = /** @type {!Array<!DataGrid.DataGrid.ColumnDescriptor>} */ ([
      {id: 'resource', title: Common.UIString('Resource'), sort: DataGrid.DataGrid.Order.Ascending, sortable: true},
      {id: 'type', title: Common.UIString('Type'), sortable: true},
      {id: 'size', title: Common.UIString('Size'), align: DataGrid.DataGrid.Align.Right, sortable: true}
    ]);
    this._dataGrid = new DataGrid.DataGrid(columns);
    this._dataGrid.setStriped(true);
    this._dataGrid.asWidget().show(this.element);
    this._dataGrid.addEventListener(DataGrid.DataGrid.Events.SortingChanged, this._populateDataGrid, this);
  }

  _populateDataGrid() {
    const selectedResource = this._dataGrid.selectedNode ? this._dataGrid.selectedNode.resource : null;
    const sortDirection = this._dataGrid.isSortOrderAscending() ? 1 : -1;

    function numberCompare(field, resource1, resource2) {
      return sortDirection * (resource1[field] - resource2[field]);
    }
    function localeCompare(field, resource1, resource2) {
      return sortDirection * (resource1[field] + '').localeCompare(resource2[field] + '');
    }

    let comparator;
    switch (this._dataGrid.sortColumnId()) {
      case 'resource':
        comparator = localeCompare.bind(null, 'url');
        break;
      case 'type':
        comparator = localeCompare.bind(null, 'type');
        break;
      case 'size':
        comparator = numberCompare.bind(null, 'size');
        break;
      default:
        localeCompare.bind(null, 'resource');  // FIXME: comparator = ?
    }

    this._resources.sort(comparator);
    this._dataGrid.rootNode().removeChildren();

    let nodeToSelect;
    for (let i = 0; i < this._resources.length; ++i) {
      const data = {};
      const resource = this._resources[i];
      data.resource = resource.url;
      data.type = resource.type;
      data.size = Number.bytesToString(resource.size);
      const node = new DataGrid.DataGridNode(data);
      node.resource = resource;
      node.selectable = true;
      this._dataGrid.rootNode().appendChild(node);
      if (resource === selectedResource) {
        nodeToSelect = node;
        nodeToSelect.selected = true;
      }
    }

    if (!nodeToSelect && this._dataGrid.rootNode().children.length)
      this._dataGrid.rootNode().children[0].selected = true;
  }

  /**
   * @param {!Common.Event} event
   */
  _deleteButtonClicked(event) {
    if (!this._dataGrid || !this._dataGrid.selectedNode)
      return;

    // FIXME: Delete Button semantics are not yet defined. (Delete a single, or all?)
    this._deleteCallback(this._dataGrid.selectedNode);
  }

  _deleteCallback(node) {
    // FIXME: Should we delete a single (selected) resource or all resources?
    // Protocol.inspectorBackend.deleteCachedResource(...)
    // this._update();
  }
};
