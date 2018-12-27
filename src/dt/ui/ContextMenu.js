/*
 * Copyright (C) 2009 Google Inc. All rights reserved.
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
 * @unrestricted
 */
UI.ContextMenuItem = class {
  /**
   * @param {?UI.ContextMenu} contextMenu
   * @param {string} type
   * @param {string=} label
   * @param {boolean=} disabled
   * @param {boolean=} checked
   */
  constructor(contextMenu, type, label, disabled, checked) {
    this._type = type;
    this._label = label;
    this._disabled = disabled;
    this._checked = checked;
    this._contextMenu = contextMenu;
    if (type === 'item' || type === 'checkbox')
      this._id = contextMenu ? contextMenu._nextId() : 0;
  }

  /**
   * @return {number}
   */
  id() {
    return this._id;
  }

  /**
   * @return {string}
   */
  type() {
    return this._type;
  }

  /**
   * @return {boolean}
   */
  isEnabled() {
    return !this._disabled;
  }

  /**
   * @param {boolean} enabled
   */
  setEnabled(enabled) {
    this._disabled = !enabled;
  }

  /**
   * @return {!InspectorFrontendHostAPI.ContextMenuDescriptor}
   */
  _buildDescriptor() {
    switch (this._type) {
      case 'item':
        const result = {type: 'item', id: this._id, label: this._label, enabled: !this._disabled};
        if (this._customElement)
          result.element = this._customElement;
        if (this._shortcut)
          result.shortcut = this._shortcut;
        return result;
      case 'separator':
        return {type: 'separator'};
      case 'checkbox':
        return {type: 'checkbox', id: this._id, label: this._label, checked: !!this._checked, enabled: !this._disabled};
    }
    throw new Error('Invalid item type:' + this._type);
  }

  /**
   * @param {string} shortcut
   */
  setShortcut(shortcut) {
    this._shortcut = shortcut;
  }
};

/**
 * @unrestricted
 */
UI.ContextMenuSection = class {
  /**
   * @param {?UI.ContextMenu} contextMenu
   */
  constructor(contextMenu) {
    this._contextMenu = contextMenu;
    /** @type {!Array<!UI.ContextMenuItem>} */
    this._items = [];
  }

  /**
   * @param {string} label
   * @param {function(?)} handler
   * @param {boolean=} disabled
   * @return {!UI.ContextMenuItem}
   */
  appendItem(label, handler, disabled) {
    const item = new UI.ContextMenuItem(this._contextMenu, 'item', label, disabled);
    this._items.push(item);
    this._contextMenu._setHandler(item.id(), handler);
    return item;
  }

  /**
   * @param {!Element} element
   * @return {!UI.ContextMenuItem}
   */
  appendCustomItem(element) {
    const item = new UI.ContextMenuItem(this._contextMenu, 'item', '<custom>');
    item._customElement = element;
    this._items.push(item);
    return item;
  }

  /**
   * @param {string} actionId
   * @param {string=} label
   * @param {boolean=} optional
   */
  appendAction(actionId, label, optional) {
    const action = UI.actionRegistry.action(actionId);
    if (!action) {
      if (!optional)
        console.error(`Action ${actionId} was not defined`);
      return;
    }
    if (!label)
      label = action.title();
    const result = this.appendItem(label, action.execute.bind(action));
    const shortcut = UI.shortcutRegistry.shortcutTitleForAction(actionId);
    if (shortcut)
      result.setShortcut(shortcut);
  }

  /**
   * @param {string} label
   * @param {boolean=} disabled
   * @return {!UI.ContextSubMenu}
   */
  appendSubMenuItem(label, disabled) {
    const item = new UI.ContextSubMenu(this._contextMenu, label, disabled);
    item._init();
    this._items.push(item);
    return item;
  }

  /**
   * @param {string} label
   * @param {function()} handler
   * @param {boolean=} checked
   * @param {boolean=} disabled
   * @return {!UI.ContextMenuItem}
   */
  appendCheckboxItem(label, handler, checked, disabled) {
    const item = new UI.ContextMenuItem(this._contextMenu, 'checkbox', label, disabled, checked);
    this._items.push(item);
    this._contextMenu._setHandler(item.id(), handler);
    return item;
  }
};

/**
 * @unrestricted
 */
