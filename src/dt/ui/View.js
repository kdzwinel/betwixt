// Copyright 2016 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
/**
 * @interface
 */
UI.View = function() {};

UI.View.prototype = {
  /**
   * @return {string}
   */
  viewId() {},

  /**
   * @return {string}
   */
  title() {},

  /**
   * @return {boolean}
   */
  isCloseable() {},

  /**
   * @return {boolean}
   */
  isTransient() {},

  /**
   * @return {!Promise<!Array<!UI.ToolbarItem>>}
   */
  toolbarItems() {},

  /**
   * @return {!Promise<!UI.Widget>}
   */
  widget() {},

  disposeView() {}
};

UI.View._symbol = Symbol('view');
UI.View._widgetSymbol = Symbol('widget');

/**
 * @implements {UI.View}
 * @unrestricted
 */
UI.SimpleView = class extends UI.VBox {
  /**
   * @param {string} title
   * @param {boolean=} isWebComponent
   */
  constructor(title, isWebComponent) {
    super(isWebComponent);
    this._title = title;
    /** @type {!Array<!UI.ToolbarItem>} */
    this._toolbarItems = [];
    this[UI.View._symbol] = this;
  }

  /**
   * @override
   * @return {string}
   */
  viewId() {
    return this._title;
  }

  /**
   * @override
   * @return {string}
   */
  title() {
    return this._title;
  }

  /**
   * @override
   * @return {boolean}
   */
  isCloseable() {
    return false;
  }

  /**
   * @override
   * @return {boolean}
   */
  isTransient() {
    return false;
  }

  /**
   * @override
   * @return {!Promise<!Array<!UI.ToolbarItem>>}
   */
  toolbarItems() {
    return Promise.resolve(this.syncToolbarItems());
  }

  /**
   * @return {!Array<!UI.ToolbarItem>}
   */
  syncToolbarItems() {
    return this._toolbarItems;
  }

  /**
   * @override
   * @return {!Promise<!UI.Widget>}
   */
  widget() {
    return /** @type {!Promise<!UI.Widget>} */ (Promise.resolve(this));
  }

  /**
   * @param {!UI.ToolbarItem} item
   */
  addToolbarItem(item) {
    this._toolbarItems.push(item);
  }

  /**
   * @return {!Promise}
   */
  revealView() {
    return UI.viewManager.revealView(this);
  }

  /**
   * @override
   */
  disposeView() {
  }
};

/**
 * @implements {UI.View}
 * @unrestricted
 */
UI.ProvidedView = class {
  /**
   * @param {!Runtime.Extension} extension
   */
  constructor(extension) {
    this._extension = extension;
  }

  /**
   * @override
   * @return {string}
   */
  viewId() {
    return this._extension.descriptor()['id'];
  }

  /**
   * @override
   * @return {string}
   */
  title() {
    return this._extension.title();
  }

  /**
   * @override
   * @return {boolean}
   */
  isCloseable() {
    return this._extension.descriptor()['persistence'] === 'closeable';
  }

  /**
   * @override
   * @return {boolean}
   */
  isTransient() {
    return this._extension.descriptor()['persistence'] === 'transient';
  }

  /**
   * @override
   * @return {!Promise<!Array<!UI.ToolbarItem>>}
   */
  toolbarItems() {
    const actionIds = this._extension.descriptor()['actionIds'];
    if (actionIds) {
      const result = actionIds.split(',').map(id => UI.Toolbar.createActionButtonForId(id.trim()));
      return Promise.resolve(result);
    }

    if (this._extension.descriptor()['hasToolbar'])
      return this.widget().then(widget => /** @type {!UI.ToolbarItem.ItemsProvider} */ (widget).toolbarItems());
    return Promise.resolve([]);
  }

  /**
   * @override
   * @return {!Promise<!UI.Widget>}
   */
  async widget() {
    this._widgetRequested = true;
    const widget = await this._extension.instance();
    if (!(widget instanceof UI.Widget))
      throw new Error('view className should point to a UI.Widget');
    widget[UI.View._symbol] = this;
    return /** @type {!UI.Widget} */ (widget);
  }

  /**
   * @override
   */
  async disposeView() {
    if (!this._widgetRequested)
      return;
    const widget = await this.widget();
    widget.ownerViewDisposed();
  }
};

