// Copyright (c) 2015 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
/**
 * @implements {UI.ContextFlavorListener}
 * @unrestricted
 */
Sources.JavaScriptBreakpointsSidebarPane = class extends UI.ThrottledWidget {
  constructor() {
    super(true);
    this.registerRequiredCSS('sources/javaScriptBreakpointsSidebarPane.css');

    this._breakpointManager = Bindings.breakpointManager;
    this._breakpointManager.addEventListener(Bindings.BreakpointManager.Events.BreakpointAdded, this.update, this);
    this._breakpointManager.addEventListener(Bindings.BreakpointManager.Events.BreakpointRemoved, this.update, this);
    Common.moduleSetting('breakpointsActive').addChangeListener(this.update, this);

    /** @type {?Element} */
    this._listElement = null;
    this.update();
  }

  /**
   * @override
   * @return {!Promise<?>}
   */
  doUpdate() {
    const breakpointLocations = this._breakpointManager.allBreakpointLocations().filter(
        breakpointLocation =>
            breakpointLocation.uiLocation.uiSourceCode.project().type() !== Workspace.projectTypes.Debugger);
    if (!breakpointLocations.length) {
      this._listElement = null;
      this.contentElement.removeChildren();
      const emptyElement = this.contentElement.createChild('div', 'gray-info-message');
      emptyElement.textContent = Common.UIString('No breakpoints');
      this.contentElement.appendChild(emptyElement);
      this._didUpdateForTest();
      return Promise.resolve();
    }

    if (!this._listElement) {
      this.contentElement.removeChildren();
      this._listElement = this.contentElement.createChild('div');
      this.contentElement.appendChild(this._listElement);
    }

    breakpointLocations.sort((item1, item2) => item1.uiLocation.compareTo(item2.uiLocation));

    /** @type {!Multimap<string, !{breakpoint: !Bindings.BreakpointManager.Breakpoint, uiLocation: !Workspace.UILocation}>} */
    const locationForEntry = new Multimap();
    for (const breakpointLocation of breakpointLocations) {
      const uiLocation = breakpointLocation.uiLocation;
      const entryDescriptor = uiLocation.uiSourceCode.url() + ':' + uiLocation.lineNumber;
      locationForEntry.set(entryDescriptor, breakpointLocation);
    }

    const details = UI.context.flavor(SDK.DebuggerPausedDetails);
    const selectedUILocation = details && details.callFrames.length ?
        Bindings.debuggerWorkspaceBinding.rawLocationToUILocation(details.callFrames[0].location()) :
        null;

    let shouldShowView = false;
    let entry = this._listElement.firstChild;
    const promises = [];
    for (const descriptor of locationForEntry.keysArray()) {
      if (!entry) {
        entry = this._listElement.createChild('div', 'breakpoint-entry');
        entry.addEventListener('contextmenu', this._breakpointContextMenu.bind(this), true);
        entry.addEventListener('click', this._revealLocation.bind(this), false);
        const checkboxLabel = UI.CheckboxLabel.create('');
        checkboxLabel.addEventListener('click', this._breakpointCheckboxClicked.bind(this), false);
        entry.appendChild(checkboxLabel);
        entry[Sources.JavaScriptBreakpointsSidebarPane._checkboxLabelSymbol] = checkboxLabel;
        const snippetElement = entry.createChild('div', 'source-text monospace');
        entry[Sources.JavaScriptBreakpointsSidebarPane._snippetElementSymbol] = snippetElement;
      }

      const locations = Array.from(locationForEntry.get(descriptor));
      const uiLocation = locations[0].uiLocation;
      const isSelected =
          !!selectedUILocation && locations.some(location => location.uiLocation.id() === selectedUILocation.id());
      const hasEnabled = locations.some(location => location.breakpoint.enabled());
      const hasDisabled = locations.some(location => !location.breakpoint.enabled());
      promises.push(this._resetEntry(/** @type {!Element}*/ (entry), uiLocation, isSelected, hasEnabled, hasDisabled));
      entry[Sources.JavaScriptBreakpointsSidebarPane._breakpointLocationsSymbol] = locations;
      if (isSelected)
        shouldShowView = true;
      entry = entry.nextSibling;
    }
    while (entry) {
      const next = entry.nextSibling;
      entry.remove();
      entry = next;
    }
    if (shouldShowView)
      UI.viewManager.showView('sources.jsBreakpoints');
    this._listElement.classList.toggle(
        'breakpoints-list-deactivated', !Common.moduleSetting('breakpointsActive').get());
    return Promise.all(promises).then(() => this._didUpdateForTest());
  }

  /**
   * @param {!Element} element
   * @param {!Workspace.UILocation} uiLocation
   * @param {boolean} isSelected
   * @param {boolean} hasEnabled
   * @param {boolean} hasDisabled
   * @return {!Promise<undefined>}
   */
  _resetEntry(element, uiLocation, isSelected, hasEnabled, hasDisabled) {
    element[Sources.JavaScriptBreakpointsSidebarPane._locationSymbol] = uiLocation;
    element.classList.toggle('breakpoint-hit', isSelected);

    const checkboxLabel = element[Sources.JavaScriptBreakpointsSidebarPane._checkboxLabelSymbol];
    checkboxLabel.textElement.textContent = uiLocation.linkText();
    checkboxLabel.checkboxElement.checked = hasEnabled;
    checkboxLabel.checkboxElement.indeterminate = hasEnabled && hasDisabled;

    const snippetElement = element[Sources.JavaScriptBreakpointsSidebarPane._snippetElementSymbol];
    return uiLocation.uiSourceCode.requestContent().then(fillSnippetElement.bind(null, snippetElement));

    /**
     * @param {!Element} snippetElement
     * @param {?string} content
     */
    function fillSnippetElement(snippetElement, content) {
      const lineNumber = uiLocation.lineNumber;
      const text = new TextUtils.Text(content || '');
      if (lineNumber < text.lineCount()) {
        const lineText = text.lineAt(lineNumber);
        const maxSnippetLength = 200;
        snippetElement.textContent = lineText.trimEnd(maxSnippetLength);
      }
    }
  }

  /**
   * @param {!Event} event
   * @return {!Array<!Bindings.BreakpointManager.BreakpointLocation>}
   */
  _breakpointLocations(event) {
    const node = event.target.enclosingNodeOrSelfWithClass('breakpoint-entry');
    if (!node)
      return [];
    return node[Sources.JavaScriptBreakpointsSidebarPane._breakpointLocationsSymbol] || [];
  }

  /**
   * @param {!Event} event
   */
  _breakpointCheckboxClicked(event) {
    const breakpoints = this._breakpointLocations(event).map(breakpointLocation => breakpointLocation.breakpoint);
    const newState = event.target.checkboxElement.checked;
    for (const breakpoint of breakpoints)
      breakpoint.setEnabled(newState);
    event.consume();
  }

  /**
   * @param {!Event} event
   */
  _revealLocation(event) {
    const uiLocations = this._breakpointLocations(event).map(breakpointLocation => breakpointLocation.uiLocation);
    let uiLocation = null;
    for (const uiLocationCandidate of uiLocations) {
      if (!uiLocation || uiLocationCandidate.columnNumber < uiLocation.columnNumber)
        uiLocation = uiLocationCandidate;
    }
    if (uiLocation)
      Common.Revealer.reveal(uiLocation);
  }

  /**
   * @param {!Event} event
   */
  _breakpointContextMenu(event) {
    const breakpoints = this._breakpointLocations(event).map(breakpointLocation => breakpointLocation.breakpoint);

    const contextMenu = new UI.ContextMenu(event);
    const removeEntryTitle = breakpoints.length > 1 ? Common.UIString('Remove all breakpoints in line') :
                                                      Common.UIString('Remove breakpoint');
    contextMenu.defaultSection().appendItem(
        removeEntryTitle, () => breakpoints.map(breakpoint => breakpoint.remove(false /* keepInStorage */)));

    const breakpointActive = Common.moduleSetting('breakpointsActive').get();
    const breakpointActiveTitle =
        breakpointActive ? Common.UIString('Deactivate breakpoints') : Common.UIString('Activate breakpoints');
    contextMenu.defaultSection().appendItem(
        breakpointActiveTitle, () => Common.moduleSetting('breakpointsActive').set(!breakpointActive));

    if (breakpoints.some(breakpoint => !breakpoint.enabled())) {
      const enableTitle = Common.UIString('Enable all breakpoints');
      contextMenu.defaultSection().appendItem(enableTitle, this._toggleAllBreakpoints.bind(this, true));
    }
    if (breakpoints.some(breakpoint => breakpoint.enabled())) {
      const disableTitle = Common.UIString('Disable all breakpoints');
      contextMenu.defaultSection().appendItem(disableTitle, this._toggleAllBreakpoints.bind(this, false));
    }
    const removeAllTitle = Common.UIString('Remove all breakpoints');
    contextMenu.defaultSection().appendItem(removeAllTitle, this._removeAllBreakpoints.bind(this));
    const removeOtherTitle = Common.UIString('Remove other breakpoints');
    contextMenu.defaultSection().appendItem(
        removeOtherTitle, this._removeOtherBreakpoints.bind(this, new Set(breakpoints)));
    contextMenu.show();
  }

  /**
   * @param {boolean} toggleState
   */
  _toggleAllBreakpoints(toggleState) {
    for (const breakpointLocation of this._breakpointManager.allBreakpointLocations())
      breakpointLocation.breakpoint.setEnabled(toggleState);
  }

  _removeAllBreakpoints() {
    for (const breakpointLocation of this._breakpointManager.allBreakpointLocations())
      breakpointLocation.breakpoint.remove(false /* keepInStorage */);
  }

  /**
   * @param {!Set<!Bindings.BreakpointManager.Breakpoint>} selectedBreakpoints
   */
  _removeOtherBreakpoints(selectedBreakpoints) {
    for (const breakpointLocation of this._breakpointManager.allBreakpointLocations()) {
      if (!selectedBreakpoints.has(breakpointLocation.breakpoint))
        breakpointLocation.breakpoint.remove(false /* keepInStorage */);
    }
  }

  /**
   * @override
   * @param {?Object} object
   */
  flavorChanged(object) {
    this.update();
  }

  _didUpdateForTest() {
  }
};

Sources.JavaScriptBreakpointsSidebarPane._locationSymbol = Symbol('location');
Sources.JavaScriptBreakpointsSidebarPane._checkboxLabelSymbol = Symbol('checkbox-label');
Sources.JavaScriptBreakpointsSidebarPane._snippetElementSymbol = Symbol('snippet-element');
Sources.JavaScriptBreakpointsSidebarPane._breakpointLocationsSymbol = Symbol('locations');
