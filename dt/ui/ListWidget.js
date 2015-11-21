// Copyright 2015 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * @constructor
 * @extends {WebInspector.VBox}
 * @param {!WebInspector.ListWidget.Delegate} delegate
 */
WebInspector.ListWidget = function(delegate)
{
    WebInspector.VBox.call(this, true);
    this.registerRequiredCSS("ui/listWidget.css");
    this._delegate = delegate;

    this._list = this.contentElement.createChild("div", "list");

    /** @type {?WebInspector.ListWidget.Editor} */
    this._editor = null;
    /** @type {*|null} */
    this._editItem = null;
    /** @type {?Element} */
    this._editElement = null;

    /** @type {?Element} */
    this._emptyPlaceholder = null;

    this.clear();
}

/**
 * @interface
 */
WebInspector.ListWidget.Delegate = function()
{
}

WebInspector.ListWidget.Delegate.prototype = {
    /**
     * @param {*} item
     * @param {boolean} editable
     * @return {!Element}
     */
    renderItem: function(item, editable) { },

    /**
     * @param {*} item
     * @param {number} index
     */
    removeItemRequested: function(item, index) { },

    /**
     * @param {*} item
     * @return {!WebInspector.ListWidget.Editor}
     */
    beginEdit: function(item) { },

    /**
     * @param {*} item
     * @param {!WebInspector.ListWidget.Editor} editor
     * @param {boolean} isNew
     */
    commitEdit: function(item, editor, isNew) { }
}

WebInspector.ListWidget.prototype = {
    clear: function()
    {
        this._items = [];
        this._editable = [];
        this._elements = [];
        this._lastSeparator = false;
        this._list.removeChildren();
        this._updatePlaceholder();
        this._stopEditing();
    },

    /**
     * @param {*} item
     * @param {boolean} editable
     */
    appendItem: function(item, editable)
    {
        if (this._lastSeparator && this._items.length)
            this._list.appendChild(createElementWithClass("div", "list-separator"));
        this._lastSeparator = false;

        this._items.push(item);
        this._editable.push(editable);

        var element = this._list.createChild("div", "list-item");
        element.appendChild(this._delegate.renderItem(item, editable));
        if (editable) {
            element.classList.add("editable");
            element.appendChild(this._createControls(item, element));
        }
        this._elements.push(element);
        this._updatePlaceholder();
    },

    appendSeparator: function()
    {
        this._lastSeparator = true;
    },

    /**
     * @param {number} index
     */
    removeItem: function(index)
    {
        if (this._editItem === this._items[index])
            this._stopEditing();

        var element = this._elements[index];

        var previous = element.previousElementSibling;
        var previousIsSeparator = previous && previous.classList.contains("list-separator");

        var next = element.nextElementSibling;
        var nextIsSeparator = next && next.classList.contains("list-separator");

        if (previousIsSeparator && (nextIsSeparator || !next))
            previous.remove();
        if (nextIsSeparator && !previous)
            next.remove();
        element.remove();

        this._elements.splice(index, 1);
        this._items.splice(index, 1);
        this._editable.splice(index, 1);
        this._updatePlaceholder();
    },

    /**
     * @param {number} index
     * @param {*} item
     */
    addNewItem: function(index, item)
    {
        this._startEditing(item, null, this._elements[index] || null);
    },

    /**
     * @param {?Element} element
     */
    setEmptyPlaceholder: function(element)
    {
        this._emptyPlaceholder = element;
        this._updatePlaceholder();
    },

    /**
     * @param {*} item
     * @param {!Element} element
     * @return {!Element}
     */
    _createControls: function(item, element)
    {
        var controls = createElementWithClass("div", "controls-container fill");
        var gradient = controls.createChild("div", "controls-gradient");
        var buttons = controls.createChild("div", "controls-buttons");

        var editButton = buttons.createChild("div", "edit-button");
        editButton.title = WebInspector.UIString("Edit");
        editButton.addEventListener("click", onEditClicked.bind(this), false);

        var removeButton = buttons.createChild("div", "remove-button");
        removeButton.title = WebInspector.UIString("Remove");
        removeButton.addEventListener("click", onRemoveClicked.bind(this), false);

        return controls;

        /**
         * @param {!Event} event
         * @this {WebInspector.ListWidget}
         */
        function onEditClicked(event)
        {
            event.consume();
            var insertionPoint = element && element.nextElementSibling ? element.nextElementSibling : null;
            this._startEditing(item, element, insertionPoint);
        }

        /**
         * @param {!Event} event
         * @this {WebInspector.ListWidget}
         */
        function onRemoveClicked(event)
        {
            event.consume();
            var index = this._elements.indexOf(element);
            this._delegate.removeItemRequested(this._items[index], index);
        }
    },

    wasShown: function()
    {
        WebInspector.VBox.prototype.wasShown.call(this);
        this._stopEditing();
    },

    _updatePlaceholder: function()
    {
        if (!this._emptyPlaceholder)
            return;

        if (!this._elements.length && !this._editor)
            this._list.appendChild(this._emptyPlaceholder);
        else
            this._emptyPlaceholder.remove();
    },

    /**
     * @param {*} item
     * @param {?Element} element
     * @param {?Element} insertionPoint
     */
    _startEditing: function(item, element, insertionPoint)
    {
        if (element && this._editElement === element)
            return;

        this._stopEditing();

        this._list.classList.add("list-editing");
        this._editItem = item;
        this._editElement = element;
        if (element)
            element.classList.add("hidden");

        this._editor = this._delegate.beginEdit(item);
        this._updatePlaceholder();
        this._list.insertBefore(this._editor.element, insertionPoint);
        this._editor.beginEdit(element ? WebInspector.UIString("Save") : WebInspector.UIString("Add"), this._commitEditing.bind(this), this._stopEditing.bind(this));
    },

    _commitEditing: function()
    {
        var editItem = this._editItem;
        var isNew = !this._editElement;
        var editor = /** @type {!WebInspector.ListWidget.Editor} */ (this._editor);
        this._stopEditing();
        this._delegate.commitEdit(editItem, editor, isNew);
    },

    _stopEditing: function()
    {
        this._list.classList.remove("list-editing");
        if (this._editElement)
            this._editElement.classList.remove("hidden");
        if (this._editor && this._editor.element.parentElement)
            this._editor.element.remove();

        this._editor = null;
        this._editItem = null;
        this._editElement = null;
        this._updatePlaceholder();
    },

    __proto__: WebInspector.VBox.prototype
}

