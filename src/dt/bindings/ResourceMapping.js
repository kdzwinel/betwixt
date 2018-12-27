// Copyright 2017 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * @implements {SDK.SDKModelObserver<!SDK.ResourceTreeModel>}
 */
Bindings.ResourceMapping = class {
  /**
   * @param {!SDK.TargetManager} targetManager
   * @param {!Workspace.Workspace} workspace
   */
  constructor(targetManager, workspace) {
    this._workspace = workspace;
    /** @type {!Map<!SDK.ResourceTreeModel, !Bindings.ResourceMapping.ModelInfo>} */
    this._modelToInfo = new Map();
    targetManager.observeModels(SDK.ResourceTreeModel, this);
  }

  /**
   * @override
   * @param {!SDK.ResourceTreeModel} resourceTreeModel
   */
  modelAdded(resourceTreeModel) {
    const info = new Bindings.ResourceMapping.ModelInfo(this._workspace, resourceTreeModel);
    this._modelToInfo.set(resourceTreeModel, info);
  }

  /**
   * @override
   * @param {!SDK.ResourceTreeModel} resourceTreeModel
   */
  modelRemoved(resourceTreeModel) {
    const info = this._modelToInfo.get(resourceTreeModel);
    info.dispose();
    this._modelToInfo.delete(resourceTreeModel);
  }

  /**
   * @param {!SDK.Target} target
   * @return {?Bindings.ResourceMapping.ModelInfo}
   */
  _infoForTarget(target) {
    const resourceTreeModel = target.model(SDK.ResourceTreeModel);
    return resourceTreeModel ? this._modelToInfo.get(resourceTreeModel) : null;
  }

  /**
   * @param {!SDK.CSSLocation} cssLocation
   * @return {?Workspace.UILocation}
   */
  cssLocationToUILocation(cssLocation) {
    const header = cssLocation.header();
    if (!header)
      return null;
    const info = this._infoForTarget(cssLocation.cssModel().target());
    if (!info)
      return null;
    const uiSourceCode = info._project.uiSourceCodeForURL(cssLocation.url);
    if (!uiSourceCode)
      return null;
    const offset = header[Bindings.ResourceMapping._offsetSymbol] ||
        TextUtils.TextRange.createFromLocation(header.startLine, header.startColumn);
    const lineNumber = cssLocation.lineNumber + offset.startLine - header.startLine;
    let columnNumber = cssLocation.columnNumber;
    if (cssLocation.lineNumber === header.startLine)
      columnNumber += offset.startColumn - header.startColumn;
    return uiSourceCode.uiLocation(lineNumber, columnNumber);
  }

  /**
   * @param {!SDK.DebuggerModel.Location} jsLocation
   * @return {?Workspace.UILocation}
   */
  jsLocationToUILocation(jsLocation) {
    const script = jsLocation.script();
    if (!script)
      return null;
    const info = this._infoForTarget(jsLocation.debuggerModel.target());
    if (!info)
      return null;
    const uiSourceCode = info._project.uiSourceCodeForURL(script.sourceURL);
    if (!uiSourceCode)
      return null;
    const offset = script[Bindings.ResourceMapping._offsetSymbol] ||
        TextUtils.TextRange.createFromLocation(script.lineOffset, script.columnOffset);
    const lineNumber = jsLocation.lineNumber + offset.startLine - script.lineOffset;
    let columnNumber = jsLocation.columnNumber;
    if (jsLocation.lineNumber === script.lineOffset)
      columnNumber += offset.startColumn - script.columnOffset;
    return uiSourceCode.uiLocation(lineNumber, columnNumber);
  }

  /**
   * @param {!Workspace.UISourceCode} uiSourceCode
   * @param {number} lineNumber
   * @param {number} columnNumber
   * @return {!Array<!SDK.DebuggerModel.Location>}
   */
  uiLocationToJSLocations(uiSourceCode, lineNumber, columnNumber) {
    if (!uiSourceCode[Bindings.ResourceMapping._symbol])
      return [];
    const target = Bindings.NetworkProject.targetForUISourceCode(uiSourceCode);
    if (!target)
      return [];
    const debuggerModel = target.model(SDK.DebuggerModel);
    if (!debuggerModel)
      return [];
    const location = debuggerModel.createRawLocationByURL(uiSourceCode.url(), lineNumber, columnNumber);
    return location ? [location] : [];
  }

  /**
   * @param {!SDK.Target} target
   */
  _resetForTest(target) {
    const resourceTreeModel = target.model(SDK.ResourceTreeModel);
    const info = resourceTreeModel ? this._modelToInfo.get(resourceTreeModel) : null;
    if (info)
      info._resetForTest();
  }
};

