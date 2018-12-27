// Copyright 2016 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
/**
 * @unrestricted
 */
Network.NetworkLogViewColumns = class {
  /**
   * @param {!Network.NetworkLogView} networkLogView
   * @param {!Network.NetworkTransferTimeCalculator} timeCalculator
   * @param {!Network.NetworkTransferDurationCalculator} durationCalculator
   * @param {!Common.Setting} networkLogLargeRowsSetting
   */
  constructor(networkLogView, timeCalculator, durationCalculator, networkLogLargeRowsSetting) {
    this._networkLogView = networkLogView;

    /** @type {!Common.Setting} */
    this._persistantSettings = Common.settings.createSetting('networkLogColumns', {});

    this._networkLogLargeRowsSetting = networkLogLargeRowsSetting;
    this._networkLogLargeRowsSetting.addChangeListener(this._updateRowsSize, this);

    /** @type {!Map<string, !Array<number>>} */
    this._eventDividers = new Map();
    this._eventDividersShown = false;

    this._gridMode = true;

    /** @type {!Array.<!Network.NetworkLogViewColumns.Descriptor>} */
    this._columns = [];

    this._waterfallRequestsAreStale = false;
    this._waterfallScrollerWidthIsStale = true;

    /** @type {!Components.Linkifier} */
    this._popupLinkifier = new Components.Linkifier();

    /** @type {!Map<string, !Network.NetworkTimeCalculator>} */
    this._calculatorsMap = new Map();
    this._calculatorsMap.set(Network.NetworkLogViewColumns._calculatorTypes.Time, timeCalculator);
    this._calculatorsMap.set(Network.NetworkLogViewColumns._calculatorTypes.Duration, durationCalculator);

    this._lastWheelTime = 0;

    this._setupDataGrid();
    this._setupWaterfall();
  }

  /**
   * @param {!Network.NetworkLogViewColumns.Descriptor} columnConfig
   * @return {!DataGrid.DataGrid.ColumnDescriptor}
   */
  static _convertToDataGridDescriptor(columnConfig) {
    return /** @type {!DataGrid.DataGrid.ColumnDescriptor} */ ({
      id: columnConfig.id,
      title: columnConfig.title,
      sortable: columnConfig.sortable,
      align: columnConfig.align,
      nonSelectable: columnConfig.nonSelectable,
      weight: columnConfig.weight
    });
  }

  wasShown() {
    this._updateRowsSize();
  }

  willHide() {
    this._popoverHelper.hidePopover();
  }

  reset() {
    if (this._popoverHelper)
      this._popoverHelper.hidePopover();
    this._eventDividers.clear();
  }

  _setupDataGrid() {
    const defaultColumns = Network.NetworkLogViewColumns._defaultColumns;

    const defaultColumnConfig = Network.NetworkLogViewColumns._defaultColumnConfig;

    this._columns = /** @type {!Array<!Network.NetworkLogViewColumns.Descriptor>} */ ([]);
    for (const currentConfigColumn of defaultColumns) {
      const columnConfig = /** @type {!Network.NetworkLogViewColumns.Descriptor} */ (
          Object.assign({}, defaultColumnConfig, currentConfigColumn));
      columnConfig.id = columnConfig.id;
      if (columnConfig.subtitle)
        columnConfig.titleDOMFragment = this._makeHeaderFragment(columnConfig.title, columnConfig.subtitle);
      this._columns.push(columnConfig);
    }
    this._loadCustomColumnsAndSettings();

    this._popoverHelper = new UI.PopoverHelper(this._networkLogView.element, this._getPopoverRequest.bind(this));
    this._popoverHelper.setHasPadding(true);
    this._popoverHelper.setTimeout(300, 300);

    /** @type {!DataGrid.SortableDataGrid<!Network.NetworkNode>} */
    this._dataGrid =
        new DataGrid.SortableDataGrid(this._columns.map(Network.NetworkLogViewColumns._convertToDataGridDescriptor));
    this._dataGrid.element.addEventListener('mousedown', event => {
      if (!this._dataGrid.selectedNode && event.button)
        event.consume();
    }, true);

    this._dataGridScroller = this._dataGrid.scrollContainer;

    this._updateColumns();
    this._dataGrid.addEventListener(DataGrid.DataGrid.Events.SortingChanged, this._sortHandler, this);
    this._dataGrid.setHeaderContextMenuCallback(this._innerHeaderContextMenu.bind(this));

    this._activeWaterfallSortId = Network.NetworkLogViewColumns.WaterfallSortIds.StartTime;
    this._dataGrid.markColumnAsSortedBy(
        Network.NetworkLogViewColumns._initialSortColumn, DataGrid.DataGrid.Order.Ascending);

    this._splitWidget = new UI.SplitWidget(true, true, 'networkPanelSplitViewWaterfall', 200);
    const widget = this._dataGrid.asWidget();
    widget.setMinimumSize(150, 0);
    this._splitWidget.setMainWidget(widget);
  }

  _setupWaterfall() {
    this._waterfallColumn = new Network.NetworkWaterfallColumn(this._networkLogView.calculator());

    this._waterfallColumn.element.addEventListener('contextmenu', handleContextMenu.bind(this));
    this._waterfallColumn.element.addEventListener('mousewheel', this._onMouseWheel.bind(this, false), {passive: true});
    this._dataGridScroller.addEventListener('mousewheel', this._onMouseWheel.bind(this, true), true);

    this._waterfallScroller = this._waterfallColumn.contentElement.createChild('div', 'network-waterfall-v-scroll');
    this._waterfallScrollerContent = this._waterfallScroller.createChild('div', 'network-waterfall-v-scroll-content');

    this._dataGrid.addEventListener(DataGrid.DataGrid.Events.PaddingChanged, () => {
      this._waterfallScrollerWidthIsStale = true;
      this._syncScrollers();
    });
    this._dataGrid.addEventListener(
        DataGrid.ViewportDataGrid.Events.ViewportCalculated, this._redrawWaterfallColumn.bind(this));

    this._createWaterfallHeader();
    this._waterfallColumn.contentElement.classList.add('network-waterfall-view');

    this._waterfallColumn.setMinimumSize(100, 0);
    this._splitWidget.setSidebarWidget(this._waterfallColumn);

    this.switchViewMode(false);

    /**
     * @param {!Event} event
     * @this {Network.NetworkLogViewColumns}
     */
    function handleContextMenu(event) {
      const node = this._waterfallColumn.getNodeFromPoint(event.offsetX, event.offsetY);
      if (!node)
        return;
      const request = node.request();
      if (!request)
        return;
      const contextMenu = new UI.ContextMenu(event);
      this._networkLogView.handleContextMenuForRequest(contextMenu, request);
      contextMenu.show();
    }
  }

  /**
   * @param {boolean} shouldConsume
   * @param {!Event} event
   */
  _onMouseWheel(shouldConsume, event) {
    if (shouldConsume)
      event.consume(true);
    const hasRecentWheel = Date.now() - this._lastWheelTime < 80;
    this._activeScroller.scrollBy({top: -event.wheelDeltaY, behavior: hasRecentWheel ? 'instant' : 'smooth'});
    this._syncScrollers();
    this._lastWheelTime = Date.now();
  }

  _syncScrollers() {
    if (!this._waterfallColumn.isShowing())
      return;
    this._waterfallScrollerContent.style.height = this._dataGridScroller.scrollHeight + 'px';
    this._updateScrollerWidthIfNeeded();
    this._dataGridScroller.scrollTop = this._waterfallScroller.scrollTop;
  }

  _updateScrollerWidthIfNeeded() {
    if (this._waterfallScrollerWidthIsStale) {
      this._waterfallScrollerWidthIsStale = false;
      this._waterfallColumn.setRightPadding(
          this._waterfallScroller.offsetWidth - this._waterfallScrollerContent.offsetWidth);
    }
  }

  _redrawWaterfallColumn() {
    if (!this._waterfallRequestsAreStale) {
      this._updateScrollerWidthIfNeeded();
      this._waterfallColumn.update(
          this._activeScroller.scrollTop, this._eventDividersShown ? this._eventDividers : undefined);
      return;
    }
    this._syncScrollers();
    const nodes = this._networkLogView.flatNodesList();
    this._waterfallColumn.update(this._activeScroller.scrollTop, this._eventDividers, nodes);
  }

  _createWaterfallHeader() {
    this._waterfallHeaderElement = this._waterfallColumn.contentElement.createChild('div', 'network-waterfall-header');
    this._waterfallHeaderElement.addEventListener('click', waterfallHeaderClicked.bind(this));
    this._waterfallHeaderElement.addEventListener(
        'contextmenu', event => this._innerHeaderContextMenu(new UI.ContextMenu(event)));
    const innerElement = this._waterfallHeaderElement.createChild('div');
    innerElement.textContent = Common.UIString('Waterfall');
    this._waterfallColumnSortIcon = UI.Icon.create('', 'sort-order-icon');
    this._waterfallHeaderElement.createChild('div', 'sort-order-icon-container')
        .appendChild(this._waterfallColumnSortIcon);

    /**
     * @this {Network.NetworkLogViewColumns}
     */
    function waterfallHeaderClicked() {
      const sortOrders = DataGrid.DataGrid.Order;
      const sortOrder =
          this._dataGrid.sortOrder() === sortOrders.Ascending ? sortOrders.Descending : sortOrders.Ascending;
      this._dataGrid.markColumnAsSortedBy('waterfall', sortOrder);
      this._sortHandler();
    }
  }

  /**
   * @param {!Network.NetworkTimeCalculator} x
   */
  setCalculator(x) {
    this._waterfallColumn.setCalculator(x);
  }

  scheduleRefresh() {
    this._waterfallColumn.scheduleDraw();
  }

  _updateRowsSize() {
    const largeRows = !!this._networkLogLargeRowsSetting.get();

    this._dataGrid.element.classList.toggle('small', !largeRows);
    this._dataGrid.scheduleUpdate();

    this._waterfallScrollerWidthIsStale = true;
    this._waterfallColumn.setRowHeight(largeRows ? 41 : 21);
    this._waterfallScroller.classList.toggle('small', !largeRows);
    this._waterfallHeaderElement.classList.toggle('small', !largeRows);
    this._waterfallColumn.setHeaderHeight(this._waterfallScroller.offsetTop);
  }

  /**
   * @param {!Element} element
   */
  show(element) {
    this._splitWidget.show(element);
  }

  /**
   * @return {!DataGrid.SortableDataGrid<!Network.NetworkNode>} dataGrid
   */
  dataGrid() {
    return this._dataGrid;
  }

  sortByCurrentColumn() {
    this._sortHandler();
  }

  _sortHandler() {
    const columnId = this._dataGrid.sortColumnId();
    this._networkLogView.removeAllNodeHighlights();
    this._waterfallRequestsAreStale = true;
    if (columnId === 'waterfall') {
      if (this._dataGrid.sortOrder() === DataGrid.DataGrid.Order.Ascending)
        this._waterfallColumnSortIcon.setIconType('smallicon-triangle-up');
      else
        this._waterfallColumnSortIcon.setIconType('smallicon-triangle-down');

      const sortFunction = Network.NetworkRequestNode.RequestPropertyComparator.bind(null, this._activeWaterfallSortId);
      this._dataGrid.sortNodes(sortFunction, !this._dataGrid.isSortOrderAscending());
      this._dataGridSortedForTest();
      return;
    }
    this._waterfallColumnSortIcon.setIconType('');

    const columnConfig = this._columns.find(columnConfig => columnConfig.id === columnId);
    if (!columnConfig || !columnConfig.sortingFunction)
      return;

    this._dataGrid.sortNodes(columnConfig.sortingFunction, !this._dataGrid.isSortOrderAscending());
    this._dataGridSortedForTest();
  }

  _dataGridSortedForTest() {
  }

  _updateColumns() {
    if (!this._dataGrid)
      return;
    const visibleColumns = /** @type {!Object.<string, boolean>} */ ({});
    if (this._gridMode) {
      for (const columnConfig of this._columns)
        visibleColumns[columnConfig.id] = columnConfig.visible;
    } else {
      visibleColumns.name = true;
    }
    this._dataGrid.setColumnsVisiblity(visibleColumns);
  }

  /**
   * @param {boolean} gridMode
   */
  switchViewMode(gridMode) {
    if (this._gridMode === gridMode)
      return;
    this._gridMode = gridMode;

    if (gridMode) {
      if (this._dataGrid.selectedNode)
        this._dataGrid.selectedNode.selected = false;
      this._splitWidget.showBoth();
      this._activeScroller = this._waterfallScroller;
      this._waterfallScroller.scrollTop = this._dataGridScroller.scrollTop;
      this._dataGrid.setScrollContainer(this._waterfallScroller);
    } else {
      this._networkLogView.removeAllNodeHighlights();
      this._splitWidget.hideSidebar();
      this._activeScroller = this._dataGridScroller;
      this._dataGrid.setScrollContainer(this._dataGridScroller);
    }
    this._networkLogView.element.classList.toggle('brief-mode', !gridMode);
    this._updateColumns();
    this._updateRowsSize();
  }

  /**
   * @param {!Network.NetworkLogViewColumns.Descriptor} columnConfig
   */
  _toggleColumnVisibility(columnConfig) {
    this._loadCustomColumnsAndSettings();
    columnConfig.visible = !columnConfig.visible;
    this._saveColumnsSettings();
    this._updateColumns();
  }

  _saveColumnsSettings() {
    const saveableSettings = {};
    for (const columnConfig of this._columns)
      saveableSettings[columnConfig.id] = {visible: columnConfig.visible, title: columnConfig.title};

    this._persistantSettings.set(saveableSettings);
  }

  _loadCustomColumnsAndSettings() {
    const savedSettings = this._persistantSettings.get();
    const columnIds = Object.keys(savedSettings);
    for (const columnId of columnIds) {
      const setting = savedSettings[columnId];
      let columnConfig = this._columns.find(columnConfig => columnConfig.id === columnId);
      if (!columnConfig)
        columnConfig = this._addCustomHeader(setting.title, columnId);
      if (columnConfig.hideable && typeof setting.visible === 'boolean')
        columnConfig.visible = !!setting.visible;
      if (typeof setting.title === 'string')
        columnConfig.title = setting.title;
    }
  }

  /**
   * @param {string} title
   * @param {string} subtitle
   * @return {!DocumentFragment}
   */
  _makeHeaderFragment(title, subtitle) {
    const fragment = createDocumentFragment();
    fragment.createTextChild(title);
    const subtitleDiv = fragment.createChild('div', 'network-header-subtitle');
    subtitleDiv.createTextChild(subtitle);
    return fragment;
  }

  /**
   * @param {!UI.ContextMenu} contextMenu
   */
  _innerHeaderContextMenu(contextMenu) {
    const columnConfigs = this._columns.filter(columnConfig => columnConfig.hideable);
    const nonResponseHeaders = columnConfigs.filter(columnConfig => !columnConfig.isResponseHeader);
    for (const columnConfig of nonResponseHeaders) {
      contextMenu.headerSection().appendCheckboxItem(
          columnConfig.title, this._toggleColumnVisibility.bind(this, columnConfig), columnConfig.visible);
    }

    const responseSubMenu = contextMenu.footerSection().appendSubMenuItem(Common.UIString('Response Headers'));
    const responseHeaders = columnConfigs.filter(columnConfig => columnConfig.isResponseHeader);
    for (const columnConfig of responseHeaders) {
      responseSubMenu.defaultSection().appendCheckboxItem(
          columnConfig.title, this._toggleColumnVisibility.bind(this, columnConfig), columnConfig.visible);
    }

    responseSubMenu.footerSection().appendItem(
        Common.UIString('Manage Header Columns\u2026'), this._manageCustomHeaderDialog.bind(this));

    const waterfallSortIds = Network.NetworkLogViewColumns.WaterfallSortIds;
    const waterfallSubMenu = contextMenu.footerSection().appendSubMenuItem(Common.UIString('Waterfall'));
    waterfallSubMenu.defaultSection().appendCheckboxItem(
        Common.UIString('Start Time'), setWaterfallMode.bind(this, waterfallSortIds.StartTime),
        this._activeWaterfallSortId === waterfallSortIds.StartTime);
    waterfallSubMenu.defaultSection().appendCheckboxItem(
        Common.UIString('Response Time'), setWaterfallMode.bind(this, waterfallSortIds.ResponseTime),
        this._activeWaterfallSortId === waterfallSortIds.ResponseTime);
    waterfallSubMenu.defaultSection().appendCheckboxItem(
        Common.UIString('End Time'), setWaterfallMode.bind(this, waterfallSortIds.EndTime),
        this._activeWaterfallSortId === waterfallSortIds.EndTime);
    waterfallSubMenu.defaultSection().appendCheckboxItem(
        Common.UIString('Total Duration'), setWaterfallMode.bind(this, waterfallSortIds.Duration),
        this._activeWaterfallSortId === waterfallSortIds.Duration);
    waterfallSubMenu.defaultSection().appendCheckboxItem(
        Common.UIString('Latency'), setWaterfallMode.bind(this, waterfallSortIds.Latency),
        this._activeWaterfallSortId === waterfallSortIds.Latency);

    contextMenu.show();

    /**
     * @param {!Network.NetworkLogViewColumns.WaterfallSortIds} sortId
     * @this {Network.NetworkLogViewColumns}
     */
    function setWaterfallMode(sortId) {
      let calculator = this._calculatorsMap.get(Network.NetworkLogViewColumns._calculatorTypes.Time);
      const waterfallSortIds = Network.NetworkLogViewColumns.WaterfallSortIds;
      if (sortId === waterfallSortIds.Duration || sortId === waterfallSortIds.Latency)
        calculator = this._calculatorsMap.get(Network.NetworkLogViewColumns._calculatorTypes.Duration);
      this._networkLogView.setCalculator(calculator);

      this._activeWaterfallSortId = sortId;
      this._dataGrid.markColumnAsSortedBy('waterfall', DataGrid.DataGrid.Order.Ascending);
      this._sortHandler();
    }
  }

  _manageCustomHeaderDialog() {
    const customHeaders = [];
    for (const columnConfig of this._columns) {
      if (columnConfig.isResponseHeader)
        customHeaders.push({title: columnConfig.title, editable: columnConfig.isCustomHeader});
    }
    const manageCustomHeaders = new Network.NetworkManageCustomHeadersView(
        customHeaders, headerTitle => !!this._addCustomHeader(headerTitle), this._changeCustomHeader.bind(this),
        this._removeCustomHeader.bind(this));
    const dialog = new UI.Dialog();
    manageCustomHeaders.show(dialog.contentElement);
    dialog.setSizeBehavior(UI.GlassPane.SizeBehavior.MeasureContent);
    dialog.show(this._networkLogView.element);
  }

  /**
   * @param {string} headerId
   * @return {boolean}
   */
  _removeCustomHeader(headerId) {
    headerId = headerId.toLowerCase();
    const index = this._columns.findIndex(columnConfig => columnConfig.id === headerId);
    if (index === -1)
      return false;
    this._columns.splice(index, 1);
    this._dataGrid.removeColumn(headerId);
    this._saveColumnsSettings();
    this._updateColumns();
    return true;
  }

  /**
   * @param {string} headerTitle
   * @param {string=} headerId
   * @param {number=} index
   * @return {?Network.NetworkLogViewColumns.Descriptor}
   */
  _addCustomHeader(headerTitle, headerId, index) {
    if (!headerId)
      headerId = headerTitle.toLowerCase();
    if (index === undefined)
      index = this._columns.length - 1;

    const currentColumnConfig = this._columns.find(columnConfig => columnConfig.id === headerId);
    if (currentColumnConfig)
      return null;

    const columnConfig = /** @type {!Network.NetworkLogViewColumns.Descriptor} */ (
        Object.assign({}, Network.NetworkLogViewColumns._defaultColumnConfig, {
          id: headerId,
          title: headerTitle,
          isResponseHeader: true,
          isCustomHeader: true,
          visible: true,
          sortingFunction: Network.NetworkRequestNode.ResponseHeaderStringComparator.bind(null, headerId)
        }));
    this._columns.splice(index, 0, columnConfig);
    if (this._dataGrid)
      this._dataGrid.addColumn(Network.NetworkLogViewColumns._convertToDataGridDescriptor(columnConfig), index);
    this._saveColumnsSettings();
    this._updateColumns();
    return columnConfig;
  }

  /**
   * @param {string} oldHeaderId
   * @param {string} newHeaderTitle
   * @param {string=} newHeaderId
   * @return {boolean}
   */
  _changeCustomHeader(oldHeaderId, newHeaderTitle, newHeaderId) {
    if (!newHeaderId)
      newHeaderId = newHeaderTitle.toLowerCase();
    oldHeaderId = oldHeaderId.toLowerCase();

    const oldIndex = this._columns.findIndex(columnConfig => columnConfig.id === oldHeaderId);
    const oldColumnConfig = this._columns[oldIndex];
    const currentColumnConfig = this._columns.find(columnConfig => columnConfig.id === newHeaderId);
    if (!oldColumnConfig || (currentColumnConfig && oldHeaderId !== newHeaderId))
      return false;

    this._removeCustomHeader(oldHeaderId);
    this._addCustomHeader(newHeaderTitle, newHeaderId, oldIndex);
    return true;
  }

  /**
   * @param {!Event} event
   * @return {?UI.PopoverRequest}
   */
  _getPopoverRequest(event) {
    if (!this._gridMode)
      return null;
    const hoveredNode = this._networkLogView.hoveredNode();
    if (!hoveredNode)
      return null;

    const anchor = event.target.enclosingNodeOrSelfWithClass('network-script-initiated');
    if (!anchor)
      return null;
    const request = hoveredNode.request();
    const initiator = request ? request.initiator() : null;
    if (!initiator || !initiator.stack)
      return null;
    return {
      box: anchor.boxInWindow(),
      show: popover => {
        const manager = anchor.request ? SDK.NetworkManager.forRequest(anchor.request) : null;
        const content = Components.JSPresentationUtils.buildStackTracePreviewContents(
            manager ? manager.target() : null, this._popupLinkifier, initiator.stack,
            () => popover.setSizeBehavior(UI.GlassPane.SizeBehavior.MeasureContent));
        popover.contentElement.appendChild(content.element);
        return Promise.resolve(true);
      },
      hide: this._popupLinkifier.reset.bind(this._popupLinkifier)
    };
  }

  /**
   * @param {!Array<number>} times
   * @param {string} className
   */
  addEventDividers(times, className) {
    // TODO(allada) Remove this and pass in the color.
    let color = 'transparent';
    switch (className) {
      case 'network-dcl-divider':
        color = '#0867CB';
        break;
      case 'network-load-divider':
        color = '#B31412';
        break;
      default:
        return;
    }
    const currentTimes = this._eventDividers.get(color) || [];
    this._eventDividers.set(color, currentTimes.concat(times));
    this._networkLogView.scheduleRefresh();
  }

  hideEventDividers() {
    this._eventDividersShown = true;
    this._redrawWaterfallColumn();
  }

  showEventDividers() {
    this._eventDividersShown = false;
    this._redrawWaterfallColumn();
  }

  /**
   * @param {number} time
   */
  selectFilmStripFrame(time) {
    this._eventDividers.set(Network.NetworkLogViewColumns._filmStripDividerColor, [time]);
    this._redrawWaterfallColumn();
  }

  clearFilmStripFrame() {
    this._eventDividers.delete(Network.NetworkLogViewColumns._filmStripDividerColor);
    this._redrawWaterfallColumn();
  }
};

