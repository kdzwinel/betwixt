// Copyright 2016 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
/**
 * @unrestricted
 */
QuickOpen.CommandMenu = class {
  constructor() {
    this._commands = [];
    this._loadCommands();
  }

  /**
   * @param {string} category
   * @param {string} keys
   * @param {string} title
   * @param {string} shortcut
   * @param {function()} executeHandler
   * @param {function()=} availableHandler
   * @return {!QuickOpen.CommandMenu.Command}
   */
  static createCommand(category, keys, title, shortcut, executeHandler, availableHandler) {
    // Separate keys by null character, to prevent fuzzy matching from matching across them.
    const key = keys.replace(/,/g, '\0');
    return new QuickOpen.CommandMenu.Command(category, title, key, shortcut, executeHandler, availableHandler);
  }

  /**
   * @param {!Runtime.Extension} extension
   * @param {string} title
   * @param {V} value
   * @return {!QuickOpen.CommandMenu.Command}
   * @template V
   */
  static createSettingCommand(extension, title, value) {
    const category = extension.descriptor()['category'] || '';
    const tags = extension.descriptor()['tags'] || '';
    const setting = Common.settings.moduleSetting(extension.descriptor()['settingName']);
    return QuickOpen.CommandMenu.createCommand(
        category, tags, title, '', setting.set.bind(setting, value), availableHandler);

    /**
     * @return {boolean}
     */
    function availableHandler() {
      return setting.get() !== value;
    }
  }

  /**
   * @param {!UI.Action} action
   * @return {!QuickOpen.CommandMenu.Command}
   */
  static createActionCommand(action) {
    const shortcut = UI.shortcutRegistry.shortcutTitleForAction(action.id()) || '';
    return QuickOpen.CommandMenu.createCommand(
        action.category(), action.tags(), action.title(), shortcut, action.execute.bind(action));
  }

  /**
   * @param {!Runtime.Extension} extension
   * @param {string} category
   * @return {!QuickOpen.CommandMenu.Command}
   */
  static createRevealViewCommand(extension, category) {
    const viewId = extension.descriptor()['id'];
    const executeHandler = UI.viewManager.showView.bind(UI.viewManager, viewId);
    const tags = extension.descriptor()['tags'] || '';
    return QuickOpen.CommandMenu.createCommand(
        category, tags, Common.UIString('Show %s', extension.title()), '', executeHandler);
  }

  _loadCommands() {
    const locations = new Map();
    self.runtime.extensions(UI.ViewLocationResolver).forEach(extension => {
      const category = extension.descriptor()['category'];
      const name = extension.descriptor()['name'];
      if (category && name)
        locations.set(name, category);
    });
    const viewExtensions = self.runtime.extensions('view');
    for (const extension of viewExtensions) {
      const category = locations.get(extension.descriptor()['location']);
      if (category)
        this._commands.push(QuickOpen.CommandMenu.createRevealViewCommand(extension, category));
    }

    // Populate whitelisted settings.
    const settingExtensions = self.runtime.extensions('setting');
    for (const extension of settingExtensions) {
      const options = extension.descriptor()['options'];
      if (!options || !extension.descriptor()['category'])
        continue;
      for (const pair of options)
        this._commands.push(QuickOpen.CommandMenu.createSettingCommand(extension, pair['title'], pair['value']));
    }
  }

  /**
   * @return {!Array.<!QuickOpen.CommandMenu.Command>}
   */
  commands() {
    return this._commands;
  }
};

