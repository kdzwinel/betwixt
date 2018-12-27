// Copyright 2015 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

Devices.DevicesView = class extends UI.VBox {
  constructor() {
    super(true);
    this.registerRequiredCSS('devices/devicesView.css');
    this.contentElement.classList.add('devices-view');

    const hbox = this.contentElement.createChild('div', 'hbox devices-container');
    const sidebar = hbox.createChild('div', 'devices-sidebar');
    sidebar.createChild('div', 'devices-view-title').createTextChild(Common.UIString('Devices'));
    this._sidebarList = sidebar.createChild('div', 'devices-sidebar-list');

    this._discoveryView = new Devices.DevicesView.DiscoveryView();
    this._sidebarListSpacer = this._sidebarList.createChild('div', 'devices-sidebar-spacer');
    this._discoveryListItem = this._sidebarList.createChild('div', 'devices-sidebar-item');
    this._discoveryListItem.textContent = Common.UIString('Settings');
    this._discoveryListItem.addEventListener(
        'click', this._selectSidebarListItem.bind(this, this._discoveryListItem, this._discoveryView));

    /** @type {!Map<string, !Devices.DevicesView.DeviceView>} */
    this._viewById = new Map();
    /** @type {!Array<!Adb.Device>} */
    this._devices = [];
    /** @type {!Map<string, !Element>} */
    this._listItemById = new Map();
    /** @type {?Element} */
    this._selectedListItem = null;
    /** @type {?UI.Widget} */
    this._visibleView = null;

    this._viewContainer = hbox.createChild('div', 'flex-auto vbox');

    const discoveryFooter = this.contentElement.createChild('div', 'devices-footer');
    this._deviceCountSpan = discoveryFooter.createChild('span');
    discoveryFooter.createChild('span').textContent = Common.UIString(' Read ');
    discoveryFooter.appendChild(UI.XLink.create(
        'https://developers.google.com/chrome-developer-tools/docs/remote-debugging',
        Common.UIString('remote debugging documentation')));
    discoveryFooter.createChild('span').textContent = Common.UIString(' for more information.');
    this._updateFooter();
    this._selectSidebarListItem(this._discoveryListItem, this._discoveryView);

    InspectorFrontendHost.events.addEventListener(
        InspectorFrontendHostAPI.Events.DevicesUpdated, this._devicesUpdated, this);
    InspectorFrontendHost.events.addEventListener(
        InspectorFrontendHostAPI.Events.DevicesDiscoveryConfigChanged, this._devicesDiscoveryConfigChanged, this);
    InspectorFrontendHost.events.addEventListener(
        InspectorFrontendHostAPI.Events.DevicesPortForwardingStatusChanged, this._devicesPortForwardingStatusChanged,
        this);

    this.contentElement.tabIndex = 0;
    this.setDefaultFocusedElement(this.contentElement);
  }

  /**
   * @return {!Devices.DevicesView}
   */
  static _instance() {
    if (!Devices.DevicesView._instanceObject)
      Devices.DevicesView._instanceObject = new Devices.DevicesView();
    return Devices.DevicesView._instanceObject;
  }

  /**
   * @param {!Element} listItem
   * @param {!UI.Widget} view
   */
  _selectSidebarListItem(listItem, view) {
    if (this._selectedListItem === listItem)
      return;

    if (this._selectedListItem) {
      this._selectedListItem.classList.remove('selected');
      this._visibleView.detach();
    }

    this._visibleView = view;
    this._selectedListItem = listItem;
    this._visibleView.show(this._viewContainer);
    this._selectedListItem.classList.add('selected');
  }

  /**
   * @param {!Common.Event} event
   */
  _devicesUpdated(event) {
    this._devices =
        /** @type {!Array.<!Adb.Device>} */ (event.data)
            .slice()
            .filter(d => d.adbSerial.toUpperCase() !== 'WEBRTC' && d.adbSerial.toUpperCase() !== 'LOCALHOST');
    for (const device of this._devices) {
      if (!device.adbConnected)
        device.adbModel = Common.UIString('Unknown');
    }

    const ids = new Set();
    for (const device of this._devices)
      ids.add(device.id);

    let selectedRemoved = false;
    for (const deviceId of this._viewById.keys()) {
      if (!ids.has(deviceId)) {
        const listItem = /** @type {!Element} */ (this._listItemById.get(deviceId));
        this._listItemById.remove(deviceId);
        this._viewById.remove(deviceId);
        listItem.remove();
        if (listItem === this._selectedListItem)
          selectedRemoved = true;
      }
    }

    for (const device of this._devices) {
      let view = this._viewById.get(device.id);
      let listItem = this._listItemById.get(device.id);

      if (!view) {
        view = new Devices.DevicesView.DeviceView();
        this._viewById.set(device.id, view);
        listItem = this._createSidebarListItem(view);
        this._listItemById.set(device.id, listItem);
        this._sidebarList.insertBefore(listItem, this._sidebarListSpacer);
      }

      listItem._title.textContent = device.adbModel;
      listItem._status.textContent =
          device.adbConnected ? Common.UIString('Connected') : Common.UIString('Pending Authorization');
      listItem.classList.toggle('device-connected', device.adbConnected);
      view.update(device);
    }

    if (selectedRemoved)
      this._selectSidebarListItem(this._discoveryListItem, this._discoveryView);

    this._updateFooter();
  }

  /**
   * @param {!UI.Widget} view
   * @return {!Element}
   */
  _createSidebarListItem(view) {
    const listItem = createElementWithClass('div', 'devices-sidebar-item');
    listItem.addEventListener('click', this._selectSidebarListItem.bind(this, listItem, view));
    listItem._title = listItem.createChild('div', 'devices-sidebar-item-title');
    listItem._status = listItem.createChild('div', 'devices-sidebar-item-status');
    return listItem;
  }

  /**
   * @param {!Common.Event} event
   */
  _devicesDiscoveryConfigChanged(event) {
    const config = /** @type {!Adb.Config} */ (event.data);
    this._discoveryView.discoveryConfigChanged(config);
  }

  /**
   * @param {!Common.Event} event
   */
  _devicesPortForwardingStatusChanged(event) {
    const status = /** @type {!Adb.PortForwardingStatus} */ (event.data);
    for (const deviceId in status) {
      const view = this._viewById.get(deviceId);
      if (view)
        view.portForwardingStatusChanged(status[deviceId]);
    }
    for (const deviceId of this._viewById.keys()) {
      const view = this._viewById.get(deviceId);
      if (view && !(deviceId in status))
        view.portForwardingStatusChanged({ports: {}, browserId: ''});
    }
  }

  _updateFooter() {
    this._deviceCountSpan.textContent = !this._devices.length ?
        Common.UIString('No devices detected.') :
        this._devices.length === 1 ? Common.UIString('1 device detected.') :
                                     Common.UIString('%d devices detected.', this._devices.length);
  }

  /**
   * @override
   */
  wasShown() {
    super.wasShown();
    InspectorFrontendHost.setDevicesUpdatesEnabled(true);
  }

  /**
   * @override
   */
  willHide() {
    super.willHide();
    InspectorFrontendHost.setDevicesUpdatesEnabled(false);
  }
};

