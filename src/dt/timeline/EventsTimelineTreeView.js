// Copyright 2017 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * @unrestricted
 */
Timeline.EventsTimelineTreeView = class extends Timeline.TimelineTreeView {
  /**
   * @param {!Timeline.TimelineModeViewDelegate} delegate
   */
  constructor(delegate) {
    super();
    this._filtersControl = new Timeline.EventsTimelineTreeView.Filters();
    this._filtersControl.addEventListener(
        Timeline.EventsTimelineTreeView.Filters.Events.FilterChanged, this._onFilterChanged, this);
    this.init();
    this._delegate = delegate;
    this._badgePool = new ProductRegistry.BadgePool(true);
    this._dataGrid.markColumnAsSortedBy('startTime', DataGrid.DataGrid.Order.Ascending);
    this._splitWidget.showBoth();
  }

  /**
   * @override
   * @protected
   * @return {!Array<!TimelineModel.TimelineModelFilter>}
   */
  filters() {
    return [...super.filters(), ...this._filtersControl.filters()];
  }

  /**
   * @override
   * @param {!Timeline.TimelineSelection} selection
   */
  updateContents(selection) {
    this._badgePool.reset();
    super.updateContents(selection);
    if (selection.type() === Timeline.TimelineSelection.Type.TraceEvent) {
      const event = /** @type {!SDK.TracingModel.Event} */ (selection.object());
      this._selectEvent(event, true);
    }
  }

  /**
   * @override
   * @return {!TimelineModel.TimelineProfileTree.Node}
   */
  _buildTree() {
    this._currentTree = this.buildTopDownTree(true, null);
    return this._currentTree;
  }

  _onFilterChanged() {
    const selectedEvent = this.lastSelectedNode() && this.lastSelectedNode().event;
    this.refreshTree();
    if (selectedEvent)
      this._selectEvent(selectedEvent, false);
  }

  /**
   * @param {!SDK.TracingModel.Event} event
   * @return {?TimelineModel.TimelineProfileTree.Node}
   */
  _findNodeWithEvent(event) {
    const iterators = [this._currentTree.children().values()];

    while (iterators.length) {
      const iterator = iterators.peekLast().next();
      if (iterator.done) {
        iterators.pop();
        continue;
      }
      const child = /** @type {!TimelineModel.TimelineProfileTree.Node} */ (iterator.value);
      if (child.event === event)
        return child;
      iterators.push(child.children().values());
    }
    return null;
  }

  /**
   * @param {!SDK.TracingModel.Event} event
   * @param {boolean=} expand
   */
  _selectEvent(event, expand) {
    const node = this._findNodeWithEvent(event);
    if (!node)
      return;
    this.selectProfileNode(node, false);
    if (expand)
      this.dataGridNodeForTreeNode(node).expand();
  }

  /**
   * @override
   * @param {!Array<!DataGrid.DataGrid.ColumnDescriptor>} columns
   */
  populateColumns(columns) {
    columns.push(
        {id: 'startTime', title: Common.UIString('Start Time'), width: '80px', fixedWidth: true, sortable: true});
    super.populateColumns(columns);
    columns.filter(c => c.fixedWidth).forEach(c => c.width = '80px');
  }

  /**
   * @override
   * @param {!UI.Toolbar} toolbar
   */
  populateToolbar(toolbar) {
    super.populateToolbar(toolbar);
    this._filtersControl.populateToolbar(toolbar);
  }

  /**
   * @override
   * @param {!TimelineModel.TimelineProfileTree.Node} node
   * @return {boolean}
   */
  _showDetailsForNode(node) {
    const traceEvent = node.event;
    if (!traceEvent)
      return false;
    Timeline.TimelineUIUtils
        .buildTraceEventDetails(traceEvent, this.model().timelineModel(), this._linkifier, this._badgePool, false)
        .then(fragment => this._detailsView.element.appendChild(fragment));
    return true;
  }

  /**
   * @override
   * @param {?TimelineModel.TimelineProfileTree.Node} node
   */
  _onHover(node) {
    this._delegate.highlightEvent(node && node.event);
  }
};

/**
 * @unrestricted
 */
Timeline.EventsTimelineTreeView.Filters = class extends Common.Object {
  constructor() {
    super();
    this._categoryFilter = new Timeline.TimelineFilters.Category();
    this._durationFilter = new Timeline.TimelineFilters.IsLong();
    this._filters = [this._categoryFilter, this._durationFilter];
  }

  /**
   * @return {!Array<!TimelineModel.TimelineModelFilter>}
   */
  filters() {
    return this._filters;
  }

  /**
   * @param {!UI.Toolbar} toolbar
   */
  populateToolbar(toolbar) {
    const durationFilterUI = new UI.ToolbarComboBox(durationFilterChanged.bind(this));
    for (const durationMs of Timeline.EventsTimelineTreeView.Filters._durationFilterPresetsMs) {
      durationFilterUI.addOption(durationFilterUI.createOption(
          durationMs ? Common.UIString('\u2265 %d\xa0ms', durationMs) : Common.UIString('All'),
          durationMs ? Common.UIString('Hide records shorter than %d\xa0ms', durationMs) :
                       Common.UIString('Show all records'),
          String(durationMs)));
    }
    toolbar.appendToolbarItem(durationFilterUI);

    const categoryFiltersUI = {};
    const categories = Timeline.TimelineUIUtils.categories();
    for (const categoryName in categories) {
      const category = categories[categoryName];
      if (!category.visible)
        continue;
      const checkbox =
          new UI.ToolbarCheckbox(category.title, undefined, categoriesFilterChanged.bind(this, categoryName));
      checkbox.setChecked(true);
      checkbox.inputElement.style.backgroundColor = category.color;
      categoryFiltersUI[category.name] = checkbox;
      toolbar.appendToolbarItem(checkbox);
    }

    /**
     * @this {Timeline.EventsTimelineTreeView.Filters}
     */
    function durationFilterChanged() {
      const duration = durationFilterUI.selectedOption().value;
      const minimumRecordDuration = parseInt(duration, 10);
      this._durationFilter.setMinimumRecordDuration(minimumRecordDuration);
      this._notifyFiltersChanged();
    }

    /**
     * @param {string} name
     * @this {Timeline.EventsTimelineTreeView.Filters}
     */
    function categoriesFilterChanged(name) {
      const categories = Timeline.TimelineUIUtils.categories();
      categories[name].hidden = !categoryFiltersUI[name].checked();
      this._notifyFiltersChanged();
    }
  }

  _notifyFiltersChanged() {
    this.dispatchEventToListeners(Timeline.EventsTimelineTreeView.Filters.Events.FilterChanged);
  }
};

Timeline.EventsTimelineTreeView.Filters._durationFilterPresetsMs = [0, 1, 15];

/** @enum {symbol} */
Timeline.EventsTimelineTreeView.Filters.Events = {
  FilterChanged: Symbol('FilterChanged')
};