/**
 * @interface
 */
UI.ViewLocation = function() {};

UI.ViewLocation.prototype = {
  /**
   * @param {string} locationName
   */
  appendApplicableItems(locationName) {},

  /**
   * @param {!UI.View} view
   * @param {?UI.View=} insertBefore
   */
  appendView(view, insertBefore) {},

  /**
   * @param {!UI.View} view
   * @param {?UI.View=} insertBefore
   * @param {boolean=} userGesture
   * @return {!Promise}
   */
  showView(view, insertBefore, userGesture) {},

  /**
   * @param {!UI.View} view
   */
  removeView(view) {},

  /**
   * @return {!UI.Widget}
   */
  widget() {}
};

/**
 * @interface
 * @extends {UI.ViewLocation}
 */
UI.TabbedViewLocation = function() {};

UI.TabbedViewLocation.prototype = {
  /**
   * @return {!UI.TabbedPane}
   */
  tabbedPane() {},

  enableMoreTabsButton() {}
};

/**
 * @interface
 */
UI.ViewLocationResolver = function() {};

UI.ViewLocationResolver.prototype = {
  /**
   * @param {string} location
   * @return {?UI.ViewLocation}
   */
  resolveLocation(location) {}
};

/**
 * @unrestricted
 */
UI.ViewManager = class {
  constructor() {
    /** @type {!Map<string, !UI.View>} */
    this._views = new Map();
    /** @type {!Map<string, string>} */
    this._locationNameByViewId = new Map();

    for (const extension of self.runtime.extensions('view')) {
      const descriptor = extension.descriptor();
      this._views.set(descriptor['id'], new UI.ProvidedView(extension));
      this._locationNameByViewId.set(descriptor['id'], descriptor['location']);
    }
  }

  /**
   * @param {!Element} element
   * @param {!Array<!UI.ToolbarItem>} toolbarItems
   */
  static _populateToolbar(element, toolbarItems) {
    if (!toolbarItems.length)
      return;
    const toolbar = new UI.Toolbar('');
    element.insertBefore(toolbar.element, element.firstChild);
    for (const item of toolbarItems)
      toolbar.appendToolbarItem(item);
  }

  /**
   * @param {!UI.View} view
   * @return {!Promise}
   */
  revealView(view) {
    const location = /** @type {?UI.ViewManager._Location} */ (view[UI.ViewManager._Location.symbol]);
    if (!location)
      return Promise.resolve();
    location._reveal();
    return location.showView(view);
  }

  /**
   * @param {string} viewId
   * @return {?UI.View}
   */
  view(viewId) {
    return this._views.get(viewId);
  }

  /**
   * @param {string} viewId
   * @return {?UI.Widget}
   */
  materializedWidget(viewId) {
    const view = this.view(viewId);
    return view ? view[UI.View._widgetSymbol] : null;
  }

  /**
   * @param {string} viewId
   * @param {boolean=} userGesture
   * @param {boolean=} omitFocus
   * @return {!Promise}
   */
  showView(viewId, userGesture, omitFocus) {
    const view = this._views.get(viewId);
    if (!view) {
      console.error('Could not find view for id: \'' + viewId + '\' ' + new Error().stack);
      return Promise.resolve();
    }

    const locationName = this._locationNameByViewId.get(viewId);

    const location = view[UI.ViewManager._Location.symbol];
    if (location) {
      location._reveal();
      return location.showView(view, undefined, userGesture, omitFocus);
    }

    return this.resolveLocation(locationName).then(location => {
      if (!location)
        throw new Error('Could not resolve location for view: ' + viewId);
      location._reveal();
      return location.showView(view, undefined, userGesture, omitFocus);
    });
  }

  /**
   * @param {string=} location
   * @return {!Promise<?UI.ViewManager._Location>}
   */
  resolveLocation(location) {
    if (!location)
      return /** @type {!Promise<?UI.ViewManager._Location>} */ (Promise.resolve(null));

    const resolverExtensions = self.runtime.extensions(UI.ViewLocationResolver)
                                   .filter(extension => extension.descriptor()['name'] === location);
    if (!resolverExtensions.length)
      throw new Error('Unresolved location: ' + location);
    const resolverExtension = resolverExtensions[0];
    return resolverExtension.instance().then(
        resolver => /** @type {?UI.ViewManager._Location} */ (resolver.resolveLocation(location)));
  }

  /**
   * @param {function()=} revealCallback
   * @param {string=} location
   * @param {boolean=} restoreSelection
   * @param {boolean=} allowReorder
   * @param {?string=} defaultTab
   * @return {!UI.TabbedViewLocation}
   */
  createTabbedLocation(revealCallback, location, restoreSelection, allowReorder, defaultTab) {
    return new UI.ViewManager._TabbedLocation(
        this, revealCallback, location, restoreSelection, allowReorder, defaultTab);
  }

  /**
   * @param {function()=} revealCallback
   * @param {string=} location
   * @return {!UI.ViewLocation}
   */
  createStackLocation(revealCallback, location) {
    return new UI.ViewManager._StackLocation(this, revealCallback, location);
  }

  /**
   * @param {string} location
   * @return {boolean}
   */
  hasViewsForLocation(location) {
    return !!this._viewsForLocation(location).length;
  }

  /**
   * @param {string} location
   * @return {!Array<!UI.View>}
   */
  _viewsForLocation(location) {
    const result = [];
    for (const id of this._views.keys()) {
      if (this._locationNameByViewId.get(id) === location)
        result.push(this._views.get(id));
    }
    return result;
  }
};