UI.ContextSubMenu = class extends UI.ContextMenuItem {
  /**
   * @param {?UI.ContextMenu} contextMenu
   * @param {string=} label
   * @param {boolean=} disabled
   */
  constructor(contextMenu, label, disabled) {
    super(contextMenu, 'subMenu', label, disabled);
    /** @type {!Map<string, !UI.ContextMenuSection>} */
    this._sections = new Map();
    /** @type {!Array<!UI.ContextMenuSection>} */
    this._sectionList = [];
  }

  _init() {
    UI.ContextMenu._groupWeights.forEach(name => this.section(name));
  }

  /**
   * @param {string=} name
   * @return {!UI.ContextMenuSection}
   */
  section(name) {
    let section = name ? this._sections.get(name) : null;
    if (!section) {
      section = new UI.ContextMenuSection(this._contextMenu);
      if (name) {
        this._sections.set(name, section);
        this._sectionList.push(section);
      } else {
        this._sectionList.splice(UI.ContextMenu._groupWeights.indexOf('default'), 0, section);
      }
    }
    return section;
  }

  /**
   * @return {!UI.ContextMenuSection}
   */
  headerSection() {
    return this.section('header');
  }

  /**
   * @return {!UI.ContextMenuSection}
   */
  newSection() {
    return this.section('new');
  }

  /**
   * @return {!UI.ContextMenuSection}
   */
  revealSection() {
    return this.section('reveal');
  }

  /**
   * @return {!UI.ContextMenuSection}
   */
  clipboardSection() {
    return this.section('clipboard');
  }

  /**
   * @return {!UI.ContextMenuSection}
   */
  editSection() {
    return this.section('edit');
  }

  /**
   * @return {!UI.ContextMenuSection}
   */
  debugSection() {
    return this.section('debug');
  }

  /**
   * @return {!UI.ContextMenuSection}
   */
  viewSection() {
    return this.section('view');
  }

  /**
   * @return {!UI.ContextMenuSection}
   */
  defaultSection() {
    return this.section('default');
  }

  /**
   * @return {!UI.ContextMenuSection}
   */
  saveSection() {
    return this.section('save');
  }

  /**
   * @return {!UI.ContextMenuSection}
   */
  footerSection() {
    return this.section('footer');
  }

  /**
   * @override
   * @return {!InspectorFrontendHostAPI.ContextMenuDescriptor}
   */
  _buildDescriptor() {
    /** @type {!InspectorFrontendHostAPI.ContextMenuDescriptor} */
    const result = {type: 'subMenu', label: this._label, enabled: !this._disabled, subItems: []};

    const nonEmptySections = this._sectionList.filter(section => !!section._items.length);
    for (const section of nonEmptySections) {
      for (const item of section._items)
        result.subItems.push(item._buildDescriptor());
      if (section !== nonEmptySections.peekLast())
        result.subItems.push({type: 'separator'});
    }
    return result;
  }

  /**
   * @param {string} location
   */
  appendItemsAtLocation(location) {
    for (const extension of self.runtime.extensions('context-menu-item')) {
      const itemLocation = extension.descriptor()['location'] || '';
      if (!itemLocation.startsWith(location + '/'))
        continue;

      const section = itemLocation.substr(location.length + 1);
      if (!section || section.includes('/'))
        continue;

      this.section(section).appendAction(extension.descriptor()['actionId']);
    }
  }
};

UI.ContextMenuItem._uniqueSectionName = 0;

/**
 * @unrestricted
 */