/**
 * @constructor
 */
WebInspector.ListWidget.Editor = function()
{
    this.element = createElementWithClass("div", "editor-container");
    this.element.addEventListener("keydown", onKeyDown.bind(null, isEscKey, this._cancelClicked.bind(this)), false);
    this.element.addEventListener("keydown", onKeyDown.bind(null, isEnterKey, this._commitClicked.bind(this)), false);

    this._contentElement = this.element.createChild("div", "editor-content");

    var buttonsRow = this.element.createChild("div", "editor-buttons");
    this._commitButton = createTextButton("", this._commitClicked.bind(this));
    buttonsRow.appendChild(this._commitButton);
    this._cancelButton = createTextButton(WebInspector.UIString("Cancel"), this._cancelClicked.bind(this));
    this._cancelButton.addEventListener("keydown", onKeyDown.bind(null, isEnterKey, this._cancelClicked.bind(this)), false);
    buttonsRow.appendChild(this._cancelButton);

    /**
     * @param {function(!Event):boolean} predicate
     * @param {function()} callback
     * @param {!Event} event
     */
    function onKeyDown(predicate, callback, event)
    {
        if (predicate(event)) {
            event.consume(true);
            callback();
        }
    }

    /** @type {!Array<!HTMLInputElement|!HTMLSelectElement>} */
    this._controls = [];
    /** @type {!Map<string, !HTMLInputElement|!HTMLSelectElement>} */
    this._controlByName = new Map();
    /** @type {!Array<function((!HTMLInputElement|!HTMLSelectElement)):boolean>} */
    this._validators = [];

    /** @type {?function()} */
    this._commit = null;
    /** @type {?function()} */
    this._cancel = null;
}

WebInspector.ListWidget.Editor.prototype = {
    /**
     * @return {!Element}
     */
    contentElement: function()
    {
        return this._contentElement;
    },

    /**
     * @param {string} name
     * @param {string} type
     * @param {string} title
     * @param {function((!HTMLInputElement|!HTMLSelectElement)):boolean} validator
     * @return {!HTMLInputElement}
     */
    createInput: function(name, type, title, validator)
    {
        var input = /** @type {!HTMLInputElement} */ (createElement("input"));
        input.type = type;
        input.placeholder = title;
        input.addEventListener("input", this._validateControls.bind(this, false), false);
        input.addEventListener("blur", this._validateControls.bind(this, false), false);
        this._controlByName.set(name, input);
        this._controls.push(input);
        this._validators.push(validator);
        return input;
    },

    /**
     * @param {string} name
     * @param {!Array<string>} options
     * @param {function((!HTMLInputElement|!HTMLSelectElement)):boolean} validator
     * @return {!HTMLSelectElement}
     */
    createSelect: function(name, options, validator)
    {
        var select = /** @type {!HTMLSelectElement} */ (createElementWithClass("select", "chrome-select"));
        for (var index = 0; index < options.length; ++index) {
            var option = select.createChild("option");
            option.value = options[index];
            option.textContent = options[index];
        }
        select.addEventListener("input", this._validateControls.bind(this, false), false);
        select.addEventListener("blur", this._validateControls.bind(this, false), false);
        this._controlByName.set(name, select);
        this._controls.push(select);
        this._validators.push(validator);
        return select;
    },

    /**
     * @param {string} name
     * @return {!HTMLInputElement|!HTMLSelectElement}
     */
    control: function(name)
    {
        return /** @type {!HTMLInputElement|!HTMLSelectElement} */ (this._controlByName.get(name));
    },

    /**
     * @param {boolean} forceValid
     */
    _validateControls: function(forceValid)
    {
        var allValid = true;
        for (var index = 0; index < this._controls.length; ++index) {
            var input = this._controls[index];
            var valid = this._validators[index].call(null, input);
            input.classList.toggle("error-input", !valid && !forceValid);
            allValid &= valid;
        }
        this._commitButton.disabled = !allValid;
    },

    /**
     * @param {string} commitButtonTitle
     * @param {function()} commit
     * @param {function()} cancel
     */
    beginEdit: function(commitButtonTitle, commit, cancel)
    {
        this._commit = commit;
        this._cancel = cancel;

        this._commitButton.textContent = commitButtonTitle;
        this.element.scrollIntoView();
        if (this._controls.length)
            this._controls[0].focus();
        this._validateControls(true);
    },

    _commitClicked: function()
    {
        if (this._commitButton.disabled)
            return;

        var commit = this._commit;
        this._commit = null;
        this._cancel = null;
        commit();
    },

    _cancelClicked: function()
    {
        var cancel = this._cancel;
        this._commit = null;
        this._cancel = null;
        cancel();
    }
}
