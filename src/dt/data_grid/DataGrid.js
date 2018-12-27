/*
 * Copyright (C) 2008 Apple Inc. All Rights Reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions
 * are met:
 * 1. Redistributions of source code must retain the above copyright
 *        notice, this list of conditions and the following disclaimer.
 * 2. Redistributions in binary form must reproduce the above copyright
 *        notice, this list of conditions and the following disclaimer in the
 *        documentation and/or other materials provided with the distribution.
 *
 * THIS SOFTWARE IS PROVIDED BY APPLE INC. ``AS IS'' AND ANY
 * EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
 * IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR
 * PURPOSE ARE DISCLAIMED.         IN NO EVENT SHALL APPLE INC. OR
 * CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL,
 * EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO,
 * PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR
 * PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY
 * OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
 * OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */

/**
 * @unrestricted
 * @template NODE_TYPE
 */
DataGrid.DataGrid = class extends Common.Object {
  /**
   * @param {!Array.<!DataGrid.DataGrid.ColumnDescriptor>} columnsArray
   * @param {function(!NODE_TYPE, string, string, string)=} editCallback
   * @param {function(!NODE_TYPE)=} deleteCallback
   * @param {function()=} refreshCallback
   */
  constructor(columnsArray, editCallback, deleteCallback, refreshCallback) {
    super();
    this.element = createElementWithClass('div', 'data-grid');
    UI.appendStyle(this.element, 'data_grid/dataGrid.css');
    this.element.tabIndex = 0;
    this.element.addEventListener('keydown', this._keyDown.bind(this), false);
    this.element.addEventListener('contextmenu', this._contextMenu.bind(this), true);

    this._editCallback = editCallback;
    this._deleteCallback = deleteCallback;
    this._refreshCallback = refreshCallback;

    const headerContainer = this.element.createChild('div', 'header-container');
    /** @type {!Element} */
    this._headerTable = headerContainer.createChild('table', 'header');
    /** @type {!Object.<string, !Element>} */
    this._headerTableHeaders = {};
    /** @type {!Element} */
    this._scrollContainer = this.element.createChild('div', 'data-container');
    /** @type {!Element} */
    this._dataTable = this._scrollContainer.createChild('table', 'data');

    // FIXME: Add a createCallback which is different from editCallback and has different
    // behavior when creating a new node.
    if (editCallback)
      this._dataTable.addEventListener('dblclick', this._ondblclick.bind(this), false);
    this._dataTable.addEventListener('mousedown', this._mouseDownInDataTable.bind(this));
    this._dataTable.addEventListener('click', this._clickInDataTable.bind(this), true);

    /** @type {boolean} */
    this._inline = false;

    /** @type {!Array.<!DataGrid.DataGrid.ColumnDescriptor>} */
    this._columnsArray = [];
    /** @type {!Object.<string, !DataGrid.DataGrid.ColumnDescriptor>} */
    this._columns = {};
    /** @type {!Array.<!DataGrid.DataGrid.ColumnDescriptor>} */
    this._visibleColumnsArray = columnsArray;

    columnsArray.forEach(column => this._innerAddColumn(column));

    /** @type {?string} */
    this._cellClass = null;

    /** @type {!Element} */
    this._headerTableColumnGroup = this._headerTable.createChild('colgroup');
    /** @type {!Element} */
    this._headerTableBody = this._headerTable.createChild('tbody');
    /** @type {!Element} */
    this._headerRow = this._headerTableBody.createChild('tr');

    /** @type {!Element} */
    this._dataTableColumnGroup = this._dataTable.createChild('colgroup');
    /**
     * @protected
     * @type {!Element}
     */
    this.dataTableBody = this._dataTable.createChild('tbody');
    /** @type {!Element} */
    this._topFillerRow = this.dataTableBody.createChild('tr', 'data-grid-filler-row revealed');
    /** @type {!Element} */
    this._bottomFillerRow = this.dataTableBody.createChild('tr', 'data-grid-filler-row revealed');

    this.setVerticalPadding(0, 0);
    this._refreshHeader();

    /** @type {boolean} */
    this._editing = false;
    /** @type {?NODE_TYPE} */
    this.selectedNode = null;
    /** @type {boolean} */
    this.expandNodesWhenArrowing = false;
    this.setRootNode(/** @type {!NODE_TYPE} */ (new DataGrid.DataGridNode()));
    /** @type {number} */
    this.indentWidth = 15;
    /** @type {!Array.<!Element|{__index: number, __position: number}>} */
    this._resizers = [];
    /** @type {boolean} */
    this._columnWidthsInitialized = false;
    /** @type {number} */
    this._cornerWidth = DataGrid.DataGrid.CornerWidth;
    /** @type {!DataGrid.DataGrid.ResizeMethod} */
    this._resizeMethod = DataGrid.DataGrid.ResizeMethod.Nearest;

    /** @type {?function(!UI.ContextMenu)} */
    this._headerContextMenuCallback = null;
    /** @type {?function(!UI.ContextMenu, !NODE_TYPE)} */
    this._rowContextMenuCallback = null;
  }

  /**
   * @param {!Element} element
   * @param {string} newText
   * @param {boolean} longText
   */
  static setElementText(element, newText, longText) {
    if (longText && newText.length > 1000) {
      element.textContent = newText.trimEnd(1000);
      element.title = newText;
      element[DataGrid.DataGrid._longTextSymbol] = newText;
    } else {
      element.textContent = newText;
      element.title = '';
      element[DataGrid.DataGrid._longTextSymbol] = undefined;
    }
  }

  /**
   * @param {boolean} isStriped
   */
  setStriped(isStriped) {
    this.element.classList.toggle('striped-data-grid', isStriped);
  }

  /**
   * @return {!Element}
   */
  headerTableBody() {
    return this._headerTableBody;
  }

  /**
   * @param {!DataGrid.DataGrid.ColumnDescriptor} column
   * @param {number=} position
   */
  _innerAddColumn(column, position) {
    const columnId = column.id;
    if (columnId in this._columns)
      this._innerRemoveColumn(columnId);

    if (position === undefined)
      position = this._columnsArray.length;

    this._columnsArray.splice(position, 0, column);
    this._columns[columnId] = column;
    if (column.disclosure)
      this.disclosureColumnId = columnId;

    const cell = createElement('th');
    cell.className = columnId + '-column';
    cell[DataGrid.DataGrid._columnIdSymbol] = columnId;
    this._headerTableHeaders[columnId] = cell;

    const div = createElement('div');
    if (column.titleDOMFragment)
      div.appendChild(column.titleDOMFragment);
    else
      div.textContent = column.title;
    cell.appendChild(div);

    if (column.sort) {
      cell.classList.add(column.sort);
      this._sortColumnCell = cell;
    }

    if (column.sortable) {
      cell.addEventListener('click', this._clickInHeaderCell.bind(this), false);
      cell.classList.add('sortable');
      const icon = UI.Icon.create('', 'sort-order-icon');
      cell.createChild('div', 'sort-order-icon-container').appendChild(icon);
      cell[DataGrid.DataGrid._sortIconSymbol] = icon;
    }
  }

  /**
   * @param {!DataGrid.DataGrid.ColumnDescriptor} column
   * @param {number=} position
   */
  addColumn(column, position) {
    this._innerAddColumn(column, position);
  }

  /**
   * @param {string} columnId
   */
  _innerRemoveColumn(columnId) {
    const column = this._columns[columnId];
    if (!column)
      return;
    delete this._columns[columnId];
    const index = this._columnsArray.findIndex(columnConfig => columnConfig.id === columnId);
    this._columnsArray.splice(index, 1);
    const cell = this._headerTableHeaders[columnId];
    if (cell.parentElement)
      cell.parentElement.removeChild(cell);
    delete this._headerTableHeaders[columnId];
  }

  /**
   * @param {string} columnId
   */
  removeColumn(columnId) {
    this._innerRemoveColumn(columnId);
  }

  /**
   * @param {string} cellClass
   */
  setCellClass(cellClass) {
    this._cellClass = cellClass;
  }

  _refreshHeader() {
    this._headerTableColumnGroup.removeChildren();
    this._dataTableColumnGroup.removeChildren();
    this._headerRow.removeChildren();
    this._topFillerRow.removeChildren();
    this._bottomFillerRow.removeChildren();

    for (let i = 0; i < this._visibleColumnsArray.length; ++i) {
      const column = this._visibleColumnsArray[i];
      const columnId = column.id;
      const headerColumn = this._headerTableColumnGroup.createChild('col');
      const dataColumn = this._dataTableColumnGroup.createChild('col');
      if (column.width) {
        headerColumn.style.width = column.width;
        dataColumn.style.width = column.width;
      }
      this._headerRow.appendChild(this._headerTableHeaders[columnId]);
      this._topFillerRow.createChild('td', 'top-filler-td');
      this._bottomFillerRow.createChild('td', 'bottom-filler-td')[DataGrid.DataGrid._columnIdSymbol] = columnId;
    }

    this._headerRow.createChild('th', 'corner');
    this._topFillerRow.createChild('td', 'corner').classList.add('top-filler-td');
    this._bottomFillerRow.createChild('td', 'corner').classList.add('bottom-filler-td');
    this._headerTableColumnGroup.createChild('col', 'corner');
    this._dataTableColumnGroup.createChild('col', 'corner');
  }

  /**
   * @param {number} top
   * @param {number} bottom
   * @protected
   */
  setVerticalPadding(top, bottom) {
    const topPx = top + 'px';
    const bottomPx = (top || bottom) ? bottom + 'px' : 'auto';
    if (this._topFillerRow.style.height === topPx && this._bottomFillerRow.style.height === bottomPx)
      return;
    this._topFillerRow.style.height = topPx;
    this._bottomFillerRow.style.height = bottomPx;
    this.dispatchEventToListeners(DataGrid.DataGrid.Events.PaddingChanged);
  }

  /**
   * @param {!NODE_TYPE} rootNode
   * @protected
   */
  setRootNode(rootNode) {
    if (this._rootNode) {
      this._rootNode.removeChildren();
      this._rootNode.dataGrid = null;
      this._rootNode._isRoot = false;
    }
    /** @type {!NODE_TYPE} */
    this._rootNode = rootNode;
    rootNode._isRoot = true;
    rootNode.setHasChildren(false);
    rootNode._expanded = true;
    rootNode._revealed = true;
    rootNode.selectable = false;
    rootNode.dataGrid = this;
  }

  /**
   * @return {!NODE_TYPE}
   */
  rootNode() {
    return this._rootNode;
  }

  /**
   * @param {!Event} event
   */
  _ondblclick(event) {
    if (this._editing || this._editingNode)
      return;

    const columnId = this.columnIdFromNode(/** @type {!Node} */ (event.target));
    if (!columnId || !this._columns[columnId].editable)
      return;
    this._startEditing(/** @type {!Node} */ (event.target));
  }

  /**
   * @param {!DataGrid.DataGridNode} node
   * @param {number} cellIndex
   */
  _startEditingColumnOfDataGridNode(node, cellIndex) {
    this._editing = true;
    /** @type {?DataGrid.DataGridNode} */
    this._editingNode = node;
    this._editingNode.select();

    const element = this._editingNode._element.children[cellIndex];
    UI.InplaceEditor.startEditing(element, this._startEditingConfig(element));
    element.getComponentSelection().selectAllChildren(element);
  }

  /**
   * @param {!DataGrid.DataGridNode} node
   * @param {string} columnIdentifier
   */
  startEditingNextEditableColumnOfDataGridNode(node, columnIdentifier) {
    const column = this._columns[columnIdentifier];
    const cellIndex = this._visibleColumnsArray.indexOf(column);
    const nextEditableColumn = this._nextEditableColumn(cellIndex);
    if (nextEditableColumn !== -1)
      this._startEditingColumnOfDataGridNode(node, nextEditableColumn);
  }

  /**
   * @param {!Node} target
   */
  _startEditing(target) {
    const element = /** @type {?Element} */ (target.enclosingNodeOrSelfWithNodeName('td'));
    if (!element)
      return;

    this._editingNode = this.dataGridNodeFromNode(target);
    if (!this._editingNode) {
      if (!this.creationNode)
        return;
      this._editingNode = this.creationNode;
    }

    // Force editing the 1st column when editing the creation node
    if (this._editingNode.isCreationNode) {
      this._startEditingColumnOfDataGridNode(this._editingNode, this._nextEditableColumn(-1));
      return;
    }

    this._editing = true;
    if (element[DataGrid.DataGrid._longTextSymbol])
      element.textContent = element[DataGrid.DataGrid._longTextSymbol];
    UI.InplaceEditor.startEditing(element, this._startEditingConfig(element));

    element.getComponentSelection().selectAllChildren(element);
  }

  renderInline() {
    this.element.classList.add('inline');
    this._cornerWidth = 0;
    this._inline = true;
    this.updateWidths();
  }

  /**
   * @param {!Element} element
   * @return {!UI.InplaceEditor.Config}
   */
  _startEditingConfig(element) {
    return new UI.InplaceEditor.Config(this._editingCommitted.bind(this), this._editingCancelled.bind(this));
  }

  /**
   * @param {!Element} element
   * @param {string} newText
   * @param {string} oldText
   * @param {string|undefined} context
   * @param {string} moveDirection
   */
  _editingCommitted(element, newText, oldText, context, moveDirection) {
    const columnId = this.columnIdFromNode(element);
    if (!columnId) {
      this._editingCancelled(element);
      return;
    }
    const column = this._columns[columnId];
    const cellIndex = this._visibleColumnsArray.indexOf(column);
    const textBeforeEditing = /** @type {string} */ (this._editingNode.data[columnId] || '');
    const currentEditingNode = this._editingNode;

    /**
     * @param {boolean} wasChange
     * @this {DataGrid.DataGrid}
     */
    function moveToNextIfNeeded(wasChange) {
      if (!moveDirection)
        return;

      if (moveDirection === 'forward') {
        const firstEditableColumn = this._nextEditableColumn(-1);
        if (currentEditingNode.isCreationNode && cellIndex === firstEditableColumn && !wasChange)
          return;

        const nextEditableColumn = this._nextEditableColumn(cellIndex);
        if (nextEditableColumn !== -1) {
          this._startEditingColumnOfDataGridNode(currentEditingNode, nextEditableColumn);
          return;
        }

        const nextDataGridNode = currentEditingNode.traverseNextNode(true, null, true);
        if (nextDataGridNode) {
          this._startEditingColumnOfDataGridNode(nextDataGridNode, firstEditableColumn);
          return;
        }
        if (currentEditingNode.isCreationNode && wasChange) {
          this.addCreationNode(false);
          this._startEditingColumnOfDataGridNode(this.creationNode, firstEditableColumn);
          return;
        }
        return;
      }

      if (moveDirection === 'backward') {
        const prevEditableColumn = this._nextEditableColumn(cellIndex, true);
        if (prevEditableColumn !== -1) {
          this._startEditingColumnOfDataGridNode(currentEditingNode, prevEditableColumn);
          return;
        }

        const lastEditableColumn = this._nextEditableColumn(this._visibleColumnsArray.length, true);
        const nextDataGridNode = currentEditingNode.traversePreviousNode(true, true);
        if (nextDataGridNode)
          this._startEditingColumnOfDataGridNode(nextDataGridNode, lastEditableColumn);
        return;
      }
    }

    // Show trimmed text after editing.
    DataGrid.DataGrid.setElementText(element, newText, !!column.longText);

    if (textBeforeEditing === newText) {
      this._editingCancelled(element);
      moveToNextIfNeeded.call(this, false);
      return;
    }

    // Update the text in the datagrid that we typed
    this._editingNode.data[columnId] = newText;

    // Make the callback - expects an editing node (table row), the column number that is being edited,
    // the text that used to be there, and the new text.
    this._editCallback(this._editingNode, columnId, textBeforeEditing, newText);

    if (this._editingNode.isCreationNode)
      this.addCreationNode(false);

    this._editingCancelled(element);
    moveToNextIfNeeded.call(this, true);
  }

  /**
   * @param {!Element} element
   */
  _editingCancelled(element) {
    this._editing = false;
    this._editingNode = null;
  }

  /**
   * @param {number} cellIndex
   * @param {boolean=} moveBackward
   * @return {number}
   */
  _nextEditableColumn(cellIndex, moveBackward) {
    const increment = moveBackward ? -1 : 1;
    const columns = this._visibleColumnsArray;
    for (let i = cellIndex + increment; (i >= 0) && (i < columns.length); i += increment) {
      if (columns[i].editable)
        return i;
    }
    return -1;
  }

  /**
   * @return {?string}
   */
  sortColumnId() {
    if (!this._sortColumnCell)
      return null;
    return this._sortColumnCell[DataGrid.DataGrid._columnIdSymbol];
  }

  /**
   * @return {?string}
   */
  sortOrder() {
    if (!this._sortColumnCell || this._sortColumnCell.classList.contains(DataGrid.DataGrid.Order.Ascending))
      return DataGrid.DataGrid.Order.Ascending;
    if (this._sortColumnCell.classList.contains(DataGrid.DataGrid.Order.Descending))
      return DataGrid.DataGrid.Order.Descending;
    return null;
  }

  /**
   * @return {boolean}
   */
  isSortOrderAscending() {
    return !this._sortColumnCell || this._sortColumnCell.classList.contains(DataGrid.DataGrid.Order.Ascending);
  }

  /**
   * @param {!Array.<number>} widths
   * @param {number} minPercent
   * @param {number=} maxPercent
   * @return {!Array.<number>}
   */
  _autoSizeWidths(widths, minPercent, maxPercent) {
    if (minPercent)
      minPercent = Math.min(minPercent, Math.floor(100 / widths.length));
    let totalWidth = 0;
    for (let i = 0; i < widths.length; ++i)
      totalWidth += widths[i];
    let totalPercentWidth = 0;
    for (let i = 0; i < widths.length; ++i) {
      let width = Math.round(100 * widths[i] / totalWidth);
      if (minPercent && width < minPercent)
        width = minPercent;
      else if (maxPercent && width > maxPercent)
        width = maxPercent;
      totalPercentWidth += width;
      widths[i] = width;
    }
    let recoupPercent = totalPercentWidth - 100;

    while (minPercent && recoupPercent > 0) {
      for (let i = 0; i < widths.length; ++i) {
        if (widths[i] > minPercent) {
          --widths[i];
          --recoupPercent;
          if (!recoupPercent)
            break;
        }
      }
    }

    while (maxPercent && recoupPercent < 0) {
      for (let i = 0; i < widths.length; ++i) {
        if (widths[i] < maxPercent) {
          ++widths[i];
          ++recoupPercent;
          if (!recoupPercent)
            break;
        }
      }
    }

    return widths;
  }

  /**
   * @param {number} minPercent
   * @param {number=} maxPercent
   * @param {number=} maxDescentLevel
   */
  autoSizeColumns(minPercent, maxPercent, maxDescentLevel) {
    let widths = [];
    for (let i = 0; i < this._columnsArray.length; ++i)
      widths.push((this._columnsArray[i].title || '').length);

    maxDescentLevel = maxDescentLevel || 0;
    const children = this._enumerateChildren(this._rootNode, [], maxDescentLevel + 1);
    for (let i = 0; i < children.length; ++i) {
      const node = children[i];
      for (let j = 0; j < this._columnsArray.length; ++j) {
        const text = String(node.data[this._columnsArray[j].id]);
        if (text.length > widths[j])
          widths[j] = text.length;
      }
    }

    widths = this._autoSizeWidths(widths, minPercent, maxPercent);

    for (let i = 0; i < this._columnsArray.length; ++i)
      this._columnsArray[i].weight = widths[i];
    this._columnWidthsInitialized = false;
    this.updateWidths();
  }

  /**
   * @param {!DataGrid.DataGridNode} rootNode
   * @param {!Array<!DataGrid.DataGridNode>} result
   * @param {number} maxLevel
   * @return {!Array<!NODE_TYPE>}
   */
  _enumerateChildren(rootNode, result, maxLevel) {
    if (!rootNode._isRoot)
      result.push(rootNode);
    if (!maxLevel)
      return [];
    for (let i = 0; i < rootNode.children.length; ++i)
      this._enumerateChildren(rootNode.children[i], result, maxLevel - 1);
    return result;
  }

  onResize() {
    this.updateWidths();
  }

  // Updates the widths of the table, including the positions of the column
  // resizers.
  //
  // IMPORTANT: This function MUST be called once after the element of the
  // DataGrid is attached to its parent element and every subsequent time the
  // width of the parent element is changed in order to make it possible to
  // resize the columns.
  //
  // If this function is not called after the DataGrid is attached to its
  // parent element, then the DataGrid's columns will not be resizable.
  updateWidths() {
    // Do not attempt to use offsetes if we're not attached to the document tree yet.
    if (!this._columnWidthsInitialized && this.element.offsetWidth) {
      // Give all the columns initial widths now so that during a resize,
      // when the two columns that get resized get a percent value for
      // their widths, all the other columns already have percent values
      // for their widths.

      // Use container size to avoid changes of table width caused by change of column widths.
      const tableWidth = this.element.offsetWidth - this._cornerWidth;
      const cells = this._headerTableBody.rows[0].cells;
      const numColumns = cells.length - 1;  // Do not process corner column.
      for (let i = 0; i < numColumns; i++) {
        const column = this._visibleColumnsArray[i];
        if (!column.weight)
          column.weight = 100 * cells[i].offsetWidth / tableWidth || 10;
      }
      this._columnWidthsInitialized = true;
    }
    this._applyColumnWeights();
  }

  /**
   * @param {string} name
   */
  setName(name) {
    this._columnWeightsSetting = Common.settings.createSetting('dataGrid-' + name + '-columnWeights', {});
    this._loadColumnWeights();
  }

  _loadColumnWeights() {
    if (!this._columnWeightsSetting)
      return;
    const weights = this._columnWeightsSetting.get();
    for (let i = 0; i < this._columnsArray.length; ++i) {
      const column = this._columnsArray[i];
      const weight = weights[column.id];
      if (weight)
        column.weight = weight;
    }
    this._applyColumnWeights();
  }

  _saveColumnWeights() {
    if (!this._columnWeightsSetting)
      return;
    const weights = {};
    for (let i = 0; i < this._columnsArray.length; ++i) {
      const column = this._columnsArray[i];
      weights[column.id] = column.weight;
    }
    this._columnWeightsSetting.set(weights);
  }

  wasShown() {
    this._loadColumnWeights();
  }

  willHide() {
  }

  _applyColumnWeights() {
    let tableWidth = this.element.offsetWidth - this._cornerWidth;
    if (tableWidth <= 0)
      return;

    let sumOfWeights = 0.0;
    const fixedColumnWidths = [];
    for (let i = 0; i < this._visibleColumnsArray.length; ++i) {
      const column = this._visibleColumnsArray[i];
      if (column.fixedWidth) {
        const width = this._headerTableColumnGroup.children[i][DataGrid.DataGrid._preferredWidthSymbol] ||
            this._headerTableBody.rows[0].cells[i].offsetWidth;
        fixedColumnWidths[i] = width;
        tableWidth -= width;
      } else {
        sumOfWeights += this._visibleColumnsArray[i].weight;
      }
    }
    let sum = 0;
    let lastOffset = 0;

    for (let i = 0; i < this._visibleColumnsArray.length; ++i) {
      const column = this._visibleColumnsArray[i];
      let width;
      if (column.fixedWidth) {
        width = fixedColumnWidths[i];
      } else {
        sum += column.weight;
        const offset = (sum * tableWidth / sumOfWeights) | 0;
        width = offset - lastOffset;
        lastOffset = offset;
      }
      this._setPreferredWidth(i, width);
    }

    this._positionResizers();
  }

  /**
   * @param {!Object.<string, boolean>} columnsVisibility
   */
  setColumnsVisiblity(columnsVisibility) {
    this._visibleColumnsArray = [];
    for (let i = 0; i < this._columnsArray.length; ++i) {
      const column = this._columnsArray[i];
      if (columnsVisibility[column.id])
        this._visibleColumnsArray.push(column);
    }
    this._refreshHeader();
    this._applyColumnWeights();
    const nodes = this._enumerateChildren(this.rootNode(), [], -1);
    for (let i = 0; i < nodes.length; ++i)
      nodes[i].refresh();
  }

  get scrollContainer() {
    return this._scrollContainer;
  }

  _positionResizers() {
    const headerTableColumns = this._headerTableColumnGroup.children;
    const numColumns = headerTableColumns.length - 1;  // Do not process corner column.
    const left = [];
    const resizers = this._resizers;

    while (resizers.length > numColumns - 1)
      resizers.pop().remove();

    for (let i = 0; i < numColumns - 1; i++) {
      // Get the width of the cell in the first (and only) row of the
      // header table in order to determine the width of the column, since
      // it is not possible to query a column for its width.
      left[i] = (left[i - 1] || 0) + this._headerTableBody.rows[0].cells[i].offsetWidth;
    }

    // Make n - 1 resizers for n columns.
    for (let i = 0; i < numColumns - 1; i++) {
      let resizer = resizers[i];
      if (!resizer) {
        // This is the first call to updateWidth, so the resizers need
        // to be created.
        resizer = createElement('div');
        resizer.__index = i;
        resizer.classList.add('data-grid-resizer');
        // This resizer is associated with the column to its right.
        UI.installDragHandle(
            resizer, this._startResizerDragging.bind(this), this._resizerDragging.bind(this),
            this._endResizerDragging.bind(this), 'col-resize');
        this.element.appendChild(resizer);
        resizers.push(resizer);
      }
      if (resizer.__position !== left[i]) {
        resizer.__position = left[i];
        resizer.style.left = left[i] + 'px';
      }
    }
  }

  addCreationNode(hasChildren) {
    if (this.creationNode)
      this.creationNode.makeNormal();

    const emptyData = {};
    for (const column in this._columns)
      emptyData[column] = null;
    this.creationNode = new DataGrid.CreationDataGridNode(emptyData, hasChildren);
    this.rootNode().appendChild(this.creationNode);
  }

  /**
   * @param {!Event} event
   */
  _keyDown(event) {
    if (!this.selectedNode || event.shiftKey || event.metaKey || event.ctrlKey || this._editing || UI.isEditing())
      return;

    let handled = false;
    let nextSelectedNode;
    if (event.key === 'ArrowUp' && !event.altKey) {
      nextSelectedNode = this.selectedNode.traversePreviousNode(true);
      while (nextSelectedNode && !nextSelectedNode.selectable)
        nextSelectedNode = nextSelectedNode.traversePreviousNode(true);
      handled = nextSelectedNode ? true : false;
    } else if (event.key === 'ArrowDown' && !event.altKey) {
      nextSelectedNode = this.selectedNode.traverseNextNode(true);
      while (nextSelectedNode && !nextSelectedNode.selectable)
        nextSelectedNode = nextSelectedNode.traverseNextNode(true);
      handled = nextSelectedNode ? true : false;
    } else if (event.key === 'ArrowLeft') {
      if (this.selectedNode.expanded) {
        if (event.altKey)
          this.selectedNode.collapseRecursively();
        else
          this.selectedNode.collapse();
        handled = true;
      } else if (this.selectedNode.parent && !this.selectedNode.parent._isRoot) {
        handled = true;
        if (this.selectedNode.parent.selectable) {
          nextSelectedNode = this.selectedNode.parent;
          handled = nextSelectedNode ? true : false;
        } else if (this.selectedNode.parent) {
          this.selectedNode.parent.collapse();
        }
      }
    } else if (event.key === 'ArrowRight') {
      if (!this.selectedNode.revealed) {
        this.selectedNode.reveal();
        handled = true;
      } else if (this.selectedNode.hasChildren()) {
        handled = true;
        if (this.selectedNode.expanded) {
          nextSelectedNode = this.selectedNode.children[0];
          handled = nextSelectedNode ? true : false;
        } else {
          if (event.altKey)
            this.selectedNode.expandRecursively();
          else
            this.selectedNode.expand();
        }
      }
    } else if (event.keyCode === 8 || event.keyCode === 46) {
      if (this._deleteCallback) {
        handled = true;
        this._deleteCallback(this.selectedNode);
      }
    } else if (isEnterKey(event)) {
      if (this._editCallback) {
        handled = true;
        this._startEditing(this.selectedNode._element.children[this._nextEditableColumn(-1)]);
      } else {
        this.dispatchEventToListeners(DataGrid.DataGrid.Events.OpenedNode, this.selectedNode);
      }
    }

    if (nextSelectedNode) {
      nextSelectedNode.reveal();
      nextSelectedNode.select();
    }
    if (handled)
      event.consume(true);
  }

  /**
   * @param {?NODE_TYPE} root
   * @param {boolean} onlyAffectsSubtree
   */
  updateSelectionBeforeRemoval(root, onlyAffectsSubtree) {
    let ancestor = this.selectedNode;
    while (ancestor && ancestor !== root)
      ancestor = ancestor.parent;
    // Selection is not in the subtree being deleted.
    if (!ancestor)
      return;

    let nextSelectedNode;
    // Skip subtree being deleted when looking for the next selectable node.
    for (ancestor = root; ancestor && !ancestor.nextSibling; ancestor = ancestor.parent) {
    }
    if (ancestor)
      nextSelectedNode = ancestor.nextSibling;
    while (nextSelectedNode && !nextSelectedNode.selectable)
      nextSelectedNode = nextSelectedNode.traverseNextNode(true);

    if (!nextSelectedNode || nextSelectedNode.isCreationNode) {
      nextSelectedNode = root.traversePreviousNode(true);
      while (nextSelectedNode && !nextSelectedNode.selectable)
        nextSelectedNode = nextSelectedNode.traversePreviousNode(true);
    }
    if (nextSelectedNode) {
      nextSelectedNode.reveal();
      nextSelectedNode.select();
    } else {
      this.selectedNode.deselect();
    }
  }

  /**
   * @param {!Node} target
   * @return {?NODE_TYPE}
   */
  dataGridNodeFromNode(target) {
    const rowElement = target.enclosingNodeOrSelfWithNodeName('tr');
    return rowElement && rowElement._dataGridNode;
  }

  /**
   * @param {!Node} target
   * @return {?string}
   */
  columnIdFromNode(target) {
    const cellElement = target.enclosingNodeOrSelfWithNodeName('td');
    return cellElement && cellElement[DataGrid.DataGrid._columnIdSymbol];
  }

  /**
   * @param {!Event} event
   */
  _clickInHeaderCell(event) {
    const cell = event.target.enclosingNodeOrSelfWithNodeName('th');
    if (!cell || (cell[DataGrid.DataGrid._columnIdSymbol] === undefined) || !cell.classList.contains('sortable'))
      return;

    let sortOrder = DataGrid.DataGrid.Order.Ascending;
    if ((cell === this._sortColumnCell) && this.isSortOrderAscending())
      sortOrder = DataGrid.DataGrid.Order.Descending;

    if (this._sortColumnCell)
      this._sortColumnCell.classList.remove(DataGrid.DataGrid.Order.Ascending, DataGrid.DataGrid.Order.Descending);
    this._sortColumnCell = cell;

    cell.classList.add(sortOrder);
    const icon = cell[DataGrid.DataGrid._sortIconSymbol];
    icon.setIconType(
        sortOrder === DataGrid.DataGrid.Order.Ascending ? 'smallicon-triangle-up' : 'smallicon-triangle-down');

    this.dispatchEventToListeners(DataGrid.DataGrid.Events.SortingChanged);
  }

  /**
   * @param {string} columnId
   * @param {!DataGrid.DataGrid.Order} sortOrder
   */
  markColumnAsSortedBy(columnId, sortOrder) {
    if (this._sortColumnCell)
      this._sortColumnCell.classList.remove(DataGrid.DataGrid.Order.Ascending, DataGrid.DataGrid.Order.Descending);
    this._sortColumnCell = this._headerTableHeaders[columnId];
    this._sortColumnCell.classList.add(sortOrder);
  }

  /**
   * @param {string} columnId
   * @return {!Element}
   */
  headerTableHeader(columnId) {
    return this._headerTableHeaders[columnId];
  }

  /**
   * @param {!Event} event
   */
  _mouseDownInDataTable(event) {
    const target = /** @type {!Node} */ (event.target);
    const gridNode = this.dataGridNodeFromNode(target);
    if (!gridNode || !gridNode.selectable || gridNode.isEventWithinDisclosureTriangle(event))
      return;

    const columnId = this.columnIdFromNode(target);
    if (columnId && this._columns[columnId].nonSelectable)
      return;

    if (event.metaKey) {
      if (gridNode.selected)
        gridNode.deselect();
      else
        gridNode.select();
    } else {
      gridNode.select();
      this.dispatchEventToListeners(DataGrid.DataGrid.Events.OpenedNode, gridNode);
    }
  }

  /**
   * @param {?function(!UI.ContextMenu)} callback
   */
  setHeaderContextMenuCallback(callback) {
    this._headerContextMenuCallback = callback;
  }

  /**
   * @param {?function(!UI.ContextMenu, !NODE_TYPE)} callback
   */
  setRowContextMenuCallback(callback) {
    this._rowContextMenuCallback = callback;
  }

  /**
   * @param {!Event} event
   */
  _contextMenu(event) {
    const contextMenu = new UI.ContextMenu(event);
    const target = /** @type {!Node} */ (event.target);

    if (target.isSelfOrDescendant(this._headerTableBody)) {
      if (this._headerContextMenuCallback)
        this._headerContextMenuCallback(contextMenu);
      return;
    }

    const gridNode = this.dataGridNodeFromNode(target);
    if (this._refreshCallback && (!gridNode || gridNode !== this.creationNode))
      contextMenu.defaultSection().appendItem(Common.UIString('Refresh'), this._refreshCallback.bind(this));

    if (gridNode && gridNode.selectable && !gridNode.isEventWithinDisclosureTriangle(event)) {
      if (this._editCallback) {
        if (gridNode === this.creationNode) {
          contextMenu.defaultSection().appendItem(Common.UIString('Add new'), this._startEditing.bind(this, target));
        } else {
          const columnId = this.columnIdFromNode(target);
          if (columnId && this._columns[columnId].editable) {
            contextMenu.defaultSection().appendItem(
                Common.UIString('Edit "%s"', this._columns[columnId].title), this._startEditing.bind(this, target));
          }
        }
      }
      if (this._deleteCallback && gridNode !== this.creationNode)
        contextMenu.defaultSection().appendItem(Common.UIString('Delete'), this._deleteCallback.bind(this, gridNode));
      if (this._rowContextMenuCallback)
        this._rowContextMenuCallback(contextMenu, gridNode);
    }

    contextMenu.show();
  }

  /**
   * @param {!Event} event
   */
  _clickInDataTable(event) {
    const gridNode = this.dataGridNodeFromNode(/** @type {!Node} */ (event.target));
    if (!gridNode || !gridNode.hasChildren() || !gridNode.isEventWithinDisclosureTriangle(event))
      return;

    if (gridNode.expanded) {
      if (event.altKey)
        gridNode.collapseRecursively();
      else
        gridNode.collapse();
    } else {
      if (event.altKey)
        gridNode.expandRecursively();
      else
        gridNode.expand();
    }
  }

  /**
   * @param {!DataGrid.DataGrid.ResizeMethod} method
   */
  setResizeMethod(method) {
    this._resizeMethod = method;
  }

  /**
   * @param {!Event} event
   * @return {boolean}
   */
  _startResizerDragging(event) {
    this._currentResizer = event.target;
    return true;
  }

  _endResizerDragging() {
    this._currentResizer = null;
    this._saveColumnWeights();
  }

  /**
   * @param {!Event} event
   */
  _resizerDragging(event) {
    const resizer = this._currentResizer;
    if (!resizer)
      return;

    // Constrain the dragpoint to be within the containing div of the
    // datagrid.
    let dragPoint = event.clientX - this.element.totalOffsetLeft();
    const firstRowCells = this._headerTableBody.rows[0].cells;
    let leftEdgeOfPreviousColumn = 0;
    // Constrain the dragpoint to be within the space made up by the
    // column directly to the left and the column directly to the right.
    let leftCellIndex = resizer.__index;
    let rightCellIndex = leftCellIndex + 1;
    for (let i = 0; i < leftCellIndex; i++)
      leftEdgeOfPreviousColumn += firstRowCells[i].offsetWidth;

    // Differences for other resize methods
    if (this._resizeMethod === DataGrid.DataGrid.ResizeMethod.Last) {
      rightCellIndex = this._resizers.length;
    } else if (this._resizeMethod === DataGrid.DataGrid.ResizeMethod.First) {
      leftEdgeOfPreviousColumn += firstRowCells[leftCellIndex].offsetWidth - firstRowCells[0].offsetWidth;
      leftCellIndex = 0;
    }

    const rightEdgeOfNextColumn =
        leftEdgeOfPreviousColumn + firstRowCells[leftCellIndex].offsetWidth + firstRowCells[rightCellIndex].offsetWidth;

    // Give each column some padding so that they don't disappear.
    const leftMinimum = leftEdgeOfPreviousColumn + DataGrid.DataGrid.ColumnResizePadding;
    const rightMaximum = rightEdgeOfNextColumn - DataGrid.DataGrid.ColumnResizePadding;
    if (leftMinimum > rightMaximum)
      return;

    dragPoint = Number.constrain(dragPoint, leftMinimum, rightMaximum);

    const position = (dragPoint - DataGrid.DataGrid.CenterResizerOverBorderAdjustment);
    resizer.__position = position;
    resizer.style.left = position + 'px';

    this._setPreferredWidth(leftCellIndex, dragPoint - leftEdgeOfPreviousColumn);
    this._setPreferredWidth(rightCellIndex, rightEdgeOfNextColumn - dragPoint);

    const leftColumn = this._visibleColumnsArray[leftCellIndex];
    const rightColumn = this._visibleColumnsArray[rightCellIndex];
    if (leftColumn.weight || rightColumn.weight) {
      const sumOfWeights = leftColumn.weight + rightColumn.weight;
      const delta = rightEdgeOfNextColumn - leftEdgeOfPreviousColumn;
      leftColumn.weight = (dragPoint - leftEdgeOfPreviousColumn) * sumOfWeights / delta;
      rightColumn.weight = (rightEdgeOfNextColumn - dragPoint) * sumOfWeights / delta;
    }

    this._positionResizers();
    event.preventDefault();
  }

  /**
   * @param {number} columnIndex
   * @param {number} width
   */
  _setPreferredWidth(columnIndex, width) {
    const pxWidth = width + 'px';
    this._headerTableColumnGroup.children[columnIndex][DataGrid.DataGrid._preferredWidthSymbol] = width;
    this._headerTableColumnGroup.children[columnIndex].style.width = pxWidth;
    this._dataTableColumnGroup.children[columnIndex].style.width = pxWidth;
  }

  /**
   * @param {string} columnId
   * @return {number}
   */
  columnOffset(columnId) {
    if (!this.element.offsetWidth)
      return 0;
    for (let i = 1; i < this._visibleColumnsArray.length; ++i) {
      if (columnId === this._visibleColumnsArray[i].id) {
        if (this._resizers[i - 1])
          return this._resizers[i - 1].__position;
      }
    }
    return 0;
  }

  /**
   * @return {!DataGrid.DataGridWidget}
   */
  asWidget() {
    if (!this._dataGridWidget)
      this._dataGridWidget = new DataGrid.DataGridWidget(this);
    return this._dataGridWidget;
  }

  topFillerRowElement() {
    return this._topFillerRow;
  }
};