Bindings.ResourceMapping.ModelInfo = class {
  /**
   * @param {!Workspace.Workspace} workspace
   * @param {!SDK.ResourceTreeModel} resourceTreeModel
   */
  constructor(workspace, resourceTreeModel) {
    const target = resourceTreeModel.target();
    this._project = new Bindings.ContentProviderBasedProject(
        workspace, 'resources:' + target.id(), Workspace.projectTypes.Network, '', false /* isServiceProject */);
    Bindings.NetworkProject.setTargetForProject(this._project, target);

    /** @type {!Map<string, !Bindings.ResourceMapping.Binding>} */
    this._bindings = new Map();

    const cssModel = target.model(SDK.CSSModel);
    this._cssModel = cssModel;
    this._eventListeners = [
      resourceTreeModel.addEventListener(SDK.ResourceTreeModel.Events.ResourceAdded, this._resourceAdded, this),
      resourceTreeModel.addEventListener(SDK.ResourceTreeModel.Events.FrameWillNavigate, this._frameWillNavigate, this),
      resourceTreeModel.addEventListener(SDK.ResourceTreeModel.Events.FrameDetached, this._frameDetached, this),
      cssModel.addEventListener(SDK.CSSModel.Events.StyleSheetChanged, this._styleSheetChanged, this)
    ];
  }

  /**
   * @param {!Common.Event} event
   */
  _styleSheetChanged(event) {
    const header = this._cssModel.styleSheetHeaderForId(event.data.styleSheetId);
    if (!header || !header.isInline)
      return;
    const binding = this._bindings.get(header.resourceURL());
    if (!binding)
      return;
    binding._styleSheetChanged(header, event.data.edit);
  }

  /**
   * @param {!SDK.Resource} resource
   */
  _acceptsResource(resource) {
    const resourceType = resource.resourceType();
    // Only load selected resource types from resources.
    if (resourceType !== Common.resourceTypes.Image && resourceType !== Common.resourceTypes.Font &&
        resourceType !== Common.resourceTypes.Document && resourceType !== Common.resourceTypes.Manifest)
      return false;

    // Ignore non-images and non-fonts.
    if (resourceType === Common.resourceTypes.Image && resource.mimeType && !resource.mimeType.startsWith('image'))
      return false;
    if (resourceType === Common.resourceTypes.Font && resource.mimeType && !resource.mimeType.includes('font'))
      return false;
    if ((resourceType === Common.resourceTypes.Image || resourceType === Common.resourceTypes.Font) &&
        resource.contentURL().startsWith('data:'))
      return false;
    return true;
  }

  /**
   * @param {!Common.Event} event
   */
  _resourceAdded(event) {
    const resource = /** @type {!SDK.Resource} */ (event.data);
    if (!this._acceptsResource(resource))
      return;

    let binding = this._bindings.get(resource.url);
    if (!binding) {
      binding = new Bindings.ResourceMapping.Binding(this._project, resource);
      this._bindings.set(resource.url, binding);
    } else {
      binding.addResource(resource);
    }
  }

  /**
   * @param {!SDK.ResourceTreeFrame} frame
   */
  _removeFrameResources(frame) {
    for (const resource of frame.resources()) {
      if (!this._acceptsResource(resource))
        continue;
      const binding = this._bindings.get(resource.url);
      if (binding._resources.size === 1) {
        binding.dispose();
        this._bindings.delete(resource.url);
      } else {
        binding.removeResource(resource);
      }
    }
  }

  /**
   * @param {!Common.Event} event
   */
  _frameWillNavigate(event) {
    const frame = /** @type {!SDK.ResourceTreeFrame} */ (event.data);
    this._removeFrameResources(frame);
  }

  /**
   * @param {!Common.Event} event
   */
  _frameDetached(event) {
    const frame = /** @type {!SDK.ResourceTreeFrame} */ (event.data);
    this._removeFrameResources(frame);
  }

  _resetForTest() {
    for (const binding of this._bindings.valuesArray())
      binding.dispose();
    this._bindings.clear();
  }

  dispose() {
    Common.EventTarget.removeEventListeners(this._eventListeners);
    for (const binding of this._bindings.valuesArray())
      binding.dispose();
    this._bindings.clear();
    this._project.removeProject();
  }
};

/**
 * @implements {Common.ContentProvider}
 */
