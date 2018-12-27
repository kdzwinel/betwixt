// Copyright 2015 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
/**
 * @template T
 */
UI.ListWidget = class extends UI.VBox {
  /**
   * @param {!UI.ListWidget.Delegate<T>} delegate
   */
  constructor(delegate) {
    super(true);
    this.registerRequiredCSS('ui/listWidget.css');
    this._delegate = delegate;

    this._list = this.contentElement.createChild('div', 'list');
    this.element.tabIndex = -1;

    this._lastSeparator = false;
    /** @type {?UI.ElementFocusRestorer} */
    this._focusRestorer = null;
    /** @type {!Array<T>} */
    this._items = [];
    /** @type {!Array<boolean>} */
    this._editable = [];
    /** @type {!Array<!Element>} */
    this._elements = [];
    /** @type {?UI.ListWidget.Editor<T>} */
    this._editor = null;
    /** @type {?T} */
    this._editItem = null;
    /** @type {?Element} */
    this._editElement = null;

    /** @type {?Element} */
    this._emptyPlaceholder = null;

    this._updatePlaceholder();
  }

  clear() {
    this._items = [];
    this._editable = [];
    this._elements = [];
    this._lastSeparator = false;
    this._list.removeChildren();
    this._updatePlaceholder();
    this._stopEditing();
  }

  /**
   * @param {!T} item
   * @param {boolean} editable
   */
  appendItem(item, editable) {
    if (this._lastSeparator && this._items.length)
      this._list.appendChild(createElementWithClass('div', 'list-separator'));
    this._lastSeparator = false;

    this._items.push(item);
    this._editable.push(editable);

    const element = this._list.createChild('div', 'list-item');
    element.appendChild(this._delegate.renderItem(item, editable));
    if (editable) {
      element.classList.add('editable');
      element.appendChild(this._createControls(item, element));
    }
    this._elements.push(element);
    this._updatePlaceholder();
  }

  appendSeparator() {
    this._lastSeparator = true;
  }

  /**
   * @param {number} index
   */
  removeItem(index) {
    if (this._editItem === this._items[index])
      this._stopEditing();

    const element = this._elements[index];

    const previous = element.previousElementSibling;
    const previousIsSeparator = previous && previous.classList.contains('list-separator');

    const next = element.nextElementSibling;
    const nextIsSeparator = next && next.classList.contains('list-separator');

    if (previousIsSeparator && (nextIsSeparator || !next))
      previous.remove();
    if (nextIsSeparator && !previous)
      next.remove();
    element.remove();

    this._elements.splice(index, 1);
    this._items.splice(index, 1);
    this._editable.splice(index, 1);
    this._updatePlaceholder();
  }

  /**
   * @param {number} index
   * @param {!T} item
   */
  addNewItem(index, item) {
    this._startEditing(item, null, this._elements[index] || null);
  }

  /**
   * @param {?Element} element
   */
  setEmptyPlaceholder(element) {
    this._emptyPlaceholder = element;
    this._updatePlaceholder();
  }

  /**
   * @param {!T} item
   * @param {!Element} element
   * @return {!Element}
   */
  _createControls(item, element) {
    const controls = createElementWithClass('div', 'controls-container fill');
    controls.createChild('div', 'controls-gradient');

    const buttons = controls.createChild('div', 'controls-buttons');

    const toolbar = new UI.Toolbar('', buttons);

    const editButton = new UI.ToolbarButton(Common.UIString('Edit'), 'largeicon-edit');
    editButton.addEventListener(UI.ToolbarButton.Events.Click, onEditClicked.bind(this));
    toolbar.appendToolbarItem(editButton);

    const removeButton = new UI.ToolbarButton(Common.UIString('Remove'), 'largeicon-trash-bin');
    removeButton.addEventListener(UI.ToolbarButton.Events.Click, onRemoveClicked.bind(this));
    toolbar.appendToolbarItem(removeButton);

    return controls;

    /**
     * @this {UI.ListWidget}
     */
    function onEditClicked() {
      const index = this._elements.indexOf(element);
      const insertionPoint = this._elements[index + 1] || null;
      this._startEditing(item, element, insertionPoint);
    }

    /**
     * @this {UI.ListWidget}
     */
    function onRemoveClicked() {
      const index = this._elements.indexOf(element);
      this.element.focus();
      this._delegate.removeItemRequested(this._items[index], index);
    }
  }

  /**
   * @override
   */
  wasShown() {
    super.wasShown();
    this._stopEditing();
  }

  _updatePlaceholder() {
    if (!this._emptyPlaceholder)
      return;

    if (!this._elements.length && !this._editor)
      this._list.appendChild(this._emptyPlaceholder);
    else
      this._emptyPlaceholder.remove();
  }

  /**
   * @param {!T} item
   * @param {?Element} element
   * @param {?Element} insertionPoint
   */
  _startEditing(item, element, insertionPoint) {
    if (element && this._editElement === element)
      return;

    this._stopEditing();
    this._focusRestorer = new UI.ElementFocusRestorer(this.element);

    this._list.classList.add('list-editing');
    this._editItem = item;
    this._editElement = element;
    if (element)
      element.classList.add('hidden');

    const index = element ? this._elements.indexOf(element) : -1;
    this._editor = this._delegate.beginEdit(item);
    this._updatePlaceholder();
    this._list.insertBefore(this._editor.element, insertionPoint);
    this._editor.beginEdit(
        item, index, element ? Common.UIString('Save') : Common.UIString('Add'), this._commitEditing.bind(this),
        this._stopEditing.bind(this));
  }

  _commitEditing() {
    const editItem = this._editItem;
    const isNew = !this._editElement;
    const editor = /** @type {!UI.ListWidget.Editor<T>} */ (this._editor);
    this._stopEditing();
    this._delegate.commitEdit(editItem, editor, isNew);
  }

  _stopEditing() {
    this._list.classList.remove('list-editing');
    if (this._focusRestorer)
      this._focusRestorer.restore();
    if (this._editElement)
      this._editElement.classList.remove('hidden');
    if (this._editor && this._editor.element.parentElement)
      this._editor.element.remove();

    this._editor = null;
    this._editItem = null;
    this._editElement = null;
    this._updatePlaceholder();
  }
};

/**
 * @template T
 * @interface
 */
UI.ListWidget.Delegate = function() {};

UI.ListWidget.Delegate.prototype = {
  /**
   * @param {!T} item
   * @param {boolean} editable
   * @return {!Element}
   */
  renderItem(item, editable) {},

  /**
   * @param {!T} item
   * @param {number} index
   */
  removeItemRequested(item, index) {},

  /**
   * @param {!T} item
   * @return {!UI.ListWidget.Editor<T>}
   */
  beginEdit(item) {},

  /**
   * @param {!T} item
   * @param {!UI.ListWidget.Editor<T>} editor
   * @param {boolean} isNew
   */
  commitEdit(item, editor, isNew) {}
};

/**
 * @template T
 */
UI.ListWidget.Editor = class {
  constructor() {
    this.element = createElementWithClass('div', 'editor-container');
    this.element.addEventListener('keydown', onKeyDown.bind(null, isEscKey, this._cancelClicked.bind(this)), false);
    this.element.addEventListener('keydown', onKeyDown.bind(null, isEnterKey, this._commitClicked.bind(this)), false);

    this._contentElement = this.element.createChild('div', 'editor-content');

    const buttonsRow = this.element.createChild('div', 'editor-buttons');
    this._commitButton = UI.createTextButton('', this._commitClicked.bind(this), '', true /* primary */);
    buttonsRow.appendChild(this._commitButton);
    this._cancelButton = UI.createTextButton(Common.UIString('Cancel'), this._cancelClicked.bind(this));
    this._cancelButton.addEventListener(
        'keydown', onKeyDown.bind(null, isEnterKey, this._cancelClicked.bind(this)), false);
    buttonsRow.appendChild(this._cancelButton);

    /**
     * @param {function(!Event):boolean} predicate
     * @param {function()} callback
     * @param {!Event} event
     */
    function onKeyDown(predicate, callback, event) {
      if (predicate(event)) {
        event.consume(true);
        callback();
      }
    }

    /** @type {!Array<!HTMLInputElement|!HTMLSelectElement>} */
    this._controls = [];
    /** @type {!Map<string, !HTMLInputElement|!HTMLSelectElement>} */
    this._controlByName = new Map();
    /** @type {!Array<function(!T, number, (!HTMLInputElement|!HTMLSelectElement)):boolean>} */
    this._validators = [];

    /** @type {?function()} */
    this._commit = null;
    /** @type {?function()} */
    this._cancel = null;
    /** @type {?T} */
    this._item = null;
    /** @type {number} */
    this._index = -1;
  }

  /**
   * @return {!Element}
   */
  contentElement() {
    return this._contentElement;
  }

  /**
   * @param {string} name
   * @param {string} type
   * @param {string} title
   * @param {function(!T, number, (!HTMLInputElement|!HTMLSelectElement)):boolean} validator
   * @return {!HTMLInputElement}
   */
  createInput(name, type, title, validator) {
    const input = /** @type {!HTMLInputElement} */ (UI.createInput('', type));
    input.placeholder = title;
    input.addEventListener('input', this._validateControls.bind(this, false), false);
    input.addEventListener('blur', this._validateControls.bind(this, false), false);
    this._controlByName.set(name, input);
    this._controls.push(input);
    this._validators.push(validator);
    return input;
  }

  /**
   * @param {string} name
   * @param {!Array<string>} options
   * @param {function(!T, number, (!HTMLInputElement|!HTMLSelectElement)):boolean} validator
   * @return {!HTMLSelectElement}
   */
  createSelect(name, options, validator) {
    const select = /** @type {!HTMLSelectElement} */ (createElementWithClass('select', 'chrome-select'));
    for (let index = 0; index < options.length; ++index) {
      const option = select.createChild('option');
      option.value = options[index];
      option.textContent = options[index];
    }
    select.addEventListener('input', this._validateControls.bind(this, false), false);
    select.addEventListener('blur', this._validateControls.bind(this, false), false);
    this._controlByName.set(name, select);
    this._controls.push(select);
    this._validators.push(validator);
    return select;
  }

  /**
   * @param {string} name
   * @return {!HTMLInputElement|!HTMLSelectElement}
   */
  control(name) {
    return /** @type {!HTMLInputElement|!HTMLSelectElement} */ (this._controlByName.get(name));
  }

  /**
   * @param {boolean} forceValid
   */
  _validateControls(forceValid) {
    let allValid = true;
    for (let index = 0; index < this._controls.length; ++index) {
      const input = this._controls[index];
      const valid = this._validators[index].call(null, this._item, this._index, input);
      input.classList.toggle('error-input', !valid && !forceValid);
      allValid &= valid;
    }
    this._commitButton.disabled = !allValid;
  }

  /**
   * @param {!T} item
   * @param {number} index
   * @param {string} commitButtonTitle
   * @param {function()} commit
   * @param {function()} cancel
   */
  beginEdit(item, index, commitButtonTitle, commit, cancel) {
    this._commit = commit;
    this._cancel = cancel;
    this._item = item;
    this._index = index;

    this._commitButton.textContent = commitButtonTitle;
    this.element.scrollIntoViewIfNeeded(false);
    if (this._controls.length)
      this._controls[0].focus();
    this._validateControls(true);
  }

  _commitClicked() {
    if (this._commitButton.disabled)
      return;

    const commit = this._commit;
    this._commit = null;
    this._cancel = null;
    this._item = null;
    this._index = -1;
    commit();
  }

  _cancelClicked() {
    const cancel = this._cancel;
    this._commit = null;
    this._cancel = null;
    this._item = null;
    this._index = -1;
    cancel();
  }
};