Devices.DevicesView.DiscoveryView = class extends UI.VBox {
  constructor() {
    super();
    this.setMinimumSize(100, 100);
    this.element.classList.add('discovery-view');

    this.contentElement.createChild('div', 'hbox device-text-row').createChild('div', 'view-title').textContent =
        Common.UIString('Settings');

    const discoverUsbDevicesCheckbox = UI.CheckboxLabel.create(Common.UIString('Discover USB devices'));
    discoverUsbDevicesCheckbox.classList.add('usb-checkbox');
    this.element.appendChild(discoverUsbDevicesCheckbox);
    this._discoverUsbDevicesCheckbox = discoverUsbDevicesCheckbox.checkboxElement;
    this._discoverUsbDevicesCheckbox.addEventListener('click', () => {
      this._config.discoverUsbDevices = this._discoverUsbDevicesCheckbox.checked;
      InspectorFrontendHost.setDevicesDiscoveryConfig(this._config);
    }, false);

    const help = this.element.createChild('div', 'discovery-help');
    help.createChild('span').textContent = Common.UIString('Need help? Read Chrome ');
    help.appendChild(UI.XLink.create(
        'https://developers.google.com/chrome-developer-tools/docs/remote-debugging',
        Common.UIString('remote debugging documentation.')));

    /** @type {!Adb.Config} */
    this._config;

    this._portForwardingView = new Devices.DevicesView.PortForwardingView((enabled, config) => {
      this._config.portForwardingEnabled = enabled;
      this._config.portForwardingConfig = {};
      for (const rule of config)
        this._config.portForwardingConfig[rule.port] = rule.address;
      InspectorFrontendHost.setDevicesDiscoveryConfig(this._config);
    });
    this._portForwardingView.show(this.element);
  }

  /**
   * @param {!Adb.Config} config
   */
  discoveryConfigChanged(config) {
    this._config = config;
    this._discoverUsbDevicesCheckbox.checked = config.discoverUsbDevices;
    this._portForwardingView.discoveryConfigChanged(config.portForwardingEnabled, config.portForwardingConfig);
  }
};

