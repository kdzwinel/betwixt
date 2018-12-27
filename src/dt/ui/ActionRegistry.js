// Copyright 2014 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
/**
 * @unrestricted
 */
UI.ActionRegistry = class {
  constructor() {
    /** @type {!Map.<string, !UI.Action>} */
    this._actionsById = new Map();
    this._registerActions();
  }

  _registerActions() {
    self.runtime.extensions('action').forEach(registerExtension, this);

    /**
     * @param {!Runtime.Extension} extension
     * @this {UI.ActionRegistry}
     */
    function registerExtension(extension) {
      if (!extension.canInstantiate())
        return;
      const actionId = extension.descriptor()['actionId'];
      console.assert(actionId);
      console.assert(!this._actionsById.get(actionId));

      const action = new UI.Action(extension);
      if (!action.category() || action.title())
        this._actionsById.set(actionId, action);
      else
        console.error(`Category actions require a title for command menu: ${actionId}`);
    }
  }

  /**
   * @return {!Array.<!UI.Action>}
   */
  availableActions() {
    return this.applicableActions(this._actionsById.keysArray(), UI.context);
  }

  /**
   * @param {!Array.<string>} actionIds
   * @param {!UI.Context} context
   * @return {!Array.<!UI.Action>}
   */
  applicableActions(actionIds, context) {
    const extensions = [];
    actionIds.forEach(function(actionId) {
      const action = this._actionsById.get(actionId);
      if (action)
        extensions.push(action._extension);
    }, this);
    return context.applicableExtensions(extensions).valuesArray().map(extensionToAction.bind(this));

    /**
     * @param {!Runtime.Extension} extension
     * @return {!UI.Action}
     * @this {UI.ActionRegistry}
     */
    function extensionToAction(extension) {
      return /** @type {!UI.Action} */ (this.action(extension.descriptor()['actionId']));
    }
  }

  /**
   * @param {string} actionId
   * @return {?UI.Action}
   */
  action(actionId) {
    return this._actionsById.get(actionId) || null;
  }
};

/**
 * @unrestricted
 */
UI.Action = class extends Common.Object {
  /**
   * @param {!Runtime.Extension} extension
   */
  constructor(extension) {
    super();
    this._extension = extension;
    this._enabled = true;
    this._toggled = false;
  }

  /**
   * @return {string}
   */
  id() {
    return this._extension.descriptor()['actionId'];
  }

  /**
   * @return {!Promise.<boolean>}
   */
  execute() {
    return this._extension.instance().then(handleAction.bind(this));

    /**
     * @param {!Object} actionDelegate
     * @return {boolean}
     * @this {UI.Action}
     */
    function handleAction(actionDelegate) {
      const actionId = this._extension.descriptor()['actionId'];
      const delegate = /** @type {!UI.ActionDelegate} */ (actionDelegate);
      return delegate.handleAction(UI.context, actionId);
    }
  }

  /**
   * @return {string}
   */
  icon() {
    return this._extension.descriptor()['iconClass'] || '';
  }

  /**
   * @return {string}
   */
  toggledIcon() {
    return this._extension.descriptor()['toggledIconClass'] || '';
  }

  /**
   * @return {boolean}
   */
  toggleWithRedColor() {
    return !!this._extension.descriptor()['toggleWithRedColor'];
  }

  /**
   * @param {boolean} enabled
   */
  setEnabled(enabled) {
    if (this._enabled === enabled)
      return;

    this._enabled = enabled;
    this.dispatchEventToListeners(UI.Action.Events.Enabled, enabled);
  }

  /**
   * @return {boolean}
   */
  enabled() {
    return this._enabled;
  }

  /**
   * @return {string}
   */
  category() {
    return this._extension.descriptor()['category'] || '';
  }

  /**
   * @return {string}
   */
  tags() {
    return this._extension.descriptor()['tags'] || '';
  }

  /**
   * @return {string}
   */
  title() {
    let title = this._extension.title();
    const options = this._extension.descriptor()['options'];
    if (options) {
      for (const pair of options) {
        if (pair['value'] !== this._toggled)
          title = pair['title'];
      }
    }
    return title;
  }

  /**
   * @return {boolean}
   */
  toggled() {
    return this._toggled;
  }

  /**
   * @param {boolean} toggled
   */
  setToggled(toggled) {
    if (this._toggled === toggled)
      return;

    this._toggled = toggled;
    this.dispatchEventToListeners(UI.Action.Events.Toggled, toggled);
  }
};

/** @enum {symbol} */
UI.Action.Events = {
  Enabled: Symbol('Enabled'),
  Toggled: Symbol('Toggled')
};

/**
 * @interface
 */
UI.ActionDelegate = function() {};

UI.ActionDelegate.prototype = {
  /**
   * @param {!UI.Context} context
   * @param {string} actionId
   * @return {boolean}
   */
  handleAction(context, actionId) {}
};

/** @type {!UI.ActionRegistry} */
UI.actionRegistry;