/**
 * @unrestricted
 */
UI.ViewManager._ContainerWidget = class extends UI.VBox {
  /**
   * @param {!UI.View} view
   */
  constructor(view) {
    super();
    this.element.classList.add('flex-auto', 'view-container', 'overflow-auto');
    this._view = view;
    this.element.tabIndex = -1;
    this.setDefaultFocusedElement(this.element);
  }

  /**
   * @return {!Promise}
   */
  _materialize() {
    if (this._materializePromise)
      return this._materializePromise;
    const promises = [];
    promises.push(this._view.toolbarItems().then(UI.ViewManager._populateToolbar.bind(UI.ViewManager, this.element)));
    promises.push(this._view.widget().then(widget => {
      // Move focus from |this| to loaded |widget| if any.
      const shouldFocus = this.element.hasFocus();
      this.setDefaultFocusedElement(null);
      this._view[UI.View._widgetSymbol] = widget;
      widget.show(this.element);
      if (shouldFocus)
        widget.focus();
    }));
    this._materializePromise = Promise.all(promises);
    return this._materializePromise;
  }

  /**
   * @override
   */
  wasShown() {
    this._materialize().then(() => {
      this._wasShownForTest();
    });
  }

  _wasShownForTest() {
    // This method is sniffed in tests.
  }
};

/**
 * @unrestricted
 */
UI.ViewManager._ExpandableContainerWidget = class extends UI.VBox {
  /**
   * @param {!UI.View} view
   */
  constructor(view) {
    super(true);
    this.element.classList.add('flex-none');
    this.registerRequiredCSS('ui/viewContainers.css');

    this._titleElement = createElementWithClass('div', 'expandable-view-title');
    UI.ARIAUtils.markAsLink(this._titleElement);
    this._titleExpandIcon = UI.Icon.create('smallicon-triangle-right', 'title-expand-icon');
    this._titleElement.appendChild(this._titleExpandIcon);
    this._titleElement.createTextChild(view.title());
    this._titleElement.tabIndex = 0;
    this._titleElement.addEventListener('click', this._toggleExpanded.bind(this), false);
    this._titleElement.addEventListener('keydown', this._onTitleKeyDown.bind(this), false);
    this.contentElement.insertBefore(this._titleElement, this.contentElement.firstChild);

    this.contentElement.createChild('content');
    this._view = view;
    view[UI.ViewManager._ExpandableContainerWidget._symbol] = this;
  }

  /**
   * @return {!Promise}
   */
  _materialize() {
    if (this._materializePromise)
      return this._materializePromise;
    const promises = [];
    promises.push(
        this._view.toolbarItems().then(UI.ViewManager._populateToolbar.bind(UI.ViewManager, this._titleElement)));
    promises.push(this._view.widget().then(widget => {
      this._widget = widget;
      this._view[UI.View._widgetSymbol] = widget;
      widget.show(this.element);
    }));
    this._materializePromise = Promise.all(promises);
    return this._materializePromise;
  }

  /**
   * @return {!Promise}
   */
  _expand() {
    if (this._titleElement.classList.contains('expanded'))
      return this._materialize();
    this._titleElement.classList.add('expanded');
    UI.ARIAUtils.setExpanded(this._titleElement, true);
    this._titleExpandIcon.setIconType('smallicon-triangle-down');
    return this._materialize().then(() => this._widget.show(this.element));
  }

  _collapse() {
    if (!this._titleElement.classList.contains('expanded'))
      return;
    this._titleElement.classList.remove('expanded');
    UI.ARIAUtils.setExpanded(this._titleElement, false);
    this._titleExpandIcon.setIconType('smallicon-triangle-right');
    this._materialize().then(() => this._widget.detach());
  }

  _toggleExpanded() {
    if (this._titleElement.classList.contains('expanded'))
      this._collapse();
    else
      this._expand();
  }

  /**
   * @param {!Event} event
   */
  _onTitleKeyDown(event) {
    if (isEnterKey(event) || event.keyCode === UI.KeyboardShortcut.Keys.Space.code) {
      this._toggleExpanded();
    } else if (event.key === 'ArrowLeft') {
      this._collapse();
    } else if (event.key === 'ArrowRight') {
      if (!this._titleElement.classList.contains('expanded'))
        this._expand();
      else if (this._widget)
        this._widget.focus();
    }
  }
};

