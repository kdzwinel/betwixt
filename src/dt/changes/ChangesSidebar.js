// Copyright 2017 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

Changes.ChangesSidebar = class extends UI.Widget {
  /**
   * @param {!WorkspaceDiff.WorkspaceDiff} workspaceDiff
   */
  constructor(workspaceDiff) {
    super();
    this._treeoutline = new UI.TreeOutlineInShadow();
    this._treeoutline.registerRequiredCSS('changes/changesSidebar.css');
    this._treeoutline.setComparator((a, b) => a.titleAsText().compareTo(b.titleAsText()));
    this._treeoutline.addEventListener(UI.TreeOutline.Events.ElementSelected, this._selectionChanged, this);

    this.element.appendChild(this._treeoutline.element);

    /** @type {!Map<!Workspace.UISourceCode, !Changes.ChangesSidebar.UISourceCodeTreeElement>} */
    this._treeElements = new Map();
    this._workspaceDiff = workspaceDiff;
    this._workspaceDiff.modifiedUISourceCodes().forEach(this._addUISourceCode.bind(this));
    this._workspaceDiff.addEventListener(
        WorkspaceDiff.Events.ModifiedStatusChanged, this._uiSourceCodeMofiedStatusChanged, this);
  }

  /**
   * @param {!Workspace.UISourceCode} uiSourceCode
   * @param {boolean=} omitFocus
   */
  selectUISourceCode(uiSourceCode, omitFocus) {
    const treeElement = this._treeElements.get(uiSourceCode);
    if (!treeElement)
      return;
    treeElement.select(omitFocus);
  }

  /**
   * @return {?Workspace.UISourceCode}
   */
  selectedUISourceCode() {
    return this._treeoutline.selectedTreeElement ? this._treeoutline.selectedTreeElement.uiSourceCode : null;
  }

  _selectionChanged() {
    this.dispatchEventToListeners(Changes.ChangesSidebar.Events.SelectedUISourceCodeChanged);
  }

  /**
   * @param {!Common.Event} event
   */
  _uiSourceCodeMofiedStatusChanged(event) {
    if (event.data.isModified)
      this._addUISourceCode(event.data.uiSourceCode);
    else
      this._removeUISourceCode(event.data.uiSourceCode);
  }

  /**
   * @param {!Workspace.UISourceCode} uiSourceCode
   */
  _removeUISourceCode(uiSourceCode) {
    const treeElement = this._treeElements.get(uiSourceCode);
    this._treeElements.delete(uiSourceCode);
    if (this._treeoutline.selectedTreeElement === treeElement) {
      const nextElementToSelect = treeElement.previousSibling || treeElement.nextSibling;
      if (nextElementToSelect) {
        nextElementToSelect.select(true);
      } else {
        treeElement.deselect();
        this._selectionChanged();
      }
    }
    this._treeoutline.removeChild(treeElement);
    treeElement.dispose();
  }

  /**
   * @param {!Workspace.UISourceCode} uiSourceCode
   */
  _addUISourceCode(uiSourceCode) {
    const treeElement = new Changes.ChangesSidebar.UISourceCodeTreeElement(uiSourceCode);
    this._treeElements.set(uiSourceCode, treeElement);
    this._treeoutline.appendChild(treeElement);
    if (!this._treeoutline.selectedTreeElement)
      treeElement.select(true);
  }
};

/**
 * @enum {symbol}
 */
Changes.ChangesSidebar.Events = {
  SelectedUISourceCodeChanged: Symbol('SelectedUISourceCodeChanged')
};

Changes.ChangesSidebar.UISourceCodeTreeElement = class extends UI.TreeElement {
  /**
   * @param {!Workspace.UISourceCode} uiSourceCode
   */
  constructor(uiSourceCode) {
    super();
    this.uiSourceCode = uiSourceCode;
    this.listItemElement.classList.add('navigator-' + uiSourceCode.contentType().name() + '-tree-item');

    let iconType = 'largeicon-navigator-file';
    if (Snippets.isSnippetsUISourceCode(this.uiSourceCode))
      iconType = 'largeicon-navigator-snippet';
    const defaultIcon = UI.Icon.create(iconType, 'icon');
    this.setLeadingIcons([defaultIcon]);

    this._eventListeners = [
      uiSourceCode.addEventListener(Workspace.UISourceCode.Events.TitleChanged, this._updateTitle, this),
      uiSourceCode.addEventListener(Workspace.UISourceCode.Events.WorkingCopyChanged, this._updateTitle, this),
      uiSourceCode.addEventListener(Workspace.UISourceCode.Events.WorkingCopyCommitted, this._updateTitle, this)
    ];

    this._updateTitle();
  }

  _updateTitle() {
    let titleText = this.uiSourceCode.displayName();
    if (this.uiSourceCode.isDirty())
      titleText = '*' + titleText;
    this.title = titleText;

    let tooltip = this.uiSourceCode.url();
    if (this.uiSourceCode.contentType().isFromSourceMap())
      tooltip = Common.UIString('%s (from source map)', this.uiSourceCode.displayName());
    this.tooltip = tooltip;
  }

  dispose() {
    Common.EventTarget.removeEventListeners(this._eventListeners);
  }
};