Bindings.ResourceMapping.Binding = class {
  /**
   * @param {!Bindings.ContentProviderBasedProject} project
   * @param {!SDK.Resource} resource
   */
  constructor(project, resource) {
    this._resources = new Set([resource]);
    this._project = project;
    this._uiSourceCode = this._project.createUISourceCode(resource.url, resource.contentType());
    this._uiSourceCode[Bindings.ResourceMapping._symbol] = true;
    Bindings.NetworkProject.setInitialFrameAttribution(this._uiSourceCode, resource.frameId);
    this._project.addUISourceCodeWithProvider(
        this._uiSourceCode, this, Bindings.resourceMetadata(resource), resource.mimeType);
    /** @type {!Array<{stylesheet: !SDK.CSSStyleSheetHeader, edit: !SDK.CSSModel.Edit}>} */
    this._edits = [];
  }

  /**
   * @return {!Array<!SDK.CSSStyleSheetHeader>}
   */
  _inlineStyles() {
    const target = Bindings.NetworkProject.targetForUISourceCode(this._uiSourceCode);
    const cssModel = target.model(SDK.CSSModel);
    const stylesheets = [];
    if (cssModel) {
      for (const headerId of cssModel.styleSheetIdsForURL(this._uiSourceCode.url())) {
        const header = cssModel.styleSheetHeaderForId(headerId);
        if (header)
          stylesheets.push(header);
      }
    }
    return stylesheets;
  }

  /**
   * @return {!Array<!SDK.Script>}
   */
  _inlineScripts() {
    const target = Bindings.NetworkProject.targetForUISourceCode(this._uiSourceCode);
    const debuggerModel = target.model(SDK.DebuggerModel);
    if (!debuggerModel)
      return [];
    return debuggerModel.scriptsForSourceURL(this._uiSourceCode.url());
  }

  /**
   * @param {!SDK.CSSStyleSheetHeader} stylesheet
   * @param {!SDK.CSSModel.Edit} edit
   */
  async _styleSheetChanged(stylesheet, edit) {
    this._edits.push({stylesheet, edit});
    if (this._edits.length > 1)
      return;  // There is already a _styleSheetChanged loop running

    const content = await this._uiSourceCode.requestContent();
    if (content !== null)
      this._innerStyleSheetChanged(content);
    this._edits = [];
  }

  /**
   * @param {string} content
   */
  _innerStyleSheetChanged(content) {
    const scripts = this._inlineScripts();
    const styles = this._inlineStyles();
    let text = new TextUtils.Text(content);
    for (const data of this._edits) {
      const edit = data.edit;
      const stylesheet = data.stylesheet;
      const startLocation = stylesheet[Bindings.ResourceMapping._offsetSymbol] ||
          TextUtils.TextRange.createFromLocation(stylesheet.startLine, stylesheet.startColumn);

      const oldRange = edit.oldRange.relativeFrom(startLocation.startLine, startLocation.startColumn);
      const newRange = edit.newRange.relativeFrom(startLocation.startLine, startLocation.startColumn);
      text = new TextUtils.Text(text.replaceRange(oldRange, edit.newText));
      for (const script of scripts) {
        const scriptOffset = script[Bindings.ResourceMapping._offsetSymbol] ||
            TextUtils.TextRange.createFromLocation(script.lineOffset, script.columnOffset);
        if (!scriptOffset.follows(oldRange))
          continue;
        script[Bindings.ResourceMapping._offsetSymbol] = scriptOffset.rebaseAfterTextEdit(oldRange, newRange);
        Bindings.debuggerWorkspaceBinding.updateLocations(script);
      }
      for (const style of styles) {
        const styleOffset = style[Bindings.ResourceMapping._offsetSymbol] ||
            TextUtils.TextRange.createFromLocation(style.startLine, style.startColumn);
        if (!styleOffset.follows(oldRange))
          continue;
        style[Bindings.ResourceMapping._offsetSymbol] = styleOffset.rebaseAfterTextEdit(oldRange, newRange);
        Bindings.cssWorkspaceBinding.updateLocations(style);
      }
    }
    this._uiSourceCode.addRevision(text.value());
  }

  /**
   * @param {!SDK.Resource} resource
   */
  addResource(resource) {
    this._resources.add(resource);
    Bindings.NetworkProject.addFrameAttribution(this._uiSourceCode, resource.frameId);
  }

  /**
   * @param {!SDK.Resource} resource
   */
  removeResource(resource) {
    this._resources.delete(resource);
    Bindings.NetworkProject.removeFrameAttribution(this._uiSourceCode, resource.frameId);
  }

  dispose() {
    this._project.removeFile(this._uiSourceCode.url());
  }

  /**
   * @override
   * @return {string}
   */
  contentURL() {
    return this._resources.firstValue().contentURL();
  }

  /**
   * @override
   * @return {!Common.ResourceType}
   */
  contentType() {
    return this._resources.firstValue().contentType();
  }

  /**
   * @override
   * @return {!Promise<boolean>}
   */
  contentEncoded() {
    return this._resources.firstValue().contentEncoded();
  }

  /**
   * @override
   * @return {!Promise<?string>}
   */
  requestContent() {
    return this._resources.firstValue().requestContent();
  }

  /**
   * @override
   * @param {string} query
   * @param {boolean} caseSensitive
   * @param {boolean} isRegex
   * @return {!Promise<!Array<!Common.ContentProvider.SearchMatch>>}
   */
  searchInContent(query, caseSensitive, isRegex) {
    return this._resources.firstValue().searchInContent(query, caseSensitive, isRegex);
  }
};

Bindings.ResourceMapping._symbol = Symbol('Bindings.ResourceMapping._symbol');
Bindings.ResourceMapping._offsetSymbol = Symbol('Bindings.ResourceMapping._offsetSymbol');