UI.ViewManager._ExpandableContainerWidget._symbol = Symbol('container');

/**
 * @unrestricted
 */
UI.ViewManager._Location = class {
  /**
   * @param {!UI.ViewManager} manager
   * @param {!UI.Widget} widget
   * @param {function()=} revealCallback
   */
  constructor(manager, widget, revealCallback) {
    this._manager = manager;
    this._revealCallback = revealCallback;
    this._widget = widget;
  }

  /**
   * @return {!UI.Widget}
   */
  widget() {
    return this._widget;
  }

  _reveal() {
    if (this._revealCallback)
      this._revealCallback();
  }
};

UI.ViewManager._Location.symbol = Symbol('location');

/**
 * @implements {UI.TabbedViewLocation}
 * @unrestricted
 */
UI.ViewManager._TabbedLocation = class extends UI.ViewManager._Location {
  /**
   * @param {!UI.ViewManager} manager
   * @param {function()=} revealCallback
   * @param {string=} location
   * @param {boolean=} restoreSelection
   * @param {boolean=} allowReorder
   * @param {?string=} defaultTab
   */
  constructor(manager, revealCallback, location, restoreSelection, allowReorder, defaultTab) {
    const tabbedPane = new UI.TabbedPane();
    if (allowReorder)
      tabbedPane.setAllowTabReorder(true);

    super(manager, tabbedPane, revealCallback);
    this._tabbedPane = tabbedPane;
    this._allowReorder = allowReorder;

    this._tabbedPane.addEventListener(UI.TabbedPane.Events.TabSelected, this._tabSelected, this);
    this._tabbedPane.addEventListener(UI.TabbedPane.Events.TabClosed, this._tabClosed, this);
    this._closeableTabSetting = Common.settings.createSetting(location + '-closeableTabs', {});
    this._tabOrderSetting = Common.settings.createSetting(location + '-tabOrder', {});
    this._tabbedPane.addEventListener(
        UI.TabbedPane.Events.TabOrderChanged, event => this._persistTabOrder(event.data['tabId']));
    if (restoreSelection)
      this._lastSelectedTabSetting = Common.settings.createSetting(location + '-selectedTab', '');
    this._defaultTab = defaultTab;

    /** @type {!Map.<string, !UI.View>} */
    this._views = new Map();

    if (location)
      this.appendApplicableItems(location);
  }

  /**
   * @override
   * @return {!UI.Widget}
   */
  widget() {
    return this._tabbedPane;
  }

  /**
   * @override
   * @return {!UI.TabbedPane}
   */
  tabbedPane() {
    return this._tabbedPane;
  }

  /**
   * @override
   */
  enableMoreTabsButton() {
    this._tabbedPane.leftToolbar().appendToolbarItem(new UI.ToolbarMenuButton(this._appendTabsToMenu.bind(this)));
    this._tabbedPane.disableOverflowMenu();
  }

  /**
   * @override
   * @param {string} locationName
   */
  appendApplicableItems(locationName) {
    const views = this._manager._viewsForLocation(locationName);
    if (this._allowReorder) {
      let i = 0;
      const persistedOrders = this._tabOrderSetting.get();
      const orders = new Map();
      for (const view of views)
        orders.set(view.viewId(), persistedOrders[view.viewId()] || (++i) * UI.ViewManager._TabbedLocation.orderStep);
      views.sort((a, b) => orders.get(a.viewId()) - orders.get(b.viewId()));
    }

    for (const view of views) {
      const id = view.viewId();
      this._views.set(id, view);
      view[UI.ViewManager._Location.symbol] = this;
      if (view.isTransient())
        continue;
      if (!view.isCloseable())
        this._appendTab(view);
      else if (this._closeableTabSetting.get()[id])
        this._appendTab(view);
    }
    if (this._defaultTab && this._tabbedPane.hasTab(this._defaultTab))
      this._tabbedPane.selectTab(this._defaultTab);
    else if (this._lastSelectedTabSetting && this._tabbedPane.hasTab(this._lastSelectedTabSetting.get()))
      this._tabbedPane.selectTab(this._lastSelectedTabSetting.get());
  }

  /**
   * @param {!UI.ContextMenu} contextMenu
   */
  _appendTabsToMenu(contextMenu) {
    const views = Array.from(this._views.values());
    views.sort((viewa, viewb) => viewa.title().localeCompare(viewb.title()));
    for (const view of views) {
      const title = Common.UIString(view.title());
      contextMenu.defaultSection().appendItem(title, this.showView.bind(this, view, undefined, true));
    }
  }

  /**
   * @param {!UI.View} view
   * @param {number=} index
   */
  _appendTab(view, index) {
    this._tabbedPane.appendTab(
        view.viewId(), view.title(), new UI.ViewManager._ContainerWidget(view), undefined, false,
        view.isCloseable() || view.isTransient(), index);
  }

  /**
   * @override
   * @param {!UI.View} view
   * @param {?UI.View=} insertBefore
   */
  appendView(view, insertBefore) {
    if (this._tabbedPane.hasTab(view.viewId()))
      return;
    const oldLocation = view[UI.ViewManager._Location.symbol];
    if (oldLocation && oldLocation !== this)
      oldLocation.removeView(view);
    view[UI.ViewManager._Location.symbol] = this;
    this._manager._views.set(view.viewId(), view);
    this._views.set(view.viewId(), view);
    let index = undefined;
    const tabIds = this._tabbedPane.tabIds();
    if (this._allowReorder) {
      const orderSetting = this._tabOrderSetting.get();
      const order = orderSetting[view.viewId()];
      for (let i = 0; order && i < tabIds.length; ++i) {
        if (orderSetting[tabIds[i]] && orderSetting[tabIds[i]] > order) {
          index = i;
          break;
        }
      }
    } else if (insertBefore) {
      for (let i = 0; i < tabIds.length; ++i) {
        if (tabIds[i] === insertBefore.viewId()) {
          index = i;
          break;
        }
      }
    }
    this._appendTab(view, index);

    if (view.isCloseable()) {
      const tabs = this._closeableTabSetting.get();
      const tabId = view.viewId();
      if (!tabs[tabId]) {
        tabs[tabId] = true;
        this._closeableTabSetting.set(tabs);
      }
    }
    this._persistTabOrder(view.viewId());
  }

  /**
   * @override
   * @param {!UI.View} view
   * @param {?UI.View=} insertBefore
   * @param {boolean=} userGesture
   * @param {boolean=} omitFocus
   * @return {!Promise}
   */
  showView(view, insertBefore, userGesture, omitFocus) {
    this.appendView(view, insertBefore);
    this._tabbedPane.selectTab(view.viewId(), userGesture);
    if (!omitFocus)
      this._tabbedPane.focus();
    const widget = /** @type {!UI.ViewManager._ContainerWidget} */ (this._tabbedPane.tabView(view.viewId()));
    return widget._materialize();
  }

  /**
   * @param {!UI.View} view
   * @override
   */
  removeView(view) {
    if (!this._tabbedPane.hasTab(view.viewId()))
      return;

    delete view[UI.ViewManager._Location.symbol];
    this._manager._views.delete(view.viewId());
    this._tabbedPane.closeTab(view.viewId());
    this._views.delete(view.viewId());
  }

  /**
   * @param {!Common.Event} event
   */
  _tabSelected(event) {
    const tabId = /** @type {string} */ (event.data.tabId);
    if (this._lastSelectedTabSetting && event.data['isUserGesture'])
      this._lastSelectedTabSetting.set(tabId);
  }

  /**
   * @param {!Common.Event} event
   */
  _tabClosed(event) {
    const id = /** @type {string} */ (event.data['tabId']);
    const tabs = this._closeableTabSetting.get();
    if (tabs[id]) {
      delete tabs[id];
      this._closeableTabSetting.set(tabs);
    }
    this._views.get(id).disposeView();
  }

  /**
   * @param {string} tabId
   */
  _persistTabOrder(tabId) {
    const tabIds = this._tabbedPane.tabIds();
    const previousId = tabIds[tabIds.indexOf(tabId) - 1];
    const orders = this._tabOrderSetting.get();
    orders[tabId] = previousId && orders[previousId] ? orders[previousId] + 1 : 0;
    const keys = Object.keys(orders);
    keys.sort((a, b) => orders[a] - orders[b]);

    const tabOrders = {};
    for (let i = 0; i < keys.length; i++)
      tabOrders[keys[i]] = (i + 1) * UI.ViewManager._TabbedLocation.orderStep;
    this._tabOrderSetting.set(tabOrders);
  }
};

