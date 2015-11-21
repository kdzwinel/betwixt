/*
 * Copyright (C) 2012 Google Inc. All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are
 * met:
 *
 *     * Redistributions of source code must retain the above copyright
 * notice, this list of conditions and the following disclaimer.
 *     * Redistributions in binary form must reproduce the above
 * copyright notice, this list of conditions and the following disclaimer
 * in the documentation and/or other materials provided with the
 * distribution.
 *     * Neither the name of Google Inc. nor the names of its
 * contributors may be used to endorse or promote products derived from
 * this software without specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS
 * "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT
 * LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR
 * A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT
 * OWNER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL,
 * SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT
 * LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE,
 * DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY
 * THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
 * OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */

/**
 * @constructor
 * @extends {WebInspector.Widget}
 */
WebInspector.Dialog = function()
{
    WebInspector.Widget.call(this, true);
    this.markAsRoot();
    this.registerRequiredCSS("ui/dialog.css");

    this.contentElement.createChild("content");
    this.contentElement.tabIndex = 0;
    this.contentElement.addEventListener("focus", this._onFocus.bind(this), false);
    this.contentElement.addEventListener("keydown", this._onKeyDown.bind(this), false);

    this._wrapsContent = false;
    this._dimmed = false;
    /** @type {!Map<!HTMLElement, number>} */
    this._tabIndexMap = new Map();
}

/**
 * TODO(dgozman): remove this method (it's only used for shortcuts handling).
 * @return {boolean}
 */
WebInspector.Dialog.hasInstance = function()
{
    return !!WebInspector.Dialog._instance;
}

WebInspector.Dialog.prototype = {
    /**
     * @override
     */
    show: function()
    {
        if (WebInspector.Dialog._instance)
            WebInspector.Dialog._instance.detach();
        WebInspector.Dialog._instance = this;

        var document = /** @type {!Document} */ (WebInspector.Dialog._modalHostView.element.ownerDocument);
        this._disableTabIndexOnElements(document);

        this._glassPane = new WebInspector.GlassPane(document, this._dimmed);
        this._glassPane.element.addEventListener("click", this._onGlassPaneClick.bind(this), false);
        WebInspector.GlassPane.DefaultFocusedViewStack.push(this);

        WebInspector.Widget.prototype.show.call(this, this._glassPane.element);

        this._position();
        this.focus();
    },

    /**
     * @override
     */
    detach: function()
    {
        WebInspector.Widget.prototype.detach.call(this);

        WebInspector.GlassPane.DefaultFocusedViewStack.pop();
        this._glassPane.dispose();
        delete this._glassPane;

        this._restoreTabIndexOnElements();

        delete WebInspector.Dialog._instance;
    },

    addCloseButton: function()
    {
        var closeButton = this.contentElement.createChild("div", "dialog-close-button", "dt-close-button");
        closeButton.gray = true;
        closeButton.addEventListener("click", this.detach.bind(this, false), false);
    },

    /**
     * @param {!Size} size
     */
    setMaxSize: function(size)
    {
        this._maxSize = size;
    },

    /**
     * @param {boolean} wraps
     */
    setWrapsContent: function(wraps)
    {
        this.element.classList.toggle("wraps-content", wraps);
        this._wrapsContent = wraps;
    },

    /**
     * @param {boolean} dimmed
     */
    setDimmed: function(dimmed)
    {
        this._dimmed = dimmed;
    },

    contentResized: function()
    {
        if (this._wrapsContent)
            this._position();
    },

    /**
     * @param {!Document} document
     */
    _disableTabIndexOnElements: function(document)
    {
        this._tabIndexMap.clear();
        for (var node = document; node; node = node.traverseNextNode(document)) {
            if (node instanceof HTMLElement) {
                var element = /** @type {!HTMLElement} */  (node);
                var tabIndex = element.tabIndex;
                if (tabIndex >= 0) {
                    this._tabIndexMap.set(element, tabIndex);
                    element.tabIndex = -1;
                }
            }
        }
    },

    _restoreTabIndexOnElements: function()
    {
        for (var element of this._tabIndexMap.keys())
            element.tabIndex = this._tabIndexMap.get(element);
        this._tabIndexMap.clear();
    },

    /**
     * @param {!Event} event
     */
    _onFocus: function(event)
    {
        this.focus();
    },

    /**
     * @param {!Event} event
     */
    _onGlassPaneClick: function(event)
    {
        if (!this.element.isSelfOrAncestor(/** @type {?Node} */ (event.target)))
            this.detach();
    },

    _position: function()
    {
        var container = WebInspector.Dialog._modalHostView.element;

        var width = container.offsetWidth - 10;
        var height = container.offsetHeight- 10;

        if (this._wrapsContent) {
            width = Math.min(width, this.contentElement.offsetWidth);
            height = Math.min(height, this.contentElement.offsetHeight);
        }

        if (this._maxSize) {
            width = Math.min(width, this._maxSize.width);
            height = Math.min(height, this._maxSize.height);
        }

        var positionX = (container.offsetWidth - width) / 2;
        positionX = Number.constrain(positionX, 0, container.offsetWidth - width);

        var positionY = (container.offsetHeight - height) / 2;
        positionY = Number.constrain(positionY, 0, container.offsetHeight - height);

        this.element.style.width = width + "px";
        this.element.style.height = height + "px";
        this.element.positionAt(positionX, positionY, container);
    },

    /**
     * @param {!Event} event
     */
    _onKeyDown: function(event)
    {
        if (event.keyCode === WebInspector.KeyboardShortcut.Keys.Esc.code) {
            event.consume(true);
            this.detach();
        }
    },

    /**
     * @override
     * @return {!Element}
     */
    defaultFocusedElement: function()
    {
        var children = this.children();
        if (children.length)
            return children[0].defaultFocusedElement();
        return this.element;
    },

    __proto__: WebInspector.Widget.prototype
};

/** @type {?WebInspector.Widget} */
WebInspector.Dialog._modalHostView = null;

/**
 * @param {!WebInspector.Widget} view
 */
WebInspector.Dialog.setModalHostView = function(view)
{
    WebInspector.Dialog._modalHostView = view;
};

/**
 * FIXME: make utility method in Dialog, so clients use it instead of this getter.
 * Method should be like Dialog.showModalElement(position params, reposition callback).
 * @return {?WebInspector.Widget}
 */
WebInspector.Dialog.modalHostView = function()
{
    return WebInspector.Dialog._modalHostView;
};

WebInspector.Dialog.modalHostRepositioned = function()
{
    if (WebInspector.Dialog._instance)
        WebInspector.Dialog._instance._position();
};

