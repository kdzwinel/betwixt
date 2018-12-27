// Copyright (c) 2017 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

Coverage.CoverageListView = class extends UI.VBox {
  /**
   * @param {function(!Coverage.URLCoverageInfo):boolean} filterCallback
   */
  constructor(filterCallback) {
    super(true);
    /** @type {!Map<!Coverage.URLCoverageInfo, !Coverage.CoverageListView.GridNode>} */
    this._nodeForCoverageInfo = new Map();
    this._filterCallback = filterCallback;
    /** @type {?RegExp} */
    this._highlightRegExp = null;
    this.registerRequiredCSS('coverage/coverageListView.css');
    const columns = [
      {id: 'url', title: Common.UIString('URL'), width: '250px', fixedWidth: false, sortable: true},
      {id: 'type', title: Common.UIString('Type'), width: '45px', fixedWidth: true, sortable: true}, {
        id: 'size',
        title: Common.UIString('Total Bytes'),
        width: '60px',
        fixedWidth: true,
        sortable: true,
        align: DataGrid.DataGrid.Align.Right
      },
      {
        id: 'unusedSize',
        title: Common.UIString('Unused Bytes'),
        width: '100px',
        fixedWidth: true,
        sortable: true,
        align: DataGrid.DataGrid.Align.Right,
        sort: DataGrid.DataGrid.Order.Descending
      },
      {id: 'bars', title: '', width: '250px', fixedWidth: false, sortable: true}
    ];
    this._dataGrid = new DataGrid.SortableDataGrid(columns);
    this._dataGrid.setResizeMethod(DataGrid.DataGrid.ResizeMethod.Last);
    this._dataGrid.element.classList.add('flex-auto');
    this._dataGrid.element.addEventListener('keydown', this._onKeyDown.bind(this), false);
    this._dataGrid.addEventListener(DataGrid.DataGrid.Events.OpenedNode, this._onOpenedNode, this);
    this._dataGrid.addEventListener(DataGrid.DataGrid.Events.SortingChanged, this._sortingChanged, this);

    const dataGridWidget = this._dataGrid.asWidget();
    dataGridWidget.show(this.contentElement);
  }

  /**
   * @param {!Array<!Coverage.URLCoverageInfo>} coverageInfo
   */
  update(coverageInfo) {
    let hadUpdates = false;
    const maxSize = coverageInfo.reduce((acc, entry) => Math.max(acc, entry.size()), 0);
    const rootNode = this._dataGrid.rootNode();
    for (const entry of coverageInfo) {
      let node = this._nodeForCoverageInfo.get(entry);
      if (node) {
        if (this._filterCallback(node._coverageInfo))
          hadUpdates = node._refreshIfNeeded(maxSize) || hadUpdates;
        continue;
      }
      node = new Coverage.CoverageListView.GridNode(entry, maxSize);
      this._nodeForCoverageInfo.set(entry, node);
      if (this._filterCallback(node._coverageInfo)) {
        rootNode.appendChild(node);
        hadUpdates = true;
      }
    }
    if (hadUpdates)
      this._sortingChanged();
  }

  reset() {
    this._nodeForCoverageInfo.clear();
    this._dataGrid.rootNode().removeChildren();
  }

  /**
   * @param {?RegExp} highlightRegExp
   */
  updateFilterAndHighlight(highlightRegExp) {
    this._highlightRegExp = highlightRegExp;
    let hadTreeUpdates = false;
    for (const node of this._nodeForCoverageInfo.values()) {
      const shouldBeVisible = this._filterCallback(node._coverageInfo);
      const isVisible = !!node.parent;
      if (shouldBeVisible)
        node._setHighlight(this._highlightRegExp);
      if (shouldBeVisible === isVisible)
        continue;
      hadTreeUpdates = true;
      if (!shouldBeVisible)
        node.remove();
      else
        this._dataGrid.rootNode().appendChild(node);
    }
    if (hadTreeUpdates)
      this._sortingChanged();
  }

  _onOpenedNode() {
    this._revealSourceForSelectedNode();
  }

  /**
   * @param {!Event} event
   */
  _onKeyDown(event) {
    if (!isEnterKey(event))
      return;
    event.consume(true);
    this._revealSourceForSelectedNode();
  }

  async _revealSourceForSelectedNode() {
    const node = this._dataGrid.selectedNode;
    if (!node)
      return;
    const coverageInfo = /** @type {!Coverage.CoverageListView.GridNode} */ (node)._coverageInfo;
    let sourceCode = Workspace.workspace.uiSourceCodeForURL(coverageInfo.url());
    if (!sourceCode)
      return;
    const content = await sourceCode.requestContent();
    if (TextUtils.isMinified(content)) {
      const formatData = await Sources.sourceFormatter.format(sourceCode);
      // ------------ ASYNC ------------
      sourceCode = formatData.formattedSourceCode;
    }
    if (this._dataGrid.selectedNode !== node)
      return;
    Common.Revealer.reveal(sourceCode);
  }

  _sortingChanged() {
    const columnId = this._dataGrid.sortColumnId();
    if (!columnId)
      return;
    let sortFunction;
    switch (columnId) {
      case 'url':
        sortFunction = compareURL;
        break;
      case 'type':
        sortFunction = compareType;
        break;
      case 'size':
        sortFunction = compareNumericField.bind(null, 'size');
        break;
      case 'bars':
      case 'unusedSize':
        sortFunction = compareNumericField.bind(null, 'unusedSize');
        break;
      default:
        console.assert(false, 'Unknown sort field: ' + columnId);
        return;
    }

    this._dataGrid.sortNodes(sortFunction, !this._dataGrid.isSortOrderAscending());

    /**
     * @param {!DataGrid.DataGridNode} a
     * @param {!DataGrid.DataGridNode} b
     * @return {number}
     */
    function compareURL(a, b) {
      const nodeA = /** @type {!Coverage.CoverageListView.GridNode} */ (a);
      const nodeB = /** @type {!Coverage.CoverageListView.GridNode} */ (b);

      return nodeA._url.localeCompare(nodeB._url);
    }

    /**
     * @param {string} fieldName
     * @param {!DataGrid.DataGridNode} a
     * @param {!DataGrid.DataGridNode} b
     * @return {number}
     */
    function compareNumericField(fieldName, a, b) {
      const nodeA = /** @type {!Coverage.CoverageListView.GridNode} */ (a);
      const nodeB = /** @type {!Coverage.CoverageListView.GridNode} */ (b);

      return nodeA._coverageInfo[fieldName]() - nodeB._coverageInfo[fieldName]() || compareURL(a, b);
    }

    /**
     * @param {!DataGrid.DataGridNode} a
     * @param {!DataGrid.DataGridNode} b
     * @return {number}
     */
    function compareType(a, b) {
      const nodeA = /** @type {!Coverage.CoverageListView.GridNode} */ (a);
      const nodeB = /** @type {!Coverage.CoverageListView.GridNode} */ (b);
      const typeA = Coverage.CoverageListView._typeToString(nodeA._coverageInfo.type());
      const typeB = Coverage.CoverageListView._typeToString(nodeB._coverageInfo.type());
      return typeA.localeCompare(typeB) || compareURL(a, b);
    }
  }

  /**
   * @param {!Coverage.CoverageType} type
   */
  static _typeToString(type) {
    const types = [];
    if (type & Coverage.CoverageType.CSS)
      types.push(Common.UIString('CSS'));
    if (type & Coverage.CoverageType.JavaScriptCoarse)
      types.push(Common.UIString('JS (coarse)'));
    else if (type & Coverage.CoverageType.JavaScript)
      types.push(Common.UIString('JS'));
    return types.join('+');
  }
};