UI.ViewManager._TabbedLocation.orderStep = 10;  // Keep in sync with descriptors.

/**
 * @implements {UI.ViewLocation}
 * @unrestricted
 */
UI.ViewManager._StackLocation = class extends UI.ViewManager._Location {
  /**
   * @param {!UI.ViewManager} manager
   * @param {function()=} revealCallback
   * @param {string=} location
   */
  constructor(manager, revealCallback, location) {
    const vbox = new UI.VBox();
    super(manager, vbox, revealCallback);
    this._vbox = vbox;

    /** @type {!Map<string, !UI.ViewManager._ExpandableContainerWidget>} */
    this._expandableContainers = new Map();

    if (location)
      this.appendApplicableItems(location);
  }

  /**
   * @override
   * @param {!UI.View} view
   * @param {?UI.View=} insertBefore
   */
  appendView(view, insertBefore) {
    const oldLocation = view[UI.ViewManager._Location.symbol];
    if (oldLocation && oldLocation !== this)
      oldLocation.removeView(view);

    let container = this._expandableContainers.get(view.viewId());
    if (!container) {
      view[UI.ViewManager._Location.symbol] = this;
      this._manager._views.set(view.viewId(), view);
      container = new UI.ViewManager._ExpandableContainerWidget(view);
      let beforeElement = null;
      if (insertBefore) {
        const beforeContainer = insertBefore[UI.ViewManager._ExpandableContainerWidget._symbol];
        beforeElement = beforeContainer ? beforeContainer.element : null;
      }
      container.show(this._vbox.contentElement, beforeElement);
      this._expandableContainers.set(view.viewId(), container);
    }
  }

  /**
   * @override
   * @param {!UI.View} view
   * @param {?UI.View=} insertBefore
   * @return {!Promise}
   */
  showView(view, insertBefore) {
    this.appendView(view, insertBefore);
    const container = this._expandableContainers.get(view.viewId());
    return container._expand();
  }

  /**
   * @param {!UI.View} view
   * @override
   */
  removeView(view) {
    const container = this._expandableContainers.get(view.viewId());
    if (!container)
      return;

    container.detach();
    this._expandableContainers.delete(view.viewId());
    delete view[UI.ViewManager._Location.symbol];
    this._manager._views.delete(view.viewId());
  }

  /**
   * @override
   * @param {string} locationName
   */
  appendApplicableItems(locationName) {
    for (const view of this._manager._viewsForLocation(locationName))
      this.appendView(view);
  }
};

/**
 * @type {!UI.ViewManager}
 */
UI.viewManager;
