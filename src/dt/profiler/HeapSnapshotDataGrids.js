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
Profiler.HeapSnapshotSortableDataGrid = class extends DataGrid.DataGrid {
  /**
   * @param {!Profiler.ProfileType.DataDisplayDelegate} dataDisplayDelegate
   * @param {!Array.<!DataGrid.DataGrid.ColumnDescriptor>} columns
   */
  constructor(dataDisplayDelegate, columns) {
    // TODO(allada) This entire class needs to be converted to use the templates in DataGridNode.
    super(columns);
    this._dataDisplayDelegate = dataDisplayDelegate;
    const tooltips = [
      ['distance', ls`Distance from window object`], ['shallowSize', ls`Size of the object itself in bytes`],
      ['retainedSize', ls`Size of the object plus the graph it retains in bytes`]
    ];
    for (const info of tooltips) {
      const headerCell = this.headerTableHeader(info[0]);
      if (headerCell)
        headerCell.setAttribute('title', info[1]);
    }

    /**
     * @type {number}
     */
    this._recursiveSortingDepth = 0;
    /**
     * @type {?Profiler.HeapSnapshotGridNode}
     */
    this._highlightedNode = null;
    /**
     * @type {boolean}
     */
    this._populatedAndSorted = false;
    /**
     * @type {?UI.ToolbarInput}
     */
    this._nameFilter = null;
    this._nodeFilter = new HeapSnapshotModel.NodeFilter();
    this.addEventListener(Profiler.HeapSnapshotSortableDataGrid.Events.SortingComplete, this._sortingComplete, this);
    this.addEventListener(DataGrid.DataGrid.Events.SortingChanged, this.sortingChanged, this);
  }

  /**
   * @return {!Profiler.ProfileType.DataDisplayDelegate}
   */
  dataDisplayDelegate() {
    return this._dataDisplayDelegate;
  }

  /**
   * @return {!HeapSnapshotModel.NodeFilter}
   */
  nodeFilter() {
    return this._nodeFilter;
  }

  /**
   * @param {!UI.ToolbarInput} nameFilter
   */
  setNameFilter(nameFilter) {
    this._nameFilter = nameFilter;
  }

  /**
   * @return {number}
   */
  defaultPopulateCount() {
    return 100;
  }

  _disposeAllNodes() {
    const children = this.topLevelNodes();
    for (let i = 0, l = children.length; i < l; ++i)
      children[i].dispose();
  }

  /**
   * @override
   */
  wasShown() {
    if (this._nameFilter) {
      this._nameFilter.addEventListener(UI.ToolbarInput.Event.TextChanged, this._onNameFilterChanged, this);
      this.updateVisibleNodes(true);
    }
    if (this._populatedAndSorted)
      this.dispatchEventToListeners(Profiler.HeapSnapshotSortableDataGrid.Events.ContentShown, this);
  }

  _sortingComplete() {
    this.removeEventListener(Profiler.HeapSnapshotSortableDataGrid.Events.SortingComplete, this._sortingComplete, this);
    this._populatedAndSorted = true;
    this.dispatchEventToListeners(Profiler.HeapSnapshotSortableDataGrid.Events.ContentShown, this);
  }

  /**
   * @override
   */
  willHide() {
    if (this._nameFilter)
      this._nameFilter.removeEventListener(UI.ToolbarInput.Event.TextChanged, this._onNameFilterChanged, this);
    this._clearCurrentHighlight();
  }

  /**
   * @param {!UI.ContextMenu} contextMenu
   * @param {!Event} event
   */
  populateContextMenu(contextMenu, event) {
    const td = event.target.enclosingNodeOrSelfWithNodeName('td');
    if (!td)
      return;
    const node = td.heapSnapshotNode;
    contextMenu.revealSection().appendItem(ls`Reveal in Summary view`, () => {
      this._dataDisplayDelegate.showObject(node.snapshotNodeId, ls`Summary`);
    });
  }

  resetSortingCache() {
    delete this._lastSortColumnId;
    delete this._lastSortAscending;
  }

  /**
   * @return {!Array<!Profiler.HeapSnapshotGridNode>}
   */
  topLevelNodes() {
    return this.rootNode().children;
  }

  /**
   * @param {!Protocol.HeapProfiler.HeapSnapshotObjectId} heapSnapshotObjectId
   * @return {!Promise<?Profiler.HeapSnapshotGridNode>}
   */
  revealObjectByHeapSnapshotId(heapSnapshotObjectId) {
    return Promise.resolve(/** @type {?Profiler.HeapSnapshotGridNode} */ (null));
  }

  /**
   * @param {!Profiler.HeapSnapshotGridNode} node
   */
  highlightNode(node) {
    this._clearCurrentHighlight();
    this._highlightedNode = node;
    UI.runCSSAnimationOnce(this._highlightedNode.element(), 'highlighted-row');
  }

  _clearCurrentHighlight() {
    if (!this._highlightedNode)
      return;
    this._highlightedNode.element().classList.remove('highlighted-row');
    this._highlightedNode = null;
  }

  resetNameFilter() {
    this._nameFilter.setValue('');
  }

  _onNameFilterChanged() {
    this.updateVisibleNodes(true);
  }

  sortingChanged() {
    const sortAscending = this.isSortOrderAscending();
    const sortColumnId = this.sortColumnId();
    if (this._lastSortColumnId === sortColumnId && this._lastSortAscending === sortAscending)
      return;
    this._lastSortColumnId = sortColumnId;
    this._lastSortAscending = sortAscending;
    const sortFields = this._sortFields(sortColumnId, sortAscending);

    function SortByTwoFields(nodeA, nodeB) {
      let field1 = nodeA[sortFields[0]];
      let field2 = nodeB[sortFields[0]];
      let result = field1 < field2 ? -1 : (field1 > field2 ? 1 : 0);
      if (!sortFields[1])
        result = -result;
      if (result !== 0)
        return result;
      field1 = nodeA[sortFields[2]];
      field2 = nodeB[sortFields[2]];
      result = field1 < field2 ? -1 : (field1 > field2 ? 1 : 0);
      if (!sortFields[3])
        result = -result;
      return result;
    }
    this._performSorting(SortByTwoFields);
  }

  _performSorting(sortFunction) {
    this.recursiveSortingEnter();
    const children = this.allChildren(this.rootNode());
    this.rootNode().removeChildren();
    children.sort(sortFunction);
    for (let i = 0, l = children.length; i < l; ++i) {
      const child = children[i];
      this.appendChildAfterSorting(child);
      if (child.expanded)
        child.sort();
    }
    this.recursiveSortingLeave();
  }

  appendChildAfterSorting(child) {
    const revealed = child.revealed;
    this.rootNode().appendChild(child);
    child.revealed = revealed;
  }

  recursiveSortingEnter() {
    ++this._recursiveSortingDepth;
  }

  recursiveSortingLeave() {
    if (!this._recursiveSortingDepth)
      return;
    if (--this._recursiveSortingDepth)
      return;
    this.updateVisibleNodes(true);
    this.dispatchEventToListeners(Profiler.HeapSnapshotSortableDataGrid.Events.SortingComplete);
  }

  /**
   * @param {boolean} force
   */
  updateVisibleNodes(force) {
  }

  /**
   * @param {!DataGrid.DataGridNode} parent
   * @return {!Array.<!Profiler.HeapSnapshotGridNode>}
   */
  allChildren(parent) {
    return parent.children;
  }

  /**
   * @param {!DataGrid.DataGridNode} parent
   * @param {!DataGrid.DataGridNode} node
   * @param {number} index
   */
  insertChild(parent, node, index) {
    parent.insertChild(node, index);
  }

  /**
   * @param {!Profiler.HeapSnapshotGridNode} parent
   * @param {number} index
   */
  removeChildByIndex(parent, index) {
    parent.removeChild(parent.children[index]);
  }

  /**
   * @param {!Profiler.HeapSnapshotGridNode} parent
   */
  removeAllChildren(parent) {
    parent.removeChildren();
  }
};