/**
 * @implements {UI.ListWidget.Delegate<Adb.PortForwardingRule>}
 */
Devices.DevicesView.PortForwardingView = class extends UI.VBox {
  /**
   * @param {function(boolean, !Array<!Adb.PortForwardingRule>)} callback
   */
  constructor(callback) {
    super();
    this._callback = callback;
    this.element.classList.add('port-forwarding-view');

    const portForwardingHeader = this.element.createChild('div', 'port-forwarding-header');
    const portForwardingEnabledCheckbox = UI.CheckboxLabel.create(Common.UIString('Port forwarding'));
    portForwardingEnabledCheckbox.classList.add('port-forwarding-checkbox');
    portForwardingHeader.appendChild(portForwardingEnabledCheckbox);
    this._portForwardingEnabledCheckbox = portForwardingEnabledCheckbox.checkboxElement;
    this._portForwardingEnabledCheckbox.addEventListener('click', this._update.bind(this), false);

    const portForwardingFooter = this.element.createChild('div', 'port-forwarding-footer');
    portForwardingFooter.createChild('span').textContent = Common.UIString(
        'Define the listening port on your device that maps to a port accessible from your development machine. ');
    portForwardingFooter.appendChild(UI.XLink.create(
        'https://developer.chrome.com/devtools/docs/remote-debugging#port-forwarding', Common.UIString('Learn more')));

    /** @type {!UI.ListWidget<!Adb.PortForwardingRule>} */
    this._list = new UI.ListWidget(this);
    this._list.registerRequiredCSS('devices/devicesView.css');
    this._list.element.classList.add('port-forwarding-list');
    const placeholder = createElementWithClass('div', 'port-forwarding-list-empty');
    placeholder.textContent = Common.UIString('No rules');
    this._list.setEmptyPlaceholder(placeholder);
    this._list.show(this.element);
    /** @type {?UI.ListWidget.Editor<!Adb.PortForwardingRule>} */
    this._editor = null;

    this.element.appendChild(
        UI.createTextButton(Common.UIString('Add rule'), this._addRuleButtonClicked.bind(this), 'add-rule-button'));

    /** @type {!Array<!Adb.PortForwardingRule>} */
    this._portForwardingConfig = [];
  }

  _update() {
    this._callback.call(null, this._portForwardingEnabledCheckbox.checked, this._portForwardingConfig);
  }

  _addRuleButtonClicked() {
    this._list.addNewItem(this._portForwardingConfig.length, {port: '', address: ''});
  }

  /**
   * @param {boolean} portForwardingEnabled
   * @param {!Adb.PortForwardingConfig} portForwardingConfig
   */
  discoveryConfigChanged(portForwardingEnabled, portForwardingConfig) {
    this._portForwardingEnabledCheckbox.checked = portForwardingEnabled;
    this._portForwardingConfig = [];
    this._list.clear();
    for (const key of Object.keys(portForwardingConfig)) {
      const rule = /** @type {!Adb.PortForwardingRule} */ ({port: key, address: portForwardingConfig[key]});
      this._portForwardingConfig.push(rule);
      this._list.appendItem(rule, true);
    }
  }

  /**
   * @override
   * @param {!Adb.PortForwardingRule} rule
   * @param {boolean} editable
   * @return {!Element}
   */
  renderItem(rule, editable) {
    const element = createElementWithClass('div', 'port-forwarding-list-item');
    const port = element.createChild('div', 'port-forwarding-value port-forwarding-port');
    port.createChild('span', 'port-localhost').textContent = Common.UIString('localhost:');
    port.createTextChild(rule.port);
    element.createChild('div', 'port-forwarding-separator');
    element.createChild('div', 'port-forwarding-value').textContent = rule.address;
    return element;
  }

  /**
   * @override
   * @param {!Adb.PortForwardingRule} rule
   * @param {number} index
   */
  removeItemRequested(rule, index) {
    this._portForwardingConfig.splice(index, 1);
    this._list.removeItem(index);
    this._update();
  }

  /**
   * @override
   * @param {!Adb.PortForwardingRule} rule
   * @param {!UI.ListWidget.Editor} editor
   * @param {boolean} isNew
   */
  commitEdit(rule, editor, isNew) {
    rule.port = editor.control('port').value.trim();
    rule.address = editor.control('address').value.trim();
    if (isNew)
      this._portForwardingConfig.push(rule);
    this._update();
  }

  /**
   * @override
   * @param {!Adb.PortForwardingRule} rule
   * @return {!UI.ListWidget.Editor}
   */
  beginEdit(rule) {
    const editor = this._createEditor();
    editor.control('port').value = rule.port;
    editor.control('address').value = rule.address;
    return editor;
  }

  /**
   * @return {!UI.ListWidget.Editor<!Adb.PortForwardingRule>}
   */
  _createEditor() {
    if (this._editor)
      return this._editor;

    const editor = new UI.ListWidget.Editor();
    this._editor = editor;
    const content = editor.contentElement();
    const fields = content.createChild('div', 'port-forwarding-edit-row');
    fields.createChild('div', 'port-forwarding-value port-forwarding-port')
        .appendChild(editor.createInput('port', 'text', 'Device port (3333)', portValidator.bind(this)));
    fields.createChild('div', 'port-forwarding-separator port-forwarding-separator-invisible');
    fields.createChild('div', 'port-forwarding-value')
        .appendChild(editor.createInput('address', 'text', 'Local address (dev.example.corp:3333)', addressValidator));
    return editor;

    /**
     * @param {!Adb.PortForwardingRule} rule
     * @param {number} index
     * @param {!HTMLInputElement|!HTMLSelectElement} input
     * @this {Devices.DevicesView.PortForwardingView}
     * @return {boolean}
     */
    function portValidator(rule, index, input) {
      const value = input.value.trim();
      const match = value.match(/^(\d+)$/);
      if (!match)
        return false;
      const port = parseInt(match[1], 10);
      if (port < 1024 || port > 65535)
        return false;
      for (let i = 0; i < this._portForwardingConfig.length; ++i) {
        if (i !== index && this._portForwardingConfig[i].port === value)
          return false;
      }
      return true;
    }

    /**
     * @param {!Adb.PortForwardingRule} rule
     * @param {number} index
     * @param {!HTMLInputElement|!HTMLSelectElement} input
     * @return {boolean}
     */
    function addressValidator(rule, index, input) {
      const match = input.value.trim().match(/^([a-zA-Z0-9\.\-_]+):(\d+)$/);
      if (!match)
        return false;
      const port = parseInt(match[2], 10);
      return port <= 65535;
    }
  }
};

