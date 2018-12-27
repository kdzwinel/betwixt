// Copyright (c) 2016 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * @implements {SDK.TargetManager.Observer}
 */
Resources.ClearStorageView = class extends UI.ThrottledWidget {
  constructor() {
    super(true, 1000);
    const types = Protocol.Storage.StorageType;
    this._pieColors = new Map([
      [types.Appcache, 'rgb(110, 161, 226)'],        // blue
      [types.Cache_storage, 'rgb(229, 113, 113)'],   // red
      [types.Cookies, 'rgb(239, 196, 87)'],          // yellow
      [types.Indexeddb, 'rgb(155, 127, 230)'],       // purple
      [types.Local_storage, 'rgb(116, 178, 102)'],   // green
      [types.Service_workers, 'rgb(255, 167, 36)'],  // orange
      [types.Websql, 'rgb(203, 220, 56)'],           // lime
    ]);

    this._reportView = new UI.ReportView(Common.UIString('Clear storage'));
    this._reportView.registerRequiredCSS('resources/clearStorageView.css');
    this._reportView.element.classList.add('clear-storage-header');
    this._reportView.show(this.contentElement);
    /** @type {?SDK.Target} */
    this._target = null;
    /** @type {?string} */
    this._securityOrigin = null;

    this._settings = new Map();
    for (const type of
             [types.Appcache, types.Cache_storage, types.Cookies, types.Indexeddb, types.Local_storage,
              types.Service_workers, types.Websql])
      this._settings.set(type, Common.settings.createSetting('clear-storage-' + type, true));

    const quota = this._reportView.appendSection(Common.UIString('Usage'));
    this._quotaRow = quota.appendRow();
    const learnMoreRow = quota.appendRow();
    const learnMore = UI.XLink.create(
        'https://developers.google.com/web/tools/chrome-devtools/progressive-web-apps#opaque-responses',
        ls`Learn more`);
    learnMoreRow.appendChild(learnMore);
    this._quotaUsage = null;
    this._pieChart = new PerfUI.PieChart(110, Number.bytesToString, true);
    this._pieChartLegend = createElement('div');
    const usageBreakdownRow = quota.appendRow();
    usageBreakdownRow.classList.add('usage-breakdown-row');
    usageBreakdownRow.appendChild(this._pieChart.element);
    usageBreakdownRow.appendChild(this._pieChartLegend);

    const clearButtonSection = this._reportView.appendSection('', 'clear-storage-button').appendRow();
    this._clearButton = UI.createTextButton(ls`Clear site data`, this._clear.bind(this));
    clearButtonSection.appendChild(this._clearButton);

    const application = this._reportView.appendSection(Common.UIString('Application'));
    this._appendItem(application, Common.UIString('Unregister service workers'), 'service_workers');

    const storage = this._reportView.appendSection(Common.UIString('Storage'));
    this._appendItem(storage, Common.UIString('Local and session storage'), 'local_storage');
    this._appendItem(storage, Common.UIString('IndexedDB'), 'indexeddb');
    this._appendItem(storage, Common.UIString('Web SQL'), 'websql');
    this._appendItem(storage, Common.UIString('Cookies'), 'cookies');

    const caches = this._reportView.appendSection(Common.UIString('Cache'));
    this._appendItem(caches, Common.UIString('Cache storage'), 'cache_storage');
    this._appendItem(caches, Common.UIString('Application cache'), 'appcache');

    SDK.targetManager.observeTargets(this);
  }

  /**
   * @param {!UI.ReportView.Section} section
   * @param {string} title
   * @param {string} settingName
   */
  _appendItem(section, title, settingName) {
    const row = section.appendRow();
    row.appendChild(UI.SettingsUI.createSettingCheckbox(title, this._settings.get(settingName), true));
  }

  /**
   * @override
   * @param {!SDK.Target} target
   */
  targetAdded(target) {
    if (this._target)
      return;
    this._target = target;
    const securityOriginManager = target.model(SDK.SecurityOriginManager);
    this._updateOrigin(securityOriginManager.mainSecurityOrigin());
    securityOriginManager.addEventListener(
        SDK.SecurityOriginManager.Events.MainSecurityOriginChanged, this._originChanged, this);
  }

  /**
   * @override
   * @param {!SDK.Target} target
   */
  targetRemoved(target) {
    if (this._target !== target)
      return;
    const securityOriginManager = target.model(SDK.SecurityOriginManager);
    securityOriginManager.removeEventListener(
        SDK.SecurityOriginManager.Events.MainSecurityOriginChanged, this._originChanged, this);
  }

  /**
   * @param {!Common.Event} event
   */
  _originChanged(event) {
    const origin = /** *@type {string} */ (event.data);
    this._updateOrigin(origin);
  }

  /**
   * @param {string} url
   */
  _updateOrigin(url) {
    this._securityOrigin = new Common.ParsedURL(url).securityOrigin();
    this._reportView.setSubtitle(this._securityOrigin);
    this.doUpdate();
  }

  _clear() {
    if (!this._securityOrigin)
      return;
    const storageTypes = [];
    for (const type of this._settings.keys()) {
      if (this._settings.get(type).get())
        storageTypes.push(type);
    }

    this._target.storageAgent().clearDataForOrigin(this._securityOrigin, storageTypes.join(','));

    const set = new Set(storageTypes);
    const hasAll = set.has(Protocol.Storage.StorageType.All);
    if (set.has(Protocol.Storage.StorageType.Cookies) || hasAll) {
      const cookieModel = this._target.model(SDK.CookieModel);
      if (cookieModel)
        cookieModel.clear();
    }

    if (set.has(Protocol.Storage.StorageType.Indexeddb) || hasAll) {
      for (const target of SDK.targetManager.targets()) {
        const indexedDBModel = target.model(Resources.IndexedDBModel);
        if (indexedDBModel)
          indexedDBModel.clearForOrigin(this._securityOrigin);
      }
    }

    if (set.has(Protocol.Storage.StorageType.Local_storage) || hasAll) {
      const storageModel = this._target.model(Resources.DOMStorageModel);
      if (storageModel)
        storageModel.clearForOrigin(this._securityOrigin);
    }

    if (set.has(Protocol.Storage.StorageType.Websql) || hasAll) {
      const databaseModel = this._target.model(Resources.DatabaseModel);
      if (databaseModel) {
        databaseModel.disable();
        databaseModel.enable();
      }
    }

    if (set.has(Protocol.Storage.StorageType.Cache_storage) || hasAll) {
      const target = SDK.targetManager.mainTarget();
      const model = target && target.model(SDK.ServiceWorkerCacheModel);
      if (model)
        model.clearForOrigin(this._securityOrigin);
    }

    if (set.has(Protocol.Storage.StorageType.Appcache) || hasAll) {
      const appcacheModel = this._target.model(Resources.ApplicationCacheModel);
      if (appcacheModel)
        appcacheModel.reset();
    }

    this._clearButton.disabled = true;
    const label = this._clearButton.textContent;
    this._clearButton.textContent = Common.UIString('Clearing...');
    setTimeout(() => {
      this._clearButton.disabled = false;
      this._clearButton.textContent = label;
    }, 500);
  }

  /**
   * @override
   * @return {!Promise<?>}
   */
  async doUpdate() {
    if (!this._securityOrigin)
      return;

    const securityOrigin = /** @type {string} */ (this._securityOrigin);
    const response = await this._target.storageAgent().invoke_getUsageAndQuota({origin: securityOrigin});
    if (response[Protocol.Error]) {
      this._quotaRow.textContent = '';
      this._resetPieChart(0);
      return;
    }
    this._quotaRow.textContent = Common.UIString(
        '%s used out of %s storage quota', Number.bytesToString(response.usage), Number.bytesToString(response.quota));

    if (!this._quotaUsage || this._quotaUsage !== response.usage) {
      this._quotaUsage = response.usage;
      this._resetPieChart(response.usage);
      for (const usageForType of response.usageBreakdown.sort((a, b) => b.usage - a.usage)) {
        const value = usageForType.usage;
        if (!value)
          continue;
        const title = this._getStorageTypeName(usageForType.storageType);
        const color = this._pieColors.get(usageForType.storageType) || '#ccc';
        this._pieChart.addSlice(value, color);
        const rowElement = this._pieChartLegend.createChild('div', 'usage-breakdown-legend-row');
        rowElement.createChild('span', 'usage-breakdown-legend-value').textContent = Number.bytesToString(value);
        rowElement.createChild('span', 'usage-breakdown-legend-swatch').style.backgroundColor = color;
        rowElement.createChild('span', 'usage-breakdown-legend-title').textContent = title;
      }
    }

    this._usageUpdatedForTest(response.usage, response.quota, response.usageBreakdown);
    this.update();
  }

  /**
   * @param {number} total
   */
  _resetPieChart(total) {
    this._pieChart.setTotal(total);
    this._pieChartLegend.removeChildren();
  }

  /**
   * @param {string} type
   * @return {string}
   */
  _getStorageTypeName(type) {
    switch (type) {
      case Protocol.Storage.StorageType.File_systems:
        return Common.UIString('File System');
      case Protocol.Storage.StorageType.Websql:
        return Common.UIString('Web SQL');
      case Protocol.Storage.StorageType.Appcache:
        return Common.UIString('Application Cache');
      case Protocol.Storage.StorageType.Indexeddb:
        return Common.UIString('IndexedDB');
      case Protocol.Storage.StorageType.Cache_storage:
        return Common.UIString('Cache Storage');
      case Protocol.Storage.StorageType.Service_workers:
        return Common.UIString('Service Workers');
      default:
        return Common.UIString('Other');
    }
  }

  /**
   * @param {number} usage
   * @param {number} quota
   * @param {!Array<!Protocol.Storage.UsageForType>} usageBreakdown
   */
  _usageUpdatedForTest(usage, quota, usageBreakdown) {
  }
};