/** @enum {symbol} */
Profiler.HeapSnapshotSortableDataGrid.Events = {
  ContentShown: Symbol('ContentShown'),
  SortingComplete: Symbol('SortingComplete')
};

/**
 * @unrestricted
 */
Profiler.HeapSnapshotViewportDataGrid = class extends Profiler.HeapSnapshotSortableDataGrid {
  /**
   * @param {!Profiler.ProfileType.DataDisplayDelegate} dataDisplayDelegate
   * @param {!Array.<!DataGrid.DataGrid.ColumnDescriptor>} columns
   */
  constructor(dataDisplayDelegate, columns) {
    super(dataDisplayDelegate, columns);
    this.scrollContainer.addEventListener('scroll', this._onScroll.bind(this), true);
    this._topPaddingHeight = 0;
    this._bottomPaddingHeight = 0;
  }

  /**
   * @override
   * @return {!Array.<!Profiler.HeapSnapshotGridNode>}
   */
  topLevelNodes() {
    return this.allChildren(this.rootNode());
  }

  /**
   * @override
   */
  appendChildAfterSorting(child) {
    // Do nothing here, it will be added in updateVisibleNodes.
  }

  /**
   * @override
   * @param {boolean} force
   */
  updateVisibleNodes(force) {
    // Guard zone is used to ensure there are always some extra items
    // above and below the viewport to support keyboard navigation.
    const guardZoneHeight = 40;
    const scrollHeight = this.scrollContainer.scrollHeight;
    let scrollTop = this.scrollContainer.scrollTop;
    let scrollBottom = scrollHeight - scrollTop - this.scrollContainer.offsetHeight;
    scrollTop = Math.max(0, scrollTop - guardZoneHeight);
    scrollBottom = Math.max(0, scrollBottom - guardZoneHeight);
    let viewPortHeight = scrollHeight - scrollTop - scrollBottom;
    // Do nothing if populated nodes still fit the viewport.
    if (!force && scrollTop >= this._topPaddingHeight && scrollBottom >= this._bottomPaddingHeight)
      return;
    const hysteresisHeight = 500;
    scrollTop -= hysteresisHeight;
    viewPortHeight += 2 * hysteresisHeight;
    const selectedNode = this.selectedNode;
    this.rootNode().removeChildren();

    this._topPaddingHeight = 0;
    this._bottomPaddingHeight = 0;

    this._addVisibleNodes(this.rootNode(), scrollTop, scrollTop + viewPortHeight);

    this.setVerticalPadding(this._topPaddingHeight, this._bottomPaddingHeight);

    if (selectedNode) {
      // Keep selection even if the node is not in the current viewport.
      if (selectedNode.parent)
        selectedNode.select(true);
      else
        this.selectedNode = selectedNode;
    }
  }

  /**
   * @param {!DataGrid.DataGridNode} parentNode
   * @param {number} topBound
   * @param {number} bottomBound
   * @return {number}
   */
  _addVisibleNodes(parentNode, topBound, bottomBound) {
    if (!parentNode.expanded)
      return 0;

    const children = this.allChildren(parentNode);
    let topPadding = 0;
    const nameFilterValue = this._nameFilter ? this._nameFilter.value().toLowerCase() : '';
    // Iterate over invisible nodes beyond the upper bound of viewport.
    // Do not insert them into the grid, but count their total height.
    let i = 0;
    for (; i < children.length; ++i) {
      const child = children[i];
      if (nameFilterValue && child.filteredOut && child.filteredOut(nameFilterValue))
        continue;
      const newTop = topPadding + this._nodeHeight(child);
      if (newTop > topBound)
        break;
      topPadding = newTop;
    }

    // Put visible nodes into the data grid.
    let position = topPadding;
    for (; i < children.length && position < bottomBound; ++i) {
      const child = children[i];
      if (nameFilterValue && child.filteredOut && child.filteredOut(nameFilterValue))
        continue;
      const hasChildren = child.hasChildren();
      child.removeChildren();
      child.setHasChildren(hasChildren);
      parentNode.appendChild(child);
      position += child.nodeSelfHeight();
      position += this._addVisibleNodes(child, topBound - position, bottomBound - position);
    }

    // Count the invisible nodes beyond the bottom bound of the viewport.
    let bottomPadding = 0;
    for (; i < children.length; ++i) {
      const child = children[i];
      if (nameFilterValue && child.filteredOut && child.filteredOut(nameFilterValue))
        continue;
      bottomPadding += this._nodeHeight(child);
    }

    this._topPaddingHeight += topPadding;
    this._bottomPaddingHeight += bottomPadding;
    return position + bottomPadding;
  }

  /**
   * @param {!Profiler.HeapSnapshotGridNode} node
   * @return {number}
   */
  _nodeHeight(node) {
    let result = node.nodeSelfHeight();
    if (!node.expanded)
      return result;
    const children = this.allChildren(node);
    for (let i = 0; i < children.length; i++)
      result += this._nodeHeight(children[i]);
    return result;
  }

  /**
   * @param {!Array<!Profiler.HeapSnapshotGridNode>} pathToReveal
   * @return {!Promise<!Profiler.HeapSnapshotGridNode>}
   */
  revealTreeNode(pathToReveal) {
    const height = this._calculateOffset(pathToReveal);
    const node = /** @type {!Profiler.HeapSnapshotGridNode} */ (pathToReveal.peekLast());
    const scrollTop = this.scrollContainer.scrollTop;
    const scrollBottom = scrollTop + this.scrollContainer.offsetHeight;
    if (height >= scrollTop && height < scrollBottom)
      return Promise.resolve(node);

    const scrollGap = 40;
    this.scrollContainer.scrollTop = Math.max(0, height - scrollGap);
    return new Promise(resolve => {
      console.assert(!this._scrollToResolveCallback);
      this._scrollToResolveCallback = resolve.bind(null, node);
      // Still resolve the promise if it does not scroll for some reason.
      this.scrollContainer.window().requestAnimationFrame(() => {
        if (!this._scrollToResolveCallback)
          return;
        this._scrollToResolveCallback();
        this._scrollToResolveCallback = null;
      });
    });
  }

  /**
   * @param {!Array.<!Profiler.HeapSnapshotGridNode>} pathToReveal
   * @return {number}
   */
  _calculateOffset(pathToReveal) {
    let parentNode = this.rootNode();
    let height = 0;
    for (let i = 0; i < pathToReveal.length; ++i) {
      const node = pathToReveal[i];
      const children = this.allChildren(parentNode);
      for (let j = 0; j < children.length; ++j) {
        const child = children[j];
        if (node === child) {
          height += node.nodeSelfHeight();
          break;
        }
        height += this._nodeHeight(child);
      }
      parentNode = node;
    }
    return height - pathToReveal.peekLast().nodeSelfHeight();
  }

  /**
   * @override
   * @param {!DataGrid.DataGridNode} parent
   * @return {!Array.<!Profiler.HeapSnapshotGridNode>}
   */
  allChildren(parent) {
    return parent._allChildren || (parent._allChildren = []);
  }

  /**
   * @param {!DataGrid.DataGridNode} parent
   * @param {!Profiler.HeapSnapshotGridNode} node
   */
  appendNode(parent, node) {
    this.allChildren(parent).push(node);
  }

  /**
   * @override
   * @param {!DataGrid.DataGridNode} parent
   * @param {!DataGrid.DataGridNode} node
   * @param {number} index
   */
  insertChild(parent, node, index) {
    this.allChildren(parent).splice(index, 0, /** @type {!Profiler.HeapSnapshotGridNode} */ (node));
  }

  /**
   * @override
   */
  removeChildByIndex(parent, index) {
    this.allChildren(parent).splice(index, 1);
  }

  /**
   * @override
   */
  removeAllChildren(parent) {
    parent._allChildren = [];
  }

  removeTopLevelNodes() {
    this._disposeAllNodes();
    this.rootNode().removeChildren();
    this.rootNode()._allChildren = [];
  }

  /**
   * @param {!Element} element
   * @return {boolean}
   */
  _isScrolledIntoView(element) {
    const viewportTop = this.scrollContainer.scrollTop;
    const viewportBottom = viewportTop + this.scrollContainer.clientHeight;
    const elemTop = element.offsetTop;
    const elemBottom = elemTop + element.offsetHeight;
    return elemBottom <= viewportBottom && elemTop >= viewportTop;
  }

  /**
   * @override
   */
  onResize() {
    super.onResize();
    this.updateVisibleNodes(false);
  }

  /**
   * @param {!Event} event
   */
  _onScroll(event) {
    this.updateVisibleNodes(false);

    if (this._scrollToResolveCallback) {
      this._scrollToResolveCallback();
      this._scrollToResolveCallback = null;
    }
  }
};

