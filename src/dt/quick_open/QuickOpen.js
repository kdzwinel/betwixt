// Copyright 2016 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

QuickOpen.QuickOpen = class {
  constructor() {
    this._prefix = null;
    this._query = '';
    /** @type {!Map<string, function():!Promise<!QuickOpen.FilteredListWidget.Provider>>} */
    this._providers = new Map();
    /** @type {!Array<string>} */
    this._prefixes = [];
    this._filteredListWidget = null;
    self.runtime.extensions(QuickOpen.FilteredListWidget.Provider).forEach(this._addProvider.bind(this));
    this._prefixes.sort((a, b) => b.length - a.length);
  }

  /**
   * @param {string} query
   */
  static show(query) {
    const quickOpen = new this();
    const filteredListWidget =
        new QuickOpen.FilteredListWidget(null, this._history, quickOpen._queryChanged.bind(quickOpen));
    quickOpen._filteredListWidget = filteredListWidget;
    filteredListWidget.setPlaceholder(Common.UIString('Type \'?\' to see available commands'));
    filteredListWidget.showAsDialog();
    filteredListWidget.setQuery(query);
  }

  /**
   * @param {!Runtime.Extension} extension
   */
  _addProvider(extension) {
    const prefix = extension.descriptor()['prefix'];
    this._prefixes.push(prefix);
    this._providers.set(
        prefix, /** @type {function():!Promise<!QuickOpen.FilteredListWidget.Provider>} */
        (extension.instance.bind(extension)));
  }

  /**
   * @param {string} query
   */
  _queryChanged(query) {
    const prefix = this._prefixes.find(prefix => query.startsWith(prefix));
    if (typeof prefix !== 'string' || this._prefix === prefix)
      return;

    this._prefix = prefix;
    this._filteredListWidget.setPrefix(prefix);
    this._filteredListWidget.setProvider(null);
    this._providers.get(prefix)().then(provider => {
      if (this._prefix !== prefix)
        return;
      this._filteredListWidget.setProvider(provider);
      this._providerLoadedForTest(provider);
    });
  }

  /**
   * @param {!QuickOpen.FilteredListWidget.Provider} provider
   */
  _providerLoadedForTest(provider) {
  }
};

QuickOpen.QuickOpen._history = [];

/**
 * @implements {UI.ActionDelegate}
 */
QuickOpen.QuickOpen.ShowActionDelegate = class {
  /**
   * @override
   * @param {!UI.Context} context
   * @param {string} actionId
   * @return {boolean}
   */
  handleAction(context, actionId) {
    switch (actionId) {
      case 'quickOpen.show':
        QuickOpen.QuickOpen.show('');
        return true;
    }
    return false;
  }
};