Coverage.CoverageListView.GridNode = class extends DataGrid.SortableDataGridNode {
  /**
   * @param {!Coverage.URLCoverageInfo} coverageInfo
   * @param {number} maxSize
   */
  constructor(coverageInfo, maxSize) {
    super();
    this._coverageInfo = coverageInfo;
    /** @type {number|undefined} */
    this._lastUsedSize;
    this._url = coverageInfo.url();
    this._maxSize = maxSize;
    this._highlightDOMChanges = [];
    /** @type {?RegExp} */
    this._highlightRegExp = null;
  }

  /**
   * @param {?RegExp} highlightRegExp
   */
  _setHighlight(highlightRegExp) {
    if (this._highlightRegExp === highlightRegExp)
      return;
    this._highlightRegExp = highlightRegExp;
    this.refresh();
  }

  /**
   * @param {number} maxSize
   * @return {boolean}
   */
  _refreshIfNeeded(maxSize) {
    if (this._lastUsedSize === this._coverageInfo.usedSize() && maxSize === this._maxSize)
      return false;
    this._lastUsedSize = this._coverageInfo.usedSize();
    this._maxSize = maxSize;
    this.refresh();
    return true;
  }

  /**
   * @override
   * @param {string} columnId
   * @return {!Element}
   */
  createCell(columnId) {
    const cell = this.createTD(columnId);
    switch (columnId) {
      case 'url':
        cell.title = this._url;
        const outer = cell.createChild('div', 'url-outer');
        const prefix = outer.createChild('div', 'url-prefix');
        const suffix = outer.createChild('div', 'url-suffix');
        const splitURL = /^(.*)(\/[^/]*)$/.exec(this._url);
        prefix.textContent = splitURL ? splitURL[1] : this._url;
        suffix.textContent = splitURL ? splitURL[2] : '';
        if (this._highlightRegExp)
          this._highlight(outer, this._url);
        break;
      case 'type':
        cell.textContent = Coverage.CoverageListView._typeToString(this._coverageInfo.type());
        if (this._coverageInfo.type() & Coverage.CoverageType.JavaScriptCoarse)
          cell.title = Common.UIString('JS coverage is function-level only. Reload the page for block-level coverage.');
        break;
      case 'size':
        cell.textContent = Number.withThousandsSeparator(this._coverageInfo.size() || 0);
        break;
      case 'unusedSize':
        const unusedSize = this._coverageInfo.unusedSize() || 0;
        const unusedSizeSpan = cell.createChild('span');
        const unusedPercentsSpan = cell.createChild('span', 'percent-value');
        unusedSizeSpan.textContent = Number.withThousandsSeparator(unusedSize);
        unusedPercentsSpan.textContent = Common.UIString('%.1f\xa0%%', unusedSize / this._coverageInfo.size() * 100);
        break;
      case 'bars':
        const barContainer = cell.createChild('div', 'bar-container');
        const unusedSizeBar = barContainer.createChild('div', 'bar bar-unused-size');
        unusedSizeBar.style.width = (100 * this._coverageInfo.unusedSize() / this._maxSize).toFixed(4) + '%';
        const usedSizeBar = barContainer.createChild('div', 'bar bar-used-size');
        usedSizeBar.style.width = (100 * this._coverageInfo.usedSize() / this._maxSize).toFixed(4) + '%';
    }
    return cell;
  }

  /**
   * @param {!Element} element
   * @param {string} textContent
   */
  _highlight(element, textContent) {
    const matches = this._highlightRegExp.exec(textContent);
    if (!matches || !matches.length)
      return;
    const range = new TextUtils.SourceRange(matches.index, matches[0].length);
    UI.highlightRangesWithStyleClass(element, [range], 'filter-highlight');
  }
};