/**
 * @unrestricted
 */
Profiler.HeapSnapshotContainmentDataGrid = class extends Profiler.HeapSnapshotSortableDataGrid {
  /**
   * @param {!Profiler.ProfileType.DataDisplayDelegate} dataDisplayDelegate
   * @param {!Array.<!DataGrid.DataGrid.ColumnDescriptor>=} columns
   */
  constructor(dataDisplayDelegate, columns) {
    columns = columns || (/** @type {!Array<!DataGrid.DataGrid.ColumnDescriptor>} */ ([
                {id: 'object', title: ls`Object`, disclosure: true, sortable: true},
                {id: 'distance', title: ls`Distance`, width: '70px', sortable: true, fixedWidth: true},
                {id: 'shallowSize', title: ls`Shallow Size`, width: '110px', sortable: true, fixedWidth: true}, {
                  id: 'retainedSize',
                  title: ls`Retained Size`,
                  width: '110px',
                  sortable: true,
                  fixedWidth: true,
                  sort: DataGrid.DataGrid.Order.Descending
                }
              ]));
    super(dataDisplayDelegate, columns);
  }

  /**
   * @param {!Profiler.HeapSnapshotProxy} snapshot
   * @param {number} nodeIndex
   */
  setDataSource(snapshot, nodeIndex) {
    this.snapshot = snapshot;
    const node = {nodeIndex: nodeIndex || snapshot.rootNodeIndex};
    const fakeEdge = {node: node};
    this.setRootNode(this._createRootNode(snapshot, fakeEdge));
    this.rootNode().sort();
  }

  _createRootNode(snapshot, fakeEdge) {
    return new Profiler.HeapSnapshotObjectNode(this, snapshot, fakeEdge, null);
  }

  /**
   * @override
   */
  sortingChanged() {
    const rootNode = this.rootNode();
    if (rootNode.hasChildren())
      rootNode.sort();
  }
};

/**
 * @unrestricted
 */
Profiler.HeapSnapshotRetainmentDataGrid = class extends Profiler.HeapSnapshotContainmentDataGrid {
  /**
   * @param {!Profiler.ProfileType.DataDisplayDelegate} dataDisplayDelegate
   */
  constructor(dataDisplayDelegate) {
    const columns = /** @type {!Array<!DataGrid.DataGrid.ColumnDescriptor>} */ ([
      {id: 'object', title: ls`Object`, disclosure: true, sortable: true}, {
        id: 'distance',
        title: ls`Distance`,
        width: '70px',
        sortable: true,
        fixedWidth: true,
        sort: DataGrid.DataGrid.Order.Ascending
      },
      {id: 'shallowSize', title: ls`Shallow Size`, width: '110px', sortable: true, fixedWidth: true},
      {id: 'retainedSize', title: ls`Retained Size`, width: '110px', sortable: true, fixedWidth: true}
    ]);
    super(dataDisplayDelegate, columns);
  }

  /**
   * @override
   */
  _createRootNode(snapshot, fakeEdge) {
    return new Profiler.HeapSnapshotRetainingObjectNode(this, snapshot, fakeEdge, null);
  }

  _sortFields(sortColumn, sortAscending) {
    return {
      object: ['_name', sortAscending, '_count', false],
      count: ['_count', sortAscending, '_name', true],
      shallowSize: ['_shallowSize', sortAscending, '_name', true],
      retainedSize: ['_retainedSize', sortAscending, '_name', true],
      distance: ['_distance', sortAscending, '_name', true]
    }[sortColumn];
  }

  reset() {
    this.rootNode().removeChildren();
    this.resetSortingCache();
  }

  /**
   * @override
   * @param {!Profiler.HeapSnapshotProxy} snapshot
   * @param {number} nodeIndex
   */
  setDataSource(snapshot, nodeIndex) {
    super.setDataSource(snapshot, nodeIndex);
    this.rootNode().expand();
  }
};

