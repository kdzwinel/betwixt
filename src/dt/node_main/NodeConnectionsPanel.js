// Copyright 2015 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

NodeMain.NodeConnectionsPanel = class extends UI.Panel {
  constructor() {
    super('node-connection');
    this.registerRequiredCSS('node_main/nodeConnectionsPanel.css');
    this.contentElement.classList.add('node-panel');

    const container = this.contentElement.createChild('div', 'node-panel-center');

    const image = container.createChild('img', 'node-panel-logo');
    image.src = 'https://nodejs.org/static/images/logos/nodejs-new-pantone-black.png';

    InspectorFrontendHost.events.addEventListener(
        InspectorFrontendHostAPI.Events.DevicesDiscoveryConfigChanged, this._devicesDiscoveryConfigChanged, this);

    /** @type {!Adb.Config} */
    this._config;

    this.contentElement.tabIndex = 0;
    this.setDefaultFocusedElement(this.contentElement);

    // Trigger notification once.
    InspectorFrontendHost.setDevicesUpdatesEnabled(false);
    InspectorFrontendHost.setDevicesUpdatesEnabled(true);

    this._networkDiscoveryView = new NodeMain.NodeConnectionsView(config => {
      this._config.networkDiscoveryConfig = config;
      InspectorFrontendHost.setDevicesDiscoveryConfig(this._config);
    });
    this._networkDiscoveryView.show(container);
  }

  /**
   * @param {!Common.Event} event
   */
  _devicesDiscoveryConfigChanged(event) {
    this._config = /** @type {!Adb.Config} */ (event.data);
    this._networkDiscoveryView.discoveryConfigChanged(this._config.networkDiscoveryConfig);
  }
};

/**
 * @implements {UI.ListWidget.Delegate<Adb.PortForwardingRule>}
 */
NodeMain.NodeConnectionsView = class extends UI.VBox {
  /**
   * @param {function(!Adb.NetworkDiscoveryConfig)} callback
   */
  constructor(callback) {
    super();
    this._callback = callback;
    this.element.classList.add('network-discovery-view');

    const networkDiscoveryFooter = this.element.createChild('div', 'network-discovery-footer');
    networkDiscoveryFooter.createChild('span').textContent =
        Common.UIString('Specify network endpoint and DevTools will connect to it automatically. ');
    const link = networkDiscoveryFooter.createChild('span', 'link');
    link.textContent = Common.UIString('Learn more');
    link.addEventListener('click', () => InspectorFrontendHost.openInNewTab('https://nodejs.org/en/docs/inspector/'));

    /** @type {!UI.ListWidget<!Adb.PortForwardingRule>} */
    this._list = new UI.ListWidget(this);
    this._list.registerRequiredCSS('node_main/nodeConnectionsPanel.css');
    this._list.element.classList.add('network-discovery-list');
    const placeholder = createElementWithClass('div', 'network-discovery-list-empty');
    placeholder.textContent = Common.UIString('No connections specified');
    this._list.setEmptyPlaceholder(placeholder);
    this._list.show(this.element);
    /** @type {?UI.ListWidget.Editor<!Adb.PortForwardingRule>} */
    this._editor = null;

    const addButton = UI.createTextButton(
        Common.UIString('Add connection'), this._addNetworkTargetButtonClicked.bind(this), 'add-network-target-button',
        true /* primary */);
    this.element.appendChild(addButton);

    /** @type {!Array<{address: string}>} */
    this._networkDiscoveryConfig = [];

    this.element.classList.add('node-frontend');
  }

  _update() {
    const config = this._networkDiscoveryConfig.map(item => item.address);
    this._callback.call(null, config);
  }

  _addNetworkTargetButtonClicked() {
    this._list.addNewItem(this._networkDiscoveryConfig.length, {address: '', port: ''});
  }

  /**
   * @param {!Adb.NetworkDiscoveryConfig} networkDiscoveryConfig
   */
  discoveryConfigChanged(networkDiscoveryConfig) {
    this._networkDiscoveryConfig = [];
    this._list.clear();
    for (const address of networkDiscoveryConfig) {
      const item = {address: address, port: ''};
      this._networkDiscoveryConfig.push(item);
      this._list.appendItem(item, true);
    }
  }

  /**
   * @override
   * @param {!Adb.PortForwardingRule} rule
   * @param {boolean} editable
   * @return {!Element}
   */
  renderItem(rule, editable) {
    const element = createElementWithClass('div', 'network-discovery-list-item');
    element.createChild('div', 'network-discovery-value network-discovery-address').textContent = rule.address;
    return element;
  }

  /**
   * @override
   * @param {!Adb.PortForwardingRule} rule
   * @param {number} index
   */
  removeItemRequested(rule, index) {
    this._networkDiscoveryConfig.splice(index, 1);
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
    rule.address = editor.control('address').value.trim();
    if (isNew)
      this._networkDiscoveryConfig.push(rule);
    this._update();
  }

  /**
   * @override
   * @param {!Adb.PortForwardingRule} rule
   * @return {!UI.ListWidget.Editor}
   */
  beginEdit(rule) {
    const editor = this._createEditor();
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
    const fields = content.createChild('div', 'network-discovery-edit-row');
    const input = editor.createInput('address', 'text', 'Network address (e.g. localhost:9229)', addressValidator);
    fields.createChild('div', 'network-discovery-value network-discovery-address').appendChild(input);
    return editor;

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
