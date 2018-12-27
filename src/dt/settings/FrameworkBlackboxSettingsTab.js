/*
 * Copyright 2014 The Chromium Authors. All rights reserved.
 * Use of this source code is governed by a BSD-style license that can be
 * found in the LICENSE file.
 */
/**
 * @implements {UI.ListWidget.Delegate}
 * @unrestricted
 */
Settings.FrameworkBlackboxSettingsTab = class extends UI.VBox {
  constructor() {
    super(true);
    this.registerRequiredCSS('settings/frameworkBlackboxSettingsTab.css');

    this.contentElement.createChild('div', 'header').textContent = Common.UIString('Framework Blackbox Patterns');
    this.contentElement.createChild('div', 'blackbox-content-scripts')
        .appendChild(UI.SettingsUI.createSettingCheckbox(
            Common.UIString('Blackbox content scripts'), Common.moduleSetting('skipContentScripts'), true));

    this._blackboxLabel = Common.UIString('Blackbox');
    this._disabledLabel = Common.UIString('Disabled');

    this._list = new UI.ListWidget(this);
    this._list.element.classList.add('blackbox-list');
    this._list.registerRequiredCSS('settings/frameworkBlackboxSettingsTab.css');

    const placeholder = createElementWithClass('div', 'blackbox-list-empty');
    placeholder.textContent = Common.UIString('No blackboxed patterns');
    this._list.setEmptyPlaceholder(placeholder);
    this._list.show(this.contentElement);
    const addPatternButton =
        UI.createTextButton(Common.UIString('Add pattern...'), this._addButtonClicked.bind(this), 'add-button');
    this.contentElement.appendChild(addPatternButton);

    this._setting = Common.moduleSetting('skipStackFramesPattern');
    this._setting.addChangeListener(this._settingUpdated, this);

    this.setDefaultFocusedElement(addPatternButton);
    this.contentElement.tabIndex = 0;
  }

  /**
   * @override
   */
  wasShown() {
    super.wasShown();
    this._settingUpdated();
  }

  _settingUpdated() {
    this._list.clear();
    const patterns = this._setting.getAsArray();
    for (let i = 0; i < patterns.length; ++i)
      this._list.appendItem(patterns[i], true);
  }

  _addButtonClicked() {
    this._list.addNewItem(this._setting.getAsArray().length, {pattern: '', disabled: false});
  }

  /**
   * @override
   * @param {*} item
   * @param {boolean} editable
   * @return {!Element}
   */
  renderItem(item, editable) {
    const element = createElementWithClass('div', 'blackbox-list-item');
    const pattern = element.createChild('div', 'blackbox-pattern');
    pattern.textContent = item.pattern;
    pattern.title = item.pattern;
    element.createChild('div', 'blackbox-separator');
    element.createChild('div', 'blackbox-behavior').textContent =
        item.disabled ? this._disabledLabel : this._blackboxLabel;
    if (item.disabled)
      element.classList.add('blackbox-disabled');
    return element;
  }

  /**
   * @override
   * @param {*} item
   * @param {number} index
   */
  removeItemRequested(item, index) {
    const patterns = this._setting.getAsArray();
    patterns.splice(index, 1);
    this._setting.setAsArray(patterns);
  }

  /**
   * @override
   * @param {*} item
   * @param {!UI.ListWidget.Editor} editor
   * @param {boolean} isNew
   */
  commitEdit(item, editor, isNew) {
    item.pattern = editor.control('pattern').value.trim();
    item.disabled = editor.control('behavior').value === this._disabledLabel;

    const list = this._setting.getAsArray();
    if (isNew)
      list.push(item);
    this._setting.setAsArray(list);
  }

  /**
   * @override
   * @param {*} item
   * @return {!UI.ListWidget.Editor}
   */
  beginEdit(item) {
    const editor = this._createEditor();
    editor.control('pattern').value = item.pattern;
    editor.control('behavior').value = item.disabled ? this._disabledLabel : this._blackboxLabel;
    return editor;
  }

  /**
   * @return {!UI.ListWidget.Editor}
   */
  _createEditor() {
    if (this._editor)
      return this._editor;

    const editor = new UI.ListWidget.Editor();
    this._editor = editor;
    const content = editor.contentElement();

    const titles = content.createChild('div', 'blackbox-edit-row');
    titles.createChild('div', 'blackbox-pattern').textContent = Common.UIString('Pattern');
    titles.createChild('div', 'blackbox-separator blackbox-separator-invisible');
    titles.createChild('div', 'blackbox-behavior').textContent = Common.UIString('Behavior');

    const fields = content.createChild('div', 'blackbox-edit-row');
    fields.createChild('div', 'blackbox-pattern')
        .appendChild(editor.createInput('pattern', 'text', '/framework\\.js$', patternValidator.bind(this)));
    fields.createChild('div', 'blackbox-separator blackbox-separator-invisible');
    fields.createChild('div', 'blackbox-behavior')
        .appendChild(editor.createSelect('behavior', [this._blackboxLabel, this._disabledLabel], behaviorValidator));

    return editor;

    /**
     * @param {*} item
     * @param {number} index
     * @param {!HTMLInputElement|!HTMLSelectElement} input
     * @this {Settings.FrameworkBlackboxSettingsTab}
     * @return {boolean}
     */
    function patternValidator(item, index, input) {
      const pattern = input.value.trim();
      const patterns = this._setting.getAsArray();
      for (let i = 0; i < patterns.length; ++i) {
        if (i !== index && patterns[i].pattern === pattern)
          return false;
      }

      let regex;
      try {
        regex = new RegExp(pattern);
      } catch (e) {
      }
      return !!(pattern && regex);
    }

    /**
     * @param {*} item
     * @param {number} index
     * @param {!HTMLInputElement|!HTMLSelectElement} input
     * @return {boolean}
     */
    function behaviorValidator(item, index, input) {
      return true;
    }
  }
};