// Keep in sync with .data-grid col.corner style rule.
DataGrid.DataGrid.CornerWidth = 14;

/**
 * @typedef {{
 *   id: string,
 *   title: (string|undefined),
 *   titleDOMFragment: (?DocumentFragment|undefined),
 *   sortable: boolean,
 *   sort: (?DataGrid.DataGrid.Order|undefined),
 *   align: (?DataGrid.DataGrid.Align|undefined),
 *   fixedWidth: (boolean|undefined),
 *   editable: (boolean|undefined),
 *   nonSelectable: (boolean|undefined),
 *   longText: (boolean|undefined),
 *   disclosure: (boolean|undefined),
 *   weight: (number|undefined)
 * }}
 */
DataGrid.DataGrid.ColumnDescriptor;

/** @enum {symbol} */
DataGrid.DataGrid.Events = {
  SelectedNode: Symbol('SelectedNode'),
  DeselectedNode: Symbol('DeselectedNode'),
  OpenedNode: Symbol('OpenedNode'),
  SortingChanged: Symbol('SortingChanged'),
  PaddingChanged: Symbol('PaddingChanged'),
};

/** @enum {string} */
DataGrid.DataGrid.Order = {
  Ascending: 'sort-ascending',
  Descending: 'sort-descending'
};

/** @enum {string} */
DataGrid.DataGrid.Align = {
  Center: 'center',
  Right: 'right'
};