Devices.DevicesView.DeviceView = class extends UI.VBox {
  constructor() {
    super();
    this.setMinimumSize(100, 100);
    this.contentElement.classList.add('device-view');

    const topRow = this.contentElement.createChild('div', 'hbox device-text-row');
    this._deviceTitle = topRow.createChild('div', 'view-title');
    this._deviceSerial = topRow.createChild('div', 'device-serial');
    this._portStatus = this.contentElement.createChild('div', 'device-port-status hidden');

    this._deviceOffline = this.contentElement.createChild('div');
    this._deviceOffline.textContent =
        Common.UIString('Pending authentication: please accept debugging session on the device.');

    this._noBrowsers = this.contentElement.createChild('div');
    this._noBrowsers.textContent = Common.UIString('No browsers detected.');

    this._browsers = this.contentElement.createChild('div', 'device-browser-list vbox');

    /** @type {!Map<string, !Devices.DevicesView.BrowserSection>} */
    this._browserById = new Map();

    /** @type {?string} */
    this._cachedPortStatus = null;
    /** @type {?Adb.Device} */
    this._device = null;
  }

  /**
   * @param {!Adb.Device} device
   */
  update(device) {
    if (!this._device || this._device.adbModel !== device.adbModel)
      this._deviceTitle.textContent = device.adbModel;

    if (!this._device || this._device.adbSerial !== device.adbSerial)
      this._deviceSerial.textContent = '#' + device.adbSerial;

    this._deviceOffline.classList.toggle('hidden', device.adbConnected);
    this._noBrowsers.classList.toggle('hidden', !device.adbConnected || !!device.browsers.length);
    this._browsers.classList.toggle('hidden', !device.adbConnected || !device.browsers.length);

    const browserIds = new Set();
    for (const browser of device.browsers)
      browserIds.add(browser.id);

    for (const browserId of this._browserById.keys()) {
      if (!browserIds.has(browserId)) {
        this._browserById.get(browserId).element.remove();
        this._browserById.remove(browserId);
      }
    }

    for (const browser of device.browsers) {
      let section = this._browserById.get(browser.id);
      if (!section) {
        section = this._createBrowserSection();
        this._browserById.set(browser.id, section);
        this._browsers.appendChild(section.element);
      }
      this._updateBrowserSection(section, browser);
    }

    this._device = device;
  }

  /**
   * @return {!Devices.DevicesView.BrowserSection}
   */
  _createBrowserSection() {
    const element = createElementWithClass('div', 'vbox flex-none');
    const topRow = element.createChild('div', '');
    const title = topRow.createChild('div', 'device-browser-title');

    const newTabRow = element.createChild('div', 'device-browser-new-tab');
    newTabRow.createChild('div', '').textContent = Common.UIString('New tab:');
    const newTabInput = UI.createInput('', 'text');
    newTabRow.appendChild(newTabInput);
    newTabInput.placeholder = Common.UIString('Enter URL');
    newTabInput.addEventListener('keydown', newTabKeyDown, false);
    const newTabButton = UI.createTextButton(Common.UIString('Open'), openNewTab);
    newTabRow.appendChild(newTabButton);

    const pages = element.createChild('div', 'device-page-list vbox');

    const viewMore = element.createChild('div', 'device-view-more');
    viewMore.addEventListener('click', viewMoreClick, false);
    updateViewMoreTitle();

    const section = {
      browser: null,
      element: element,
      title: title,
      pages: pages,
      viewMore: viewMore,
      newTab: newTabRow,
      pageSections: new Map()
    };
    return section;

    function viewMoreClick() {
      pages.classList.toggle('device-view-more-toggled');
      updateViewMoreTitle();
    }

    function updateViewMoreTitle() {
      viewMore.textContent = pages.classList.contains('device-view-more-toggled') ?
          Common.UIString('View less tabs\u2026') :
          Common.UIString('View more tabs\u2026');
    }

    /**
     * @param {!Event} event
     */
    function newTabKeyDown(event) {
      if (event.key === 'Enter') {
        event.consume(true);
        openNewTab();
      }
    }

    function openNewTab() {
      if (section.browser) {
        InspectorFrontendHost.openRemotePage(section.browser.id, newTabInput.value.trim() || 'about:blank');
        newTabInput.value = '';
      }
    }
  }

  /**
   * @param {!Devices.DevicesView.BrowserSection} section
   * @param {!Adb.Browser} browser
   */
  _updateBrowserSection(section, browser) {
    if (!section.browser || section.browser.adbBrowserName !== browser.adbBrowserName ||
        section.browser.adbBrowserVersion !== browser.adbBrowserVersion) {
      if (browser.adbBrowserVersion)
        section.title.textContent = String.sprintf('%s (%s)', browser.adbBrowserName, browser.adbBrowserVersion);
      else
        section.title.textContent = browser.adbBrowserName;
    }

    const pageIds = new Set();
    for (const page of browser.pages)
      pageIds.add(page.id);

    for (const pageId of section.pageSections.keys()) {
      if (!pageIds.has(pageId)) {
        section.pageSections.get(pageId).element.remove();
        section.pageSections.remove(pageId);
      }
    }

    for (let index = 0; index < browser.pages.length; ++index) {
      const page = browser.pages[index];
      let pageSection = section.pageSections.get(page.id);
      if (!pageSection) {
        pageSection = this._createPageSection();
        section.pageSections.set(page.id, pageSection);
        section.pages.appendChild(pageSection.element);
      }
      this._updatePageSection(pageSection, page);
      if (!index && section.pages.firstChild !== pageSection.element)
        section.pages.insertBefore(pageSection.element, section.pages.firstChild);
    }

    const kViewMoreCount = 3;
    for (let index = 0, element = section.pages.firstChild; element; element = element.nextSibling, ++index)
      element.classList.toggle('device-view-more-page', index >= kViewMoreCount);
    section.viewMore.classList.toggle('device-needs-view-more', browser.pages.length > kViewMoreCount);
    section.newTab.classList.toggle('hidden', !browser.adbBrowserChromeVersion);
    section.browser = browser;
  }

  /**
   * @return {!Devices.DevicesView.PageSection}
   */
  _createPageSection() {
    const element = createElementWithClass('div', 'vbox');

    const titleRow = element.createChild('div', 'device-page-title-row');
    const title = titleRow.createChild('div', 'device-page-title');
    const inspect = UI.createTextButton(Common.UIString('Inspect'), doAction.bind(null, 'inspect'));
    titleRow.appendChild(inspect);

    const toolbar = new UI.Toolbar('');
    toolbar.appendToolbarItem(new UI.ToolbarMenuButton(appendActions));
    titleRow.appendChild(toolbar.element);

    const url = element.createChild('div', 'device-page-url');
    const section = {page: null, element: element, title: title, url: url, inspect: inspect};
    return section;

    /**
     * @param {!UI.ContextMenu} contextMenu
     */
    function appendActions(contextMenu) {
      contextMenu.defaultSection().appendItem(Common.UIString('Reload'), doAction.bind(null, 'reload'));
      contextMenu.defaultSection().appendItem(Common.UIString('Focus'), doAction.bind(null, 'activate'));
      contextMenu.defaultSection().appendItem(Common.UIString('Close'), doAction.bind(null, 'close'));
    }

    /**
     * @param {string} action
     */
    function doAction(action) {
      if (section.page)
        InspectorFrontendHost.performActionOnRemotePage(section.page.id, action);
    }
  }

  /**
   * @param {!Devices.DevicesView.PageSection} section
   * @param {!Adb.Page} page
   */
  _updatePageSection(section, page) {
    if (!section.page || section.page.name !== page.name) {
      section.title.textContent = page.name;
      section.title.title = page.name;
    }
    if (!section.page || section.page.url !== page.url) {
      section.url.textContent = '';
      section.url.appendChild(UI.XLink.create(page.url));
    }
    section.inspect.disabled = page.attached;

    section.page = page;
  }

  /**
   * @param {!Adb.DevicePortForwardingStatus} status
   */
  portForwardingStatusChanged(status) {
    const json = JSON.stringify(status);
    if (json === this._cachedPortStatus)
      return;
    this._cachedPortStatus = json;

    this._portStatus.removeChildren();
    this._portStatus.createChild('div', 'device-port-status-text').textContent = Common.UIString('Port Forwarding:');
    const connected = [];
    const transient = [];
    const error = [];
    let empty = true;
    for (const port in status.ports) {
      if (!status.ports.hasOwnProperty(port))
        continue;

      empty = false;
      const portStatus = status.ports[port];
      const portNumber = createElementWithClass('div', 'device-view-port-number monospace');
      portNumber.textContent = ':' + port;
      if (portStatus >= 0)
        this._portStatus.appendChild(portNumber);
      else
        this._portStatus.insertBefore(portNumber, this._portStatus.firstChild);

      const portIcon = createElementWithClass('div', 'device-view-port-icon');
      if (portStatus >= 0) {
        connected.push(port);
      } else if (portStatus === -1 || portStatus === -2) {
        portIcon.classList.add('device-view-port-icon-transient');
        transient.push(port);
      } else if (portStatus < 0) {
        portIcon.classList.add('device-view-port-icon-error');
        error.push(port);
      }
      this._portStatus.insertBefore(portIcon, portNumber);
    }

    const title = [];
    if (connected.length)
      title.push(Common.UIString('Connected: %s', connected.join(', ')));
    if (transient.length)
      title.push(Common.UIString('Transient: %s', transient.join(', ')));
    if (error.length)
      title.push(Common.UIString('Error: %s', error.join(', ')));
    this._portStatus.title = title.join('; ');
    this._portStatus.classList.toggle('hidden', empty);
  }
};

/** @typedef {!{browser: ?Adb.Browser, element: !Element, title: !Element, pages: !Element, viewMore: !Element, newTab: !Element, pageSections: !Map<string, !Devices.DevicesView.PageSection>}} */
Devices.DevicesView.BrowserSection;

/** @typedef {!{page: ?Adb.Page, element: !Element, title: !Element, url: !Element, inspect: !Element}} */
Devices.DevicesView.PageSection;
