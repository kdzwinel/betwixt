/*
 * Copyright (C) 2013 Google Inc. All rights reserved.
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
 * @extends {WebInspector.VBox}
 * @implements {WebInspector.TargetManager.Observer}
 */
WebInspector.RenderingOptionsView = function()
{
    WebInspector.VBox.call(this, true);
    this.registerRequiredCSS("main/renderingOptions.css");

    /** @type {!Map.<string, !Element>} */
    this._settings = new Map();

    this._appendCheckbox(WebInspector.UIString("Enable paint flashing"), "setShowPaintRects");
    this._appendCheckbox(WebInspector.UIString("Show layer borders"), "setShowDebugBorders");
    this._appendCheckbox(WebInspector.UIString("Show FPS meter"), "setShowFPSCounter");
    var scrollingTitle = WebInspector.UIString("Shows areas of the page that slow down scrolling:\nTouch and mousewheel event listeners can delay scrolling.\nSome areas need to repaint their content when scrolled.");
    this._appendCheckbox(WebInspector.UIString("Show scrolling perf issues"), "setShowScrollBottleneckRects", scrollingTitle);

    // Print media.
    var checkboxLabel = createCheckboxLabel(WebInspector.UIString("Emulate print media"), false);
    this._printCheckbox = checkboxLabel.checkboxElement;
    this._printCheckbox.addEventListener("click", this._printToggled.bind(this));
    this.contentElement.appendChild(checkboxLabel);

    WebInspector.targetManager.observeTargets(this, WebInspector.Target.Type.Page);
}

WebInspector.RenderingOptionsView.prototype = {
    /**
     * @param {string} label
     * @param {string} setterName
     * @param {string=} title
     */
    _appendCheckbox: function(label, setterName, title)
    {
        var checkboxLabel = createCheckboxLabel(label, false);
        this._settings.set(setterName, checkboxLabel.checkboxElement);
        checkboxLabel.checkboxElement.addEventListener("click", this._settingToggled.bind(this, setterName));
        if (title)
            checkboxLabel.title = title;
        this.contentElement.appendChild(checkboxLabel);
    },

    /**
     * @param {string} setterName
     */
    _settingToggled: function(setterName)
    {
        var enabled = this._settings.get(setterName).checked;
        var targets = WebInspector.targetManager.targets(WebInspector.Target.Type.Page);
        for (var i = 0; i < targets.length; ++i)
            targets[i].renderingAgent()[setterName](enabled);
    },

    /**
     * @override
     * @param {!WebInspector.Target} target
     */
    targetAdded: function(target)
    {
        for (var setterName of this._settings.keysArray()) {
            if (this._settings.get(setterName).checked)
                target.renderingAgent()[setterName](true);
        }
        if (this._printCheckbox.checked)
            this._applyPrintMediaOverride(target);
    },

    _printToggled: function()
    {
        var targets = WebInspector.targetManager.targets(WebInspector.Target.Type.Page);
        for (var target of targets)
            this._applyPrintMediaOverride(target);
    },

    /**
     * @param {!WebInspector.Target} target
     */
    _applyPrintMediaOverride: function(target)
    {
        var enabled = this._printCheckbox.checked;
        target.emulationAgent().setEmulatedMedia(enabled ? "print" : "");
        var cssModel = WebInspector.CSSStyleModel.fromTarget(target);
        if (cssModel)
            cssModel.mediaQueryResultChanged();
    },

    /**
     * @override
     * @param {!WebInspector.Target} target
     */
    targetRemoved: function(target)
    {
    },

    __proto__: WebInspector.VBox.prototype
}

/**
 * @return {!WebInspector.RenderingOptionsView}
 */
WebInspector.RenderingOptionsView.instance = function()
{
    if (!WebInspector.RenderingOptionsView._instanceObject)
        WebInspector.RenderingOptionsView._instanceObject = new WebInspector.RenderingOptionsView();
    return WebInspector.RenderingOptionsView._instanceObject;
}

/**
 * @constructor
 * @implements {WebInspector.ActionDelegate}
 */
WebInspector.RenderingOptionsView.ShowActionDelegate = function()
{
}

WebInspector.RenderingOptionsView.ShowActionDelegate.prototype = {
    /**
     * @override
     * @param {!WebInspector.Context} context
     * @param {string} actionId
     * @return {boolean}
     */
    handleAction: function(context, actionId)
    {
        WebInspector.inspectorView.showViewInDrawer("rendering");
        return true;
    }
}