/** @enum {symbol} */
Profiler.HeapSnapshotRetainmentDataGrid.Events = {
  ExpandRetainersComplete: Symbol('ExpandRetainersComplete')
};

/**
 * @unrestricted
 */
Profiler.HeapSnapshotConstructorsDataGrid = class extends Profiler.HeapSnapshotViewportDataGrid {
  /**
   * @param {!Profiler.ProfileType.DataDisplayDelegate} dataDisplayDelegate
   */
  constructor(dataDisplayDelegate) {
    const columns = /** @type {!Array<!DataGrid.DataGrid.ColumnDescriptor>} */ ([
      {id: 'object', title: ls`Constructor`, disclosure: true, sortable: true},
      {id: 'distance', title: ls`Distance`, width: '70px', sortable: true, fixedWidth: true},
      {id: 'shallowSize', title: ls`Shallow Size`, width: '110px', sortable: true, fixedWidth: true}, {
        id: 'retainedSize',
        title: ls`Retained Size`,
        width: '110px',
        sort: DataGrid.DataGrid.Order.Descending,
        sortable: true,
        fixedWidth: true
      }
    ]);
    super(dataDisplayDelegate, columns);
    this._profileIndex = -1;
    this._objectIdToSelect = null;
  }

  /**
   * @param {string} sortColumn
   * @param {boolean} sortAscending
   * @return {!Array}
   */
  _sortFields(sortColumn, sortAscending) {
    return {
      object: ['_name', sortAscending, '_retainedSize', false],
      distance: ['_distance', sortAscending, '_retainedSize', false],
      shallowSize: ['_shallowSize', sortAscending, '_name', true],
      retainedSize: ['_retainedSize', sortAscending, '_name', true]
    }[sortColumn];
  }

  /**
   * @override
   * @param {!Protocol.HeapProfiler.HeapSnapshotObjectId} id
   * @return {!Promise<?Profiler.HeapSnapshotGridNode>}
   */
  async revealObjectByHeapSnapshotId(id) {
    if (!this.snapshot) {
      this._objectIdToSelect = id;
      return null;
    }

    const className = await this.snapshot.nodeClassName(parseInt(id, 10));
    if (!className)
      return null;

    const parent = this.topLevelNodes().find(classNode => classNode._name === className);
    if (!parent)
      return null;

    const nodes = await parent.populateNodeBySnapshotObjectId(parseInt(id, 10));
    return nodes.length ? this.revealTreeNode(nodes) : null;
  }

  clear() {
    this._nextRequestedFilter = null;
    this._lastFilter = null;
    this.removeTopLevelNodes();
  }

  /**
   * @param {!Profiler.HeapSnapshotProxy} snapshot
   */
  setDataSource(snapshot) {
    this.snapshot = snapshot;
    if (this._profileIndex === -1)
      this._populateChildren();

    if (this._objectIdToSelect) {
      this.revealObjectByHeapSnapshotId(this._objectIdToSelect);
      this._objectIdToSelect = null;
    }
  }

  /**
   * @param {number} minNodeId
   * @param {number} maxNodeId
   */
  setSelectionRange(minNodeId, maxNodeId) {
    this._nodeFilter = new HeapSnapshotModel.NodeFilter(minNodeId, maxNodeId);
    this._populateChildren(this._nodeFilter);
  }

  /**
   * @param {number} allocationNodeId
   */
  setAllocationNodeId(allocationNodeId) {
    this._nodeFilter = new HeapSnapshotModel.NodeFilter();
    this._nodeFilter.allocationNodeId = allocationNodeId;
    this._populateChildren(this._nodeFilter);
  }

  /**
   * @param {!HeapSnapshotModel.NodeFilter} nodeFilter
   * @param {!Object<string, !HeapSnapshotModel.Aggregate>} aggregates
   */
  _aggregatesReceived(nodeFilter, aggregates) {
    this._filterInProgress = null;
    if (this._nextRequestedFilter) {
      this.snapshot.aggregatesWithFilter(this._nextRequestedFilter)
          .then(this._aggregatesReceived.bind(this, this._nextRequestedFilter));
      this._filterInProgress = this._nextRequestedFilter;
      this._nextRequestedFilter = null;
    }
    this.removeTopLevelNodes();
    this.resetSortingCache();
    for (const constructor in aggregates) {
      this.appendNode(
          this.rootNode(),
          new Profiler.HeapSnapshotConstructorNode(this, constructor, aggregates[constructor], nodeFilter));
    }
    this.sortingChanged();
    this._lastFilter = nodeFilter;
  }

  /**
   * @param {!HeapSnapshotModel.NodeFilter=} maybeNodeFilter
   */
  async _populateChildren(maybeNodeFilter) {
    const nodeFilter = maybeNodeFilter || new HeapSnapshotModel.NodeFilter();

    if (this._filterInProgress) {
      this._nextRequestedFilter = this._filterInProgress.equals(nodeFilter) ? null : nodeFilter;
      return;
    }
    if (this._lastFilter && this._lastFilter.equals(nodeFilter))
      return;
    this._filterInProgress = nodeFilter;

    const aggregates = await this.snapshot.aggregatesWithFilter(nodeFilter);
    this._aggregatesReceived(nodeFilter, aggregates);
  }

  filterSelectIndexChanged(profiles, profileIndex) {
    this._profileIndex = profileIndex;
    this._nodeFilter = undefined;
    if (profileIndex !== -1) {
      const minNodeId = profileIndex > 0 ? profiles[profileIndex - 1].maxJSObjectId : 0;
      const maxNodeId = profiles[profileIndex].maxJSObjectId;
      this._nodeFilter = new HeapSnapshotModel.NodeFilter(minNodeId, maxNodeId);
    }

    this._populateChildren(this._nodeFilter);
  }
};

