// Copyright 2017 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

Resources.ResourcesPanel = class extends UI.PanelWithSidebar {
  constructor() {
    super('resources');
    this.registerRequiredCSS('resources/resourcesPanel.css');

    this._resourcesLastSelectedItemSetting = Common.settings.createSetting('resourcesLastSelectedElementPath', []);

    /** @type {?UI.Widget} */
    this.visibleView = null;

    /** @type {?Promise<!UI.Widget>} */
    this._pendingViewPromise = null;

    /** @type {?Resources.StorageCategoryView} */
    this._categoryView = null;

    const mainContainer = new UI.VBox();
    this.storageViews = mainContainer.element.createChild('div', 'vbox flex-auto');
    this._storageViewToolbar = new UI.Toolbar('resources-toolbar', mainContainer.element);
    this.splitWidget().setMainWidget(mainContainer);

    /** @type {?Resources.DOMStorageItemsView} */
    this._domStorageView = null;

    /** @type {?Resources.CookieItemsView} */
    this._cookieView = null;

    /** @type {?UI.EmptyWidget} */
    this._emptyWidget = null;

    this._sidebar = new Resources.ApplicationPanelSidebar(this);
    this._sidebar.show(this.panelSidebarElement());
  }

  /**
   * @return {!Resources.ResourcesPanel}
   */
  static _instance() {
    return /** @type {!Resources.ResourcesPanel} */ (self.runtime.sharedInstance(Resources.ResourcesPanel));
  }

  /**
   * @param {!UI.Widget} view
   * @return {boolean}
   */
  static _shouldCloseOnReset(view) {
    const viewClassesToClose = [
      SourceFrame.ResourceSourceFrame, SourceFrame.ImageView, SourceFrame.FontView, Resources.StorageItemsView,
      Resources.DatabaseQueryView, Resources.DatabaseTableView
    ];
    return viewClassesToClose.some(type => view instanceof type);
  }

  /**
   * @override
   */
  focus() {
    this._sidebar.focus();
  }

  /**
   * @return {!Array<string>}
   */
  lastSelectedItemPath() {
    return this._resourcesLastSelectedItemSetting.get();
  }

  /**
   * @param {!Array<string>} path
   */
  setLastSelectedItemPath(path) {
    this._resourcesLastSelectedItemSetting.set(path);
  }

  resetView() {
    if (this.visibleView && Resources.ResourcesPanel._shouldCloseOnReset(this.visibleView))
      this.showView(null);
  }

  /**
   * @param {?UI.Widget} view
   */
  showView(view) {
    this._pendingViewPromise = null;
    if (this.visibleView === view)
      return;

    if (this.visibleView)
      this.visibleView.detach();

    if (view)
      view.show(this.storageViews);
    this.visibleView = view;

    this._storageViewToolbar.removeToolbarItems();
    const toolbarItems = (view instanceof UI.SimpleView && view.syncToolbarItems()) || [];
    for (let i = 0; i < toolbarItems.length; ++i)
      this._storageViewToolbar.appendToolbarItem(toolbarItems[i]);
    this._storageViewToolbar.element.classList.toggle('hidden', !toolbarItems.length);
  }

  /**
   * @param {!Promise<!UI.Widget>} viewPromise
   * @return {!Promise<?UI.Widget>}
   */
  async scheduleShowView(viewPromise) {
    this._pendingViewPromise = viewPromise;
    const view = await viewPromise;
    if (this._pendingViewPromise !== viewPromise)
      return null;
    this.showView(view);
    return view;
  }

  /**
   * @param {string} categoryName
   */
  showCategoryView(categoryName) {
    if (!this._categoryView)
      this._categoryView = new Resources.StorageCategoryView();
    this._categoryView.setText(categoryName);
    this.showView(this._categoryView);
  }

  /**
   * @param {!Resources.DOMStorage} domStorage
   */
  showDOMStorage(domStorage) {
    if (!domStorage)
      return;

    if (!this._domStorageView)
      this._domStorageView = new Resources.DOMStorageItemsView(domStorage);
    else
      this._domStorageView.setStorage(domStorage);
    this.showView(this._domStorageView);
  }

  /**
   * @param {!SDK.Target} cookieFrameTarget
   * @param {string} cookieDomain
   */
  showCookies(cookieFrameTarget, cookieDomain) {
    const model = cookieFrameTarget.model(SDK.CookieModel);
    if (!model)
      return;
    if (!this._cookieView)
      this._cookieView = new Resources.CookieItemsView(model, cookieDomain);
    else
      this._cookieView.setCookiesDomain(model, cookieDomain);
    this.showView(this._cookieView);
  }

  /**
   * @param {string} text
   */
  showEmptyWidget(text) {
    if (!this._emptyWidget)
      this._emptyWidget = new UI.EmptyWidget(text);
    else
      this._emptyWidget.text = text;
    this.showView(this._emptyWidget);
  }

  /**
   * @param {!SDK.Target} target
   * @param {string} cookieDomain
   */
  clearCookies(target, cookieDomain) {
    const model = target.model(SDK.CookieModel);
    if (!model)
      return;
    model.clear(cookieDomain, () => {
      if (this._cookieView)
        this._cookieView.refreshItems();
    });
  }
};

/**
 * @implements {Common.Revealer}
 */
Resources.ResourcesPanel.ResourceRevealer = class {
  /**
   * @override
   * @param {!Object} resource
   * @return {!Promise}
   */
  async reveal(resource) {
    if (!(resource instanceof SDK.Resource))
      return Promise.reject(new Error('Internal error: not a resource'));
    const sidebar = Resources.ResourcesPanel._instance()._sidebar;
    await UI.viewManager.showView('resources');
    await sidebar.showResource(resource);
  }
};