DataGrid.DataGrid._preferredWidthSymbol = Symbol('preferredWidth');
DataGrid.DataGrid._columnIdSymbol = Symbol('columnId');
DataGrid.DataGrid._sortIconSymbol = Symbol('sortIcon');
DataGrid.DataGrid._longTextSymbol = Symbol('longText');

DataGrid.DataGrid.ColumnResizePadding = 24;
DataGrid.DataGrid.CenterResizerOverBorderAdjustment = 3;

/** @enum {string} */
DataGrid.DataGrid.ResizeMethod = {
  Nearest: 'nearest',
  First: 'first',
  Last: 'last'
};

/**
 * @unrestricted
 * @template NODE_TYPE
 */
DataGrid.DataGridNode = class extends Common.Object {
  /**
   * @param {?Object.<string, *>=} data
   * @param {boolean=} hasChildren
   */
  constructor(data, hasChildren) {
    super();
    /** @type {?Element} */
    this._element = null;
    /** @type {boolean} */
    this._expanded = false;
    /** @type {boolean} */
    this._selected = false;
    /** @type {boolean} */
    this._dirty = false;
    /** @type {boolean} */
    this._inactive = false;
    /** @type {number|undefined} */
    this._depth;
    /** @type {boolean|undefined} */
    this._revealed;
    /** @type {boolean} */
    this._attached = false;
    /** @type {?{parent: !NODE_TYPE, index: number}} */
    this._savedPosition = null;
    /** @type {boolean} */
    this._shouldRefreshChildren = true;
    /** @type {!Object.<string, *>} */
    this._data = data || {};
    /** @type {boolean} */
    this._hasChildren = hasChildren || false;
    /** @type {!Array.<!NODE_TYPE>} */
    this.children = [];
    /** @type {?DataGrid.DataGrid} */
    this.dataGrid = null;
    /** @type {?NODE_TYPE} */
    this.parent = null;
    /** @type {?NODE_TYPE} */
    this.previousSibling = null;
    /** @type {?NODE_TYPE} */
    this.nextSibling = null;
    /** @type {number} */
    this.disclosureToggleWidth = 10;

    /** @type {boolean} */
    this.selectable = true;

    /** @type {boolean} */
    this._isRoot = false;
  }

  /**
   * @return {!Element}
   */
  element() {
    if (!this._element) {
      const element = this.createElement();
      this.createCells(element);
    }
    return /** @type {!Element} */ (this._element);
  }

  /**
   * @protected
   * @return {!Element}
   */
  createElement() {
    this._element = createElementWithClass('tr', 'data-grid-data-grid-node');
    this._element._dataGridNode = this;

    if (this._hasChildren)
      this._element.classList.add('parent');
    if (this.expanded)
      this._element.classList.add('expanded');
    if (this.selected)
      this._element.classList.add('selected');
    if (this.revealed)
      this._element.classList.add('revealed');
    if (this.dirty)
      this._element.classList.add('dirty');
    if (this.inactive)
      this._element.classList.add('inactive');
    return this._element;
  }

  /**
   * @return {?Element}
   */
  existingElement() {
    return this._element || null;
  }

  /**
   * @protected
   */
  resetElement() {
    this._element = null;
  }

  /**
   * @param {!Element} element
   * @protected
   */
  createCells(element) {
    element.removeChildren();
    const columnsArray = this.dataGrid._visibleColumnsArray;
    for (let i = 0; i < columnsArray.length; ++i)
      element.appendChild(this.createCell(columnsArray[i].id));
    element.appendChild(this._createTDWithClass('corner'));
  }

  /**
   * @return {!Object.<string, *>}
   */
  get data() {
    return this._data;
  }

  /**
   * @param {!Object.<string, *>} x
   */
  set data(x) {
    this._data = x || {};
    this.refresh();
  }

  /**
   * @return {boolean}
   */
  get revealed() {
    if (this._revealed !== undefined)
      return this._revealed;

    let currentAncestor = this.parent;
    while (currentAncestor && !currentAncestor._isRoot) {
      if (!currentAncestor.expanded) {
        this._revealed = false;
        return false;
      }

      currentAncestor = currentAncestor.parent;
    }

    this.revealed = true;
    return true;
  }

  /**
   * @param {boolean} x
   */
  set revealed(x) {
    if (this._revealed === x)
      return;

    this._revealed = x;

    if (this._element)
      this._element.classList.toggle('revealed', this._revealed);

    for (let i = 0; i < this.children.length; ++i)
      this.children[i].revealed = x && this.expanded;
  }

  /**
   * @return {boolean}
   */
  isDirty() {
    return this._dirty;
  }

  /**
   * @param {boolean} dirty
   */
  setDirty(dirty) {
    if (this._dirty === dirty)
      return;
    this._dirty = dirty;
    if (!this._element)
      return;
    if (dirty)
      this._element.classList.add('dirty');
    else
      this._element.classList.remove('dirty');
  }


  /**
   * @return {boolean}
   */
  isInactive() {
    return this._inactive;
  }

  /**
   * @param {boolean} inactive
   */
  setInactive(inactive) {
    if (this._inactive === inactive)
      return;
    this._inactive = inactive;
    if (!this._element)
      return;
    if (inactive)
      this._element.classList.add('inactive');
    else
      this._element.classList.remove('inactive');
  }

  /**
   * @return {boolean}
   */
  hasChildren() {
    return this._hasChildren;
  }

  /**
   * @param {boolean} x
   */
  setHasChildren(x) {
    if (this._hasChildren === x)
      return;

    this._hasChildren = x;

    if (!this._element)
      return;

    this._element.classList.toggle('parent', this._hasChildren);
    this._element.classList.toggle('expanded', this._hasChildren && this.expanded);
  }

  /**
   * @return {number}
   */
  get depth() {
    if (this._depth !== undefined)
      return this._depth;
    if (this.parent && !this.parent._isRoot)
      this._depth = this.parent.depth + 1;
    else
      this._depth = 0;
    return this._depth;
  }

  /**
   * @return {number}
   */
  get leftPadding() {
    return this.depth * this.dataGrid.indentWidth;
  }

  /**
   * @return {boolean}
   */
  get shouldRefreshChildren() {
    return this._shouldRefreshChildren;
  }

  /**
   * @param {boolean} x
   */
  set shouldRefreshChildren(x) {
    this._shouldRefreshChildren = x;
    if (x && this.expanded)
      this.expand();
  }

  /**
   * @return {boolean}
   */
  get selected() {
    return this._selected;
  }

  /**
   * @param {boolean} x
   */
  set selected(x) {
    if (x)
      this.select();
    else
      this.deselect();
  }

  /**
   * @return {boolean}
   */
  get expanded() {
    return this._expanded;
  }

  /**
   * @param {boolean} x
   */
  set expanded(x) {
    if (x)
      this.expand();
    else
      this.collapse();
  }

  refresh() {
    if (!this.dataGrid)
      this._element = null;
    if (!this._element)
      return;
    this.createCells(this._element);
  }

  /**
   * @param {string} className
   * @return {!Element}
   */
  _createTDWithClass(className) {
    const cell = createElementWithClass('td', className);
    const cellClass = this.dataGrid._cellClass;
    if (cellClass)
      cell.classList.add(cellClass);
    return cell;
  }

  /**
   * @param {string} columnId
   * @return {!Element}
   */
  createTD(columnId) {
    const cell = this._createTDWithClass(columnId + '-column');
    cell[DataGrid.DataGrid._columnIdSymbol] = columnId;

    const alignment = this.dataGrid._columns[columnId].align;
    if (alignment)
      cell.classList.add(alignment);

    if (columnId === this.dataGrid.disclosureColumnId) {
      cell.classList.add('disclosure');
      if (this.leftPadding)
        cell.style.setProperty('padding-left', this.leftPadding + 'px');
    }

    return cell;
  }

  /**
   * @param {string} columnId
   * @return {!Element}
   */
  createCell(columnId) {
    const cell = this.createTD(columnId);

    const data = this.data[columnId];
    if (data instanceof Node)
      cell.appendChild(data);
    else if (data !== null)
      DataGrid.DataGrid.setElementText(cell, /** @type {string} */ (data), !!this.dataGrid._columns[columnId].longText);

    return cell;
  }

  /**
   * @return {number}
   */
  nodeSelfHeight() {
    return 20;
  }

  /**
   * @param {!NODE_TYPE} child
   */
  appendChild(child) {
    this.insertChild(child, this.children.length);
  }

  /**
   * @param {boolean=} onlyCaches
   */
  resetNode(onlyCaches) {
    // @TODO(allada) This is a hack to make sure ViewportDataGrid can clean up these caches. Try Not To Use.
    delete this._depth;
    delete this._revealed;
    if (onlyCaches)
      return;
    if (this.previousSibling)
      this.previousSibling.nextSibling = this.nextSibling;
    if (this.nextSibling)
      this.nextSibling.previousSibling = this.previousSibling;
    this.dataGrid = null;
    this.parent = null;
    this.nextSibling = null;
    this.previousSibling = null;
    this._attached = false;
  }

  /**
   * @param {!NODE_TYPE} child
   * @param {number} index
   */
  insertChild(child, index) {
    if (!child)
      throw 'insertChild: Node can\'t be undefined or null.';
    if (child.parent === this) {
      const currentIndex = this.children.indexOf(child);
      if (currentIndex < 0)
        console.assert(false, 'Inconsistent DataGrid state');
      if (currentIndex === index)
        return;
      if (currentIndex < index)
        --index;
    }

    child.remove();

    this.children.splice(index, 0, child);
    this.setHasChildren(true);

    child.parent = this;
    child.dataGrid = this.dataGrid;
    child.recalculateSiblings(index);

    child._shouldRefreshChildren = true;

    let current = child.children[0];
    while (current) {
      current.resetNode(true);
      current.dataGrid = this.dataGrid;
      current._attached = false;
      current._shouldRefreshChildren = true;
      current = current.traverseNextNode(false, child, true);
    }

    if (this.expanded)
      child._attach();
    if (!this.revealed)
      child.revealed = false;
  }

  remove() {
    if (this.parent)
      this.parent.removeChild(this);
  }

  /**
   * @param {!NODE_TYPE} child
   */
  removeChild(child) {
    if (!child)
      throw 'removeChild: Node can\'t be undefined or null.';
    if (child.parent !== this)
      throw 'removeChild: Node is not a child of this node.';

    if (this.dataGrid)
      this.dataGrid.updateSelectionBeforeRemoval(child, false);

    child._detach();
    child.resetNode();
    this.children.remove(child, true);

    if (this.children.length <= 0)
      this.setHasChildren(false);
  }

  removeChildren() {
    if (this.dataGrid)
      this.dataGrid.updateSelectionBeforeRemoval(this, true);
    for (let i = 0; i < this.children.length; ++i) {
      const child = this.children[i];
      child._detach();
      child.resetNode();
    }

    this.children = [];
    this.setHasChildren(false);
  }

  /**
   * @param {number} myIndex
   */
  recalculateSiblings(myIndex) {
    if (!this.parent)
      return;

    const previousChild = this.parent.children[myIndex - 1] || null;
    if (previousChild)
      previousChild.nextSibling = this;
    this.previousSibling = previousChild;

    const nextChild = this.parent.children[myIndex + 1] || null;
    if (nextChild)
      nextChild.previousSibling = this;
    this.nextSibling = nextChild;
  }

  collapse() {
    if (this._isRoot)
      return;
    if (this._element)
      this._element.classList.remove('expanded');

    this._expanded = false;

    for (let i = 0; i < this.children.length; ++i)
      this.children[i].revealed = false;
  }

  collapseRecursively() {
    let item = this;
    while (item) {
      if (item.expanded)
        item.collapse();
      item = item.traverseNextNode(false, this, true);
    }
  }

  populate() {
  }

  expand() {
    if (!this._hasChildren || this.expanded)
      return;
    if (this._isRoot)
      return;

    if (this.revealed && !this._shouldRefreshChildren) {
      for (let i = 0; i < this.children.length; ++i)
        this.children[i].revealed = true;
    }

    if (this._shouldRefreshChildren) {
      for (let i = 0; i < this.children.length; ++i)
        this.children[i]._detach();

      this.populate();

      if (this._attached) {
        for (let i = 0; i < this.children.length; ++i) {
          const child = this.children[i];
          if (this.revealed)
            child.revealed = true;
          child._attach();
        }
      }

      this._shouldRefreshChildren = false;
    }

    if (this._element)
      this._element.classList.add('expanded');

    this._expanded = true;
  }

  expandRecursively() {
    let item = this;
    while (item) {
      item.expand();
      item = item.traverseNextNode(false, this);
    }
  }

  reveal() {
    if (this._isRoot)
      return;
    let currentAncestor = this.parent;
    while (currentAncestor && !currentAncestor._isRoot) {
      if (!currentAncestor.expanded)
        currentAncestor.expand();
      currentAncestor = currentAncestor.parent;
    }

    this.element().scrollIntoViewIfNeeded(false);
  }

  /**
   * @param {boolean=} supressSelectedEvent
   */
  select(supressSelectedEvent) {
    if (!this.dataGrid || !this.selectable || this.selected)
      return;

    if (this.dataGrid.selectedNode)
      this.dataGrid.selectedNode.deselect();

    this._selected = true;
    this.dataGrid.selectedNode = this;

    if (this._element)
      this._element.classList.add('selected');

    if (!supressSelectedEvent)
      this.dataGrid.dispatchEventToListeners(DataGrid.DataGrid.Events.SelectedNode, this);
  }

  revealAndSelect() {
    if (this._isRoot)
      return;
    this.reveal();
    this.select();
  }

  /**
   * @param {boolean=} supressDeselectedEvent
   */
  deselect(supressDeselectedEvent) {
    if (!this.dataGrid || this.dataGrid.selectedNode !== this || !this.selected)
      return;

    this._selected = false;
    this.dataGrid.selectedNode = null;

    if (this._element)
      this._element.classList.remove('selected');

    if (!supressDeselectedEvent)
      this.dataGrid.dispatchEventToListeners(DataGrid.DataGrid.Events.DeselectedNode);
  }

  /**
   * @param {boolean} skipHidden
   * @param {?NODE_TYPE=} stayWithin
   * @param {boolean=} dontPopulate
   * @param {!Object=} info
   * @return {?NODE_TYPE}
   */
  traverseNextNode(skipHidden, stayWithin, dontPopulate, info) {
    if (!dontPopulate && this._hasChildren)
      this.populate();

    if (info)
      info.depthChange = 0;

    let node = (!skipHidden || this.revealed) ? this.children[0] : null;
    if (node && (!skipHidden || this.expanded)) {
      if (info)
        info.depthChange = 1;
      return node;
    }

    if (this === stayWithin)
      return null;

    node = (!skipHidden || this.revealed) ? this.nextSibling : null;
    if (node)
      return node;

    node = this;
    while (node && !node._isRoot && !((!skipHidden || node.revealed) ? node.nextSibling : null) &&
           node.parent !== stayWithin) {
      if (info)
        info.depthChange -= 1;
      node = node.parent;
    }

    if (!node)
      return null;

    return (!skipHidden || node.revealed) ? node.nextSibling : null;
  }

  /**
   * @param {boolean} skipHidden
   * @param {boolean=} dontPopulate
   * @return {?NODE_TYPE}
   */
  traversePreviousNode(skipHidden, dontPopulate) {
    let node = (!skipHidden || this.revealed) ? this.previousSibling : null;
    if (!dontPopulate && node && node._hasChildren)
      node.populate();

    while (node &&
           ((!skipHidden || (node.revealed && node.expanded)) ? node.children[node.children.length - 1] : null)) {
      if (!dontPopulate && node._hasChildren)
        node.populate();
      node = ((!skipHidden || (node.revealed && node.expanded)) ? node.children[node.children.length - 1] : null);
    }

    if (node)
      return node;

    if (!this.parent || this.parent._isRoot)
      return null;

    return this.parent;
  }

  /**
   * @param {!Event} event
   * @return {boolean}
   */
  isEventWithinDisclosureTriangle(event) {
    if (!this._hasChildren)
      return false;
    const cell = event.target.enclosingNodeOrSelfWithNodeName('td');
    if (!cell || !cell.classList.contains('disclosure'))
      return false;

    const left = cell.totalOffsetLeft() + this.leftPadding;
    return event.pageX >= left && event.pageX <= left + this.disclosureToggleWidth;
  }

  _attach() {
    if (!this.dataGrid || this._attached)
      return;

    this._attached = true;

    const previousNode = this.traversePreviousNode(true, true);
    const previousElement = previousNode ? previousNode.element() : this.dataGrid._topFillerRow;
    this.dataGrid.dataTableBody.insertBefore(this.element(), previousElement.nextSibling);

    if (this.expanded) {
      for (let i = 0; i < this.children.length; ++i)
        this.children[i]._attach();
    }
  }

  _detach() {
    if (!this._attached)
      return;

    this._attached = false;

    if (this._element)
      this._element.remove();

    for (let i = 0; i < this.children.length; ++i)
      this.children[i]._detach();
  }

  savePosition() {
    if (this._savedPosition)
      return;

    if (!this.parent)
      throw 'savePosition: Node must have a parent.';
    this._savedPosition = {parent: this.parent, index: this.parent.children.indexOf(this)};
  }

  restorePosition() {
    if (!this._savedPosition)
      return;

    if (this.parent !== this._savedPosition.parent)
      this._savedPosition.parent.insertChild(this, this._savedPosition.index);

    this._savedPosition = null;
  }
};