/**
 * @unrestricted
 */
Profiler.HeapSnapshotDiffDataGrid = class extends Profiler.HeapSnapshotViewportDataGrid {
  /**
   * @param {!Profiler.ProfileType.DataDisplayDelegate} dataDisplayDelegate
   */
  constructor(dataDisplayDelegate) {
    const columns = /** @type {!Array<!DataGrid.DataGrid.ColumnDescriptor>} */ ([
      {id: 'object', title: ls`Constructor`, disclosure: true, sortable: true},
      {id: 'addedCount', title: ls`# New`, width: '75px', sortable: true, fixedWidth: true},
      {id: 'removedCount', title: ls`# Deleted`, width: '75px', sortable: true, fixedWidth: true},
      {id: 'countDelta', title: ls`# Delta`, width: '65px', sortable: true, fixedWidth: true}, {
        id: 'addedSize',
        title: ls`Alloc. Size`,
        width: '75px',
        sortable: true,
        fixedWidth: true,
        sort: DataGrid.DataGrid.Order.Descending
      },
      {id: 'removedSize', title: ls`Freed Size`, width: '75px', sortable: true, fixedWidth: true},
      {id: 'sizeDelta', title: ls`Size Delta`, width: '75px', sortable: true, fixedWidth: true}
    ]);
    super(dataDisplayDelegate, columns);
  }

  /**
   * @override
   * @return {number}
   */
  defaultPopulateCount() {
    return 50;
  }

  _sortFields(sortColumn, sortAscending) {
    return {
      object: ['_name', sortAscending, '_count', false],
      addedCount: ['_addedCount', sortAscending, '_name', true],
      removedCount: ['_removedCount', sortAscending, '_name', true],
      countDelta: ['_countDelta', sortAscending, '_name', true],
      addedSize: ['_addedSize', sortAscending, '_name', true],
      removedSize: ['_removedSize', sortAscending, '_name', true],
      sizeDelta: ['_sizeDelta', sortAscending, '_name', true]
    }[sortColumn];
  }

  setDataSource(snapshot) {
    this.snapshot = snapshot;
  }

  /**
   * @param {!Profiler.HeapSnapshotProxy} baseSnapshot
   */
  setBaseDataSource(baseSnapshot) {
    this.baseSnapshot = baseSnapshot;
    this.removeTopLevelNodes();
    this.resetSortingCache();
    if (this.baseSnapshot === this.snapshot) {
      this.dispatchEventToListeners(Profiler.HeapSnapshotSortableDataGrid.Events.SortingComplete);
      return;
    }
    this._populateChildren();
  }

  async _populateChildren() {
    // Two snapshots live in different workers isolated from each other. That is why
    // we first need to collect information about the nodes in the first snapshot and
    // then pass it to the second snapshot to calclulate the diff.
    const aggregatesForDiff = await this.baseSnapshot.aggregatesForDiff();
    const diffByClassName = await this.snapshot.calculateSnapshotDiff(this.baseSnapshot.uid, aggregatesForDiff);

    for (const className in diffByClassName) {
      const diff = diffByClassName[className];
      this.appendNode(this.rootNode(), new Profiler.HeapSnapshotDiffNode(this, className, diff));
    }
    this.sortingChanged();
  }
};