UI.ContextMenu = class extends UI.ContextSubMenu {
  /**
   * @param {!Event} event
   * @param {boolean=} useSoftMenu
   * @param {number=} x
   * @param {number=} y
   */
  constructor(event, useSoftMenu, x, y) {
    super(null);
    this._contextMenu = this;
    super._init();
    this._defaultSection = this.defaultSection();
    /** @type {!Array.<!Promise.<!Array.<!UI.ContextMenu.Provider>>>} */
    this._pendingPromises = [];
    /** @type {!Array<!Object>} */
    this._pendingTargets = [];
    this._event = event;
    this._useSoftMenu = !!useSoftMenu;
    this._x = x === undefined ? event.x : x;
    this._y = y === undefined ? event.y : y;
    this._handlers = {};
    this._id = 0;

    const target = event.deepElementFromPoint();
    if (target)
      this.appendApplicableItems(/** @type {!Object} */ (target));
  }

  static initialize() {
    InspectorFrontendHost.events.addEventListener(InspectorFrontendHostAPI.Events.SetUseSoftMenu, setUseSoftMenu);
    /**
     * @param {!Common.Event} event
     */
    function setUseSoftMenu(event) {
      UI.ContextMenu._useSoftMenu = /** @type {boolean} */ (event.data);
    }
  }

  /**
   * @param {!Document} doc
   */
  static installHandler(doc) {
    doc.body.addEventListener('contextmenu', handler, false);

    /**
     * @param {!Event} event
     */
    function handler(event) {
      const contextMenu = new UI.ContextMenu(event);
      contextMenu.show();
    }
  }

  /**
   * @return {number}
   */
  _nextId() {
    return this._id++;
  }

  show() {
    Promise.all(this._pendingPromises).then(populate.bind(this)).then(this._innerShow.bind(this));
    UI.ContextMenu._pendingMenu = this;

    /**
     * @param {!Array.<!Array.<!UI.ContextMenu.Provider>>} appendCallResults
     * @this {UI.ContextMenu}
     */
    function populate(appendCallResults) {
      if (UI.ContextMenu._pendingMenu !== this)
        return;
      delete UI.ContextMenu._pendingMenu;

      for (let i = 0; i < appendCallResults.length; ++i) {
        const providers = appendCallResults[i];
        const target = this._pendingTargets[i];

        for (let j = 0; j < providers.length; ++j) {
          const provider = /** @type {!UI.ContextMenu.Provider} */ (providers[j]);
          provider.appendApplicableItems(this._event, this, target);
        }
      }

      this._pendingPromises = [];
      this._pendingTargets = [];
    }

    this._event.consume(true);
  }

  discard() {
    if (this._softMenu)
      this._softMenu.discard();
  }

  _innerShow() {
    const menuObject = this._buildMenuDescriptors();
    if (this._useSoftMenu || UI.ContextMenu._useSoftMenu || InspectorFrontendHost.isHostedMode()) {
      this._softMenu = new UI.SoftContextMenu(menuObject, this._itemSelected.bind(this));
      this._softMenu.show(this._event.target.ownerDocument, new AnchorBox(this._x, this._y, 0, 0));
    } else {
      InspectorFrontendHost.showContextMenuAtPoint(this._x, this._y, menuObject, this._event.target.ownerDocument);

      /**
       * @this {UI.ContextMenu}
       */
      function listenToEvents() {
        InspectorFrontendHost.events.addEventListener(
            InspectorFrontendHostAPI.Events.ContextMenuCleared, this._menuCleared, this);
        InspectorFrontendHost.events.addEventListener(
            InspectorFrontendHostAPI.Events.ContextMenuItemSelected, this._onItemSelected, this);
      }

      // showContextMenuAtPoint call above synchronously issues a clear event for previous context menu (if any),
      // so we skip it before subscribing to the clear event.
      setImmediate(listenToEvents.bind(this));
    }
  }

  /**
   * @param {number} id
   * @param {function(?)} handler
   */
  _setHandler(id, handler) {
    if (handler)
      this._handlers[id] = handler;
  }

  /**
   * @return {!Array.<!InspectorFrontendHostAPI.ContextMenuDescriptor>}
   */
  _buildMenuDescriptors() {
    return /** @type {!Array.<!InspectorFrontendHostAPI.ContextMenuDescriptor>} */ (super._buildDescriptor().subItems);
  }

  /**
   * @param {!Common.Event} event
   */
  _onItemSelected(event) {
    this._itemSelected(/** @type {string} */ (event.data));
  }

  /**
   * @param {string} id
   */
  _itemSelected(id) {
    if (this._handlers[id])
      this._handlers[id].call(this);
    this._menuCleared();
  }

  _menuCleared() {
    InspectorFrontendHost.events.removeEventListener(
        InspectorFrontendHostAPI.Events.ContextMenuCleared, this._menuCleared, this);
    InspectorFrontendHost.events.removeEventListener(
        InspectorFrontendHostAPI.Events.ContextMenuItemSelected, this._onItemSelected, this);
  }

  /**
   * @param {!Object} target
   */
  appendApplicableItems(target) {
    this._pendingPromises.push(self.runtime.allInstances(UI.ContextMenu.Provider, target));
    this._pendingTargets.push(target);
  }
};

UI.ContextMenu._groupWeights =
    ['header', 'new', 'reveal', 'edit', 'clipboard', 'debug', 'view', 'default', 'save', 'footer'];

/**
 * @interface
 */
UI.ContextMenu.Provider = function() {};

UI.ContextMenu.Provider.prototype = {
  /**
   * @param {!Event} event
   * @param {!UI.ContextMenu} contextMenu
   * @param {!Object} target
   */
  appendApplicableItems(event, contextMenu, target) {}
};