QuickOpen.CommandMenuProvider = class extends QuickOpen.FilteredListWidget.Provider {
  constructor() {
    super();
    this._commands = [];
  }

  /**
   * @override
   */
  attach() {
    const allCommands = QuickOpen.commandMenu.commands();

    // Populate whitelisted actions.
    const actions = UI.actionRegistry.availableActions();
    for (const action of actions) {
      if (action.category())
        this._commands.push(QuickOpen.CommandMenu.createActionCommand(action));
    }

    for (const command of allCommands) {
      if (command.available())
        this._commands.push(command);
    }

    this._commands = this._commands.sort(commandComparator);

    /**
     * @param {!QuickOpen.CommandMenu.Command} left
     * @param {!QuickOpen.CommandMenu.Command} right
     * @return {number}
     */
    function commandComparator(left, right) {
      const cats = left.category().compareTo(right.category());
      return cats ? cats : left.title().compareTo(right.title());
    }
  }

  /**
   * @override
   */
  detach() {
    this._commands = [];
  }

  /**
   * @override
   * @return {number}
   */
  itemCount() {
    return this._commands.length;
  }

  /**
   * @override
   * @param {number} itemIndex
   * @return {string}
   */
  itemKeyAt(itemIndex) {
    return this._commands[itemIndex].key();
  }

  /**
   * @override
   * @param {number} itemIndex
   * @param {string} query
   * @return {number}
   */
  itemScoreAt(itemIndex, query) {
    const command = this._commands[itemIndex];
    const opcodes = Diff.Diff.charDiff(query.toLowerCase(), command.title().toLowerCase());
    let score = 0;
    // Score longer sequences higher.
    for (let i = 0; i < opcodes.length; ++i) {
      if (opcodes[i][0] === Diff.Diff.Operation.Equal)
        score += opcodes[i][1].length * opcodes[i][1].length;
    }

    // Score panel/drawer reveals above regular actions.
    if (command.category().startsWith('Panel'))
      score += 2;
    else if (command.category().startsWith('Drawer'))
      score += 1;

    return score;
  }

  /**
   * @override
   * @param {number} itemIndex
   * @param {string} query
   * @param {!Element} titleElement
   * @param {!Element} subtitleElement
   */
  renderItem(itemIndex, query, titleElement, subtitleElement) {
    const command = this._commands[itemIndex];
    titleElement.removeChildren();
    const tagElement = titleElement.createChild('span', 'tag');
    const index = String.hashCode(command.category()) % QuickOpen.CommandMenuProvider.MaterialPaletteColors.length;
    tagElement.style.backgroundColor = QuickOpen.CommandMenuProvider.MaterialPaletteColors[index];
    tagElement.textContent = command.category();
    titleElement.createTextChild(command.title());
    QuickOpen.FilteredListWidget.highlightRanges(titleElement, query, true);
    subtitleElement.textContent = command.shortcut();
  }

  /**
   * @override
   * @param {?number} itemIndex
   * @param {string} promptValue
   */
  selectItem(itemIndex, promptValue) {
    if (itemIndex === null)
      return;
    this._commands[itemIndex].execute();
    Host.userMetrics.actionTaken(Host.UserMetrics.Action.SelectCommandFromCommandMenu);
  }

  /**
   * @override
   * @return {string}
   */
  notFoundText() {
    return Common.UIString('No commands found');
  }
};

QuickOpen.CommandMenuProvider.MaterialPaletteColors = [
  '#F44336', '#E91E63', '#9C27B0', '#673AB7', '#3F51B5', '#03A9F4', '#00BCD4', '#009688', '#4CAF50', '#8BC34A',
  '#CDDC39', '#FFC107', '#FF9800', '#FF5722', '#795548', '#9E9E9E', '#607D8B'
];

/**
 * @unrestricted
 */
QuickOpen.CommandMenu.Command = class {
  /**
   * @param {string} category
   * @param {string} title
   * @param {string} key
   * @param {string} shortcut
   * @param {function()} executeHandler
   * @param {function()=} availableHandler
   */
  constructor(category, title, key, shortcut, executeHandler, availableHandler) {
    this._category = category;
    this._title = title;
    this._key = category + '\0' + title + '\0' + key;
    this._shortcut = shortcut;
    this._executeHandler = executeHandler;
    this._availableHandler = availableHandler;
  }

  /**
   * @return {string}
   */
  category() {
    return this._category;
  }

  /**
   * @return {string}
   */
  title() {
    return this._title;
  }

  /**
   * @return {string}
   */
  key() {
    return this._key;
  }

  /**
   * @return {string}
   */
  shortcut() {
    return this._shortcut;
  }

  /**
   * @return {boolean}
   */
  available() {
    return this._availableHandler ? this._availableHandler() : true;
  }

  execute() {
    this._executeHandler();
  }
};


/** @type {!QuickOpen.CommandMenu} */
QuickOpen.commandMenu = new QuickOpen.CommandMenu();

/**
 * @implements {UI.ActionDelegate}
 * @unrestricted
 */
QuickOpen.CommandMenu.ShowActionDelegate = class {
  /**
   * @override
   * @param {!UI.Context} context
   * @param {string} actionId
   * @return {boolean}
   */
  handleAction(context, actionId) {
    InspectorFrontendHost.bringToFront();
    QuickOpen.QuickOpen.show('>');
    return true;
  }
};