Network.NetworkLogViewColumns._initialSortColumn = 'waterfall';

/**
 * @typedef {{
 *     id: string,
 *     title: string,
 *     titleDOMFragment: (!DocumentFragment|undefined),
 *     subtitle: (string|null),
 *     visible: boolean,
 *     weight: number,
 *     hideable: boolean,
 *     nonSelectable: boolean,
 *     sortable: boolean,
 *     align: (?DataGrid.DataGrid.Align|undefined),
 *     isResponseHeader: boolean,
 *     sortingFunction: (!function(!Network.NetworkNode, !Network.NetworkNode):number|undefined),
 *     isCustomHeader: boolean
 * }}
 */
Network.NetworkLogViewColumns.Descriptor;

/** @enum {string} */
Network.NetworkLogViewColumns._calculatorTypes = {
  Duration: 'Duration',
  Time: 'Time'
};

/**
 * @type {!Object} column
 */
Network.NetworkLogViewColumns._defaultColumnConfig = {
  subtitle: null,
  visible: false,
  weight: 6,
  sortable: true,
  hideable: true,
  nonSelectable: true,
  isResponseHeader: false,
  alwaysVisible: false,
  isCustomHeader: false
};

/**
 * @type {!Array.<!Network.NetworkLogViewColumns.Descriptor>} column
 */
Network.NetworkLogViewColumns._defaultColumns = [
  {
    id: 'name',
    title: Common.UIString('Name'),
    subtitle: Common.UIString('Path'),
    visible: true,
    weight: 20,
    hideable: false,
    nonSelectable: false,
    alwaysVisible: true,
    sortingFunction: Network.NetworkRequestNode.NameComparator
  },
  {
    id: 'method',
    title: Common.UIString('Method'),
    sortingFunction: Network.NetworkRequestNode.RequestPropertyComparator.bind(null, 'requestMethod')
  },
  {
    id: 'status',
    title: Common.UIString('Status'),
    visible: true,
    subtitle: Common.UIString('Text'),
    sortingFunction: Network.NetworkRequestNode.RequestPropertyComparator.bind(null, 'statusCode')
  },
  {
    id: 'protocol',
    title: Common.UIString('Protocol'),
    sortingFunction: Network.NetworkRequestNode.RequestPropertyComparator.bind(null, 'protocol')
  },
  {
    id: 'scheme',
    title: Common.UIString('Scheme'),
    sortingFunction: Network.NetworkRequestNode.RequestPropertyComparator.bind(null, 'scheme')
  },
  {
    id: 'domain',
    title: Common.UIString('Domain'),
    sortingFunction: Network.NetworkRequestNode.RequestPropertyComparator.bind(null, 'domain')
  },
  {
    id: 'remoteaddress',
    title: Common.UIString('Remote Address'),
    weight: 10,
    align: DataGrid.DataGrid.Align.Right,
    sortingFunction: Network.NetworkRequestNode.RemoteAddressComparator
  },
  {
    id: 'type',
    title: Common.UIString('Type'),
    visible: true,
    sortingFunction: Network.NetworkRequestNode.TypeComparator
  },
  {
    id: 'initiator',
    title: Common.UIString('Initiator'),
    visible: true,
    weight: 10,
    sortingFunction: Network.NetworkRequestNode.InitiatorComparator
  },
  {
    id: 'cookies',
    title: Common.UIString('Cookies'),
    align: DataGrid.DataGrid.Align.Right,
    sortingFunction: Network.NetworkRequestNode.RequestCookiesCountComparator
  },
  {
    id: 'setcookies',
    title: Common.UIString('Set Cookies'),
    align: DataGrid.DataGrid.Align.Right,
    sortingFunction: Network.NetworkRequestNode.ResponseCookiesCountComparator
  },
  {
    id: 'size',
    title: Common.UIString('Size'),
    visible: true,
    subtitle: Common.UIString('Content'),
    align: DataGrid.DataGrid.Align.Right,
    sortingFunction: Network.NetworkRequestNode.SizeComparator
  },
  {
    id: 'time',
    title: Common.UIString('Time'),
    visible: true,
    subtitle: Common.UIString('Latency'),
    align: DataGrid.DataGrid.Align.Right,
    sortingFunction: Network.NetworkRequestNode.RequestPropertyComparator.bind(null, 'duration')
  },
  {id: 'priority', title: Common.UIString('Priority'), sortingFunction: Network.NetworkRequestNode.PriorityComparator},
  {
    id: 'connectionid',
    title: Common.UIString('Connection ID'),
    sortingFunction: Network.NetworkRequestNode.RequestPropertyComparator.bind(null, 'connectionId')
  },
  {
    id: 'cache-control',
    isResponseHeader: true,
    title: Common.UIString('Cache-Control'),
    sortingFunction: Network.NetworkRequestNode.ResponseHeaderStringComparator.bind(null, 'cache-control')
  },
  {
    id: 'connection',
    isResponseHeader: true,
    title: Common.UIString('Connection'),
    sortingFunction: Network.NetworkRequestNode.ResponseHeaderStringComparator.bind(null, 'connection')
  },
  {
    id: 'content-encoding',
    isResponseHeader: true,
    title: Common.UIString('Content-Encoding'),
    sortingFunction: Network.NetworkRequestNode.ResponseHeaderStringComparator.bind(null, 'content-encoding')
  },
  {
    id: 'content-length',
    isResponseHeader: true,
    title: Common.UIString('Content-Length'),
    align: DataGrid.DataGrid.Align.Right,
    sortingFunction: Network.NetworkRequestNode.ResponseHeaderNumberComparator.bind(null, 'content-length')
  },
  {
    id: 'etag',
    isResponseHeader: true,
    title: Common.UIString('ETag'),
    sortingFunction: Network.NetworkRequestNode.ResponseHeaderStringComparator.bind(null, 'etag')
  },
  {
    id: 'keep-alive',
    isResponseHeader: true,
    title: Common.UIString('Keep-Alive'),
    sortingFunction: Network.NetworkRequestNode.ResponseHeaderStringComparator.bind(null, 'keep-alive')
  },
  {
    id: 'last-modified',
    isResponseHeader: true,
    title: Common.UIString('Last-Modified'),
    sortingFunction: Network.NetworkRequestNode.ResponseHeaderDateComparator.bind(null, 'last-modified')
  },
  {
    id: 'server',
    isResponseHeader: true,
    title: Common.UIString('Server'),
    sortingFunction: Network.NetworkRequestNode.ResponseHeaderStringComparator.bind(null, 'server')
  },
  {
    id: 'vary',
    isResponseHeader: true,
    title: Common.UIString('Vary'),
    sortingFunction: Network.NetworkRequestNode.ResponseHeaderStringComparator.bind(null, 'vary')
  },
  // This header is a placeholder to let datagrid know that it can be sorted by this column, but never shown.
  {id: 'waterfall', title: '', visible: false, hideable: false}
];

Network.NetworkLogViewColumns._filmStripDividerColor = '#fccc49';

/**
 * @enum {string}
 */
Network.NetworkLogViewColumns.WaterfallSortIds = {
  StartTime: 'startTime',
  ResponseTime: 'responseReceivedTime',
  EndTime: 'endTime',
  Duration: 'duration',
  Latency: 'latency'
};