/**
 * @unrestricted
 */
Profiler.AllocationDataGrid = class extends Profiler.HeapSnapshotViewportDataGrid {
  /**
   * @param {?SDK.HeapProfilerModel} heapProfilerModel
   * @param {!Profiler.ProfileType.DataDisplayDelegate} dataDisplayDelegate
   */
  constructor(heapProfilerModel, dataDisplayDelegate) {
    const columns = /** @type {!Array<!DataGrid.DataGrid.ColumnDescriptor>} */ ([
      {id: 'liveCount', title: ls`Live Count`, width: '75px', sortable: true, fixedWidth: true},
      {id: 'count', title: ls`Count`, width: '65px', sortable: true, fixedWidth: true},
      {id: 'liveSize', title: ls`Live Size`, width: '75px', sortable: true, fixedWidth: true},
      {
        id: 'size',
        title: ls`Size`,
        width: '75px',
        sortable: true,
        fixedWidth: true,
        sort: DataGrid.DataGrid.Order.Descending
      },
      {id: 'name', title: ls`Function`, disclosure: true, sortable: true},
    ]);
    super(dataDisplayDelegate, columns);
    this._heapProfilerModel = heapProfilerModel;
    this._linkifier = new Components.Linkifier();
  }

  /**
   * @return {?SDK.HeapProfilerModel}
   */
  heapProfilerModel() {
    return this._heapProfilerModel;
  }

  dispose() {
    this._linkifier.reset();
  }

  /**
   * @param {!Profiler.HeapSnapshotProxy} snapshot
   */
  async setDataSource(snapshot) {
    this.snapshot = snapshot;
    this._topNodes = await this.snapshot.allocationTracesTops();
    this._populateChildren();
  }

  _populateChildren() {
    this.removeTopLevelNodes();
    const root = this.rootNode();
    const tops = this._topNodes;
    for (const top of tops)
      this.appendNode(root, new Profiler.AllocationGridNode(this, top));
    this.updateVisibleNodes(true);
  }

  /**
   * @override
   */
  sortingChanged() {
    this._topNodes.sort(this._createComparator());
    this.rootNode().removeChildren();
    this._populateChildren();
  }

  /**
   * @return {function(!Object, !Object):number}
   */
  _createComparator() {
    const fieldName = this.sortColumnId();
    const compareResult = (this.sortOrder() === DataGrid.DataGrid.Order.Ascending) ? +1 : -1;
    /**
     * @param {!Object} a
     * @param {!Object} b
     * @return {number}
     */
    function compare(a, b) {
      if (a[fieldName] > b[fieldName])
        return compareResult;
      if (a[fieldName] < b[fieldName])
        return -compareResult;
      return 0;
    }
    return compare;
  }
};