/**
 * @unrestricted
 * @extends {DataGrid.DataGridNode<!NODE_TYPE>}
 * @template NODE_TYPE
 */
DataGrid.CreationDataGridNode = class extends DataGrid.DataGridNode {
  constructor(data, hasChildren) {
    super(data, hasChildren);
    /** @type {boolean} */
    this.isCreationNode = true;
  }

  makeNormal() {
    this.isCreationNode = false;
  }
};

/**
 * @unrestricted
 */
DataGrid.DataGridWidget = class extends UI.VBox {
  /**
   * @param {!DataGrid.DataGrid} dataGrid
   */
  constructor(dataGrid) {
    super();
    this._dataGrid = dataGrid;
    this.element.appendChild(dataGrid.element);
  }

  /**
   * @override
   */
  wasShown() {
    this._dataGrid.wasShown();
  }

  /**
   * @override
   */
  willHide() {
    this._dataGrid.willHide();
  }

  /**
   * @override
   */
  onResize() {
    this._dataGrid.onResize();
  }

  /**
   * @override
   * @return {!Array.<!Element>}
   */
  elementsToRestoreScrollPositionsFor() {
    return [this._dataGrid._scrollContainer];
  }

  /**
   * @override
   */
  detachChildWidgets() {
    super.detachChildWidgets();
    for (const dataGrid of this._dataGrids)
      this.element.removeChild(dataGrid.element);
    this._dataGrids = [];
  }
};
