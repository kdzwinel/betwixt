// Copyright 2014 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * @constructor
 */
WebInspector.ActionRegistry = function()
{
    /** @type {!Map.<string, !WebInspector.Action>} */
    this._actionsById = new Map();
    this._registerActions();
}

WebInspector.ActionRegistry.prototype = {
    _registerActions: function()
    {
        self.runtime.extensions(WebInspector.ActionDelegate).forEach(registerExtension, this);

        /**
         * @param {!Runtime.Extension} extension
         * @this {WebInspector.ActionRegistry}
         */
        function registerExtension(extension)
        {
            var actionId = extension.descriptor()["actionId"];
            console.assert(actionId);
            console.assert(!this._actionsById.get(actionId));
            this._actionsById.set(actionId, new WebInspector.Action(extension));
        }
    },

    /**
     * @param {!Array.<string>} actionIds
     * @param {!WebInspector.Context} context
     * @return {!Array.<!WebInspector.Action>}
     */
    applicableActions: function(actionIds, context)
    {
        var extensions = [];
        actionIds.forEach(function(actionId) {
           var action = this._actionsById.get(actionId);
           if (action)
               extensions.push(action._extension);
        }, this);
        return context.applicableExtensions(extensions).valuesArray().map(extensionToAction.bind(this));

        /**
         * @param {!Runtime.Extension} extension
         * @return {!WebInspector.Action}
         * @this {WebInspector.ActionRegistry}
         */
        function extensionToAction(extension)
        {
            return this.action(extension.descriptor()["actionId"]);
        }
    },

    /**
     * @param {string} actionId
     * @return {!WebInspector.Action}
     */
    action: function(actionId)
    {
        var action = this._actionsById.get(actionId);
        console.assert(action, "No action found for actionId '" + actionId + "'");
        return /** @type {!WebInspector.Action} */ (action);
    }
}

/**
 * @constructor
 * @extends {WebInspector.Object}
 * @param {!Runtime.Extension} extension
 */
WebInspector.Action = function(extension)
{
    WebInspector.Object.call(this);
    this._extension = extension;
    this._enabled = true;
    this._toggled = false;
    this._title = this._extension.descriptor()["title"] || "";

    this._statesCount = this._extension.descriptor()["states"] || 2;
    if (this._statesCount == 2)
        this._state = WebInspector.Action._ToggleState.Off;
    else
        this._state = "0";
}

WebInspector.Action._ToggleState = {
    On: "on",
    Off: "off"
}

WebInspector.Action.Events = {
    Enabled: "Enabled",
    StateChanged: "StateChanged",
    TitleChanged: "TitleChanged",
}

WebInspector.Action.prototype = {

    /**
     * @return {number}
     */
    statesCount: function()
    {
        return this._statesCount;
    },

    /**
     * @return {string}
     */
    id: function()
    {
        return this._extension.descriptor()["actionId"];
    },

    /**
     * @return {!Promise.<boolean>}
     */
    execute: function()
    {
        return this._extension.instancePromise().then(handleAction.bind(this));

        /**
         * @param {!Object} actionDelegate
         * @return {boolean}
         * @this {WebInspector.Action}
         */
        function handleAction(actionDelegate)
        {
            var actionId = this._extension.descriptor()["actionId"];
            var delegate = /** @type {!WebInspector.ActionDelegate} */(actionDelegate);
            return delegate.handleAction(WebInspector.context, actionId);
        }
    },

    /**
     * @return {string}
     */
    icon: function()
    {
        return this._extension.descriptor()["iconClass"] || "";
    },

    /**
     * @param {boolean} enabled
     */
    setEnabled: function(enabled)
    {
        if (this._enabled === enabled)
            return;

        this._enabled = enabled;
        this.dispatchEventToListeners(WebInspector.Action.Events.Enabled, enabled);
    },

    /**
     * @return {boolean}
     */
    enabled: function()
    {
        return this._enabled;
    },

    /**
     * @param {string} title
     */
    setTitle: function(title)
    {
        if (this._title === title)
            return;

        this._title = title;
        this.dispatchEventToListeners(WebInspector.Action.Events.TitleChanged, this._title);
    },

    /**
     * @return {string}
     */
    title: function()
    {
        return this._title;
    },

    /**
     * @return {string}
     */
    state: function()
    {
        return this._state;
    },

    /**
     * @param {string} newState
     */
    setState: function(newState)
    {
        if (this._state === newState)
            return;

        var oldState = this._state;
        this._state = newState;
        this.dispatchEventToListeners(WebInspector.Action.Events.StateChanged, {oldState: oldState, newState: newState})
    },

    /**
     * @return {boolean}
     */
    toggled: function()
    {
        if (this._statesCount !== 2)
            throw("Only used toggled when there are 2 states, otherwise, use state");
        return this.state() === WebInspector.Action._ToggleState.On;
    },

    /**
     * @param {boolean} toggled
     */
    setToggled: function(toggled)
    {
        if (this._statesCount !== 2)
            throw("Only used toggled when there are 2 states, otherwise, use state");
        this.setState(toggled ? WebInspector.Action._ToggleState.On : WebInspector.Action._ToggleState.Off);
    },

    __proto__: WebInspector.Object.prototype
}

/**
 * @interface
 */
WebInspector.ActionDelegate = function()
{
}

WebInspector.ActionDelegate.prototype = {
    /**
     * @param {!WebInspector.Context} context
     * @param {string} actionId
     * @return {boolean}
     */
    handleAction: function(context, actionId) {}
}

/** @type {!WebInspector.ActionRegistry} */
WebInspector.actionRegistry;
