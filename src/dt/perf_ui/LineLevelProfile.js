// Copyright 2016 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
/**
 * @unrestricted
 */
PerfUI.LineLevelProfile = class {
  constructor() {
    this._locationPool = new Bindings.LiveLocationPool();
    this.reset();
  }

  /**
   * @return {!PerfUI.LineLevelProfile}
   */
  static instance() {
    if (!PerfUI.LineLevelProfile._instance)
      PerfUI.LineLevelProfile._instance = new PerfUI.LineLevelProfile();
    return PerfUI.LineLevelProfile._instance;
  }

  /**
   * @param {!SDK.CPUProfileDataModel} profile
   */
  appendCPUProfile(profile) {
    const nodesToGo = [profile.profileHead];
    const sampleDuration = (profile.profileEndTime - profile.profileStartTime) / profile.totalHitCount;
    while (nodesToGo.length) {
      const nodes = nodesToGo.pop().children;
      for (let i = 0; i < nodes.length; ++i) {
        const node = nodes[i];
        nodesToGo.push(node);
        if (!node.url || !node.positionTicks)
          continue;
        let fileInfo = this._files.get(node.url);
        if (!fileInfo) {
          fileInfo = new Map();
          this._files.set(node.url, fileInfo);
        }
        for (let j = 0; j < node.positionTicks.length; ++j) {
          const lineInfo = node.positionTicks[j];
          const line = lineInfo.line;
          const time = lineInfo.ticks * sampleDuration;
          fileInfo.set(line, (fileInfo.get(line) || 0) + time);
        }
      }
    }
    this._scheduleUpdate();
  }

  reset() {
    /** @type {!Map<string, !Map<number, number>>} */
    this._files = new Map();
    this._scheduleUpdate();
  }

  _scheduleUpdate() {
    if (this._updateTimer)
      return;
    this._updateTimer = setTimeout(() => {
      this._updateTimer = null;
      this._doUpdate();
    }, 0);
  }

  _doUpdate() {
    // TODO(alph): use scriptId instead of urls for the target.
    this._locationPool.disposeAll();
    Workspace.workspace.uiSourceCodes().forEach(
        uiSourceCode => uiSourceCode.removeDecorationsForType(PerfUI.LineLevelProfile.LineDecorator.type));
    for (const fileInfo of this._files) {
      const url = /** @type {string} */ (fileInfo[0]);
      const uiSourceCode = Workspace.workspace.uiSourceCodeForURL(url);
      if (!uiSourceCode)
        continue;
      const target = Bindings.NetworkProject.targetForUISourceCode(uiSourceCode) || SDK.targetManager.mainTarget();
      const debuggerModel = target ? target.model(SDK.DebuggerModel) : null;
      if (!debuggerModel)
        continue;
      for (const lineInfo of fileInfo[1]) {
        const line = lineInfo[0] - 1;
        const time = lineInfo[1];
        const rawLocation = debuggerModel.createRawLocationByURL(url, line, 0);
        if (rawLocation)
          new PerfUI.LineLevelProfile.Presentation(rawLocation, time, this._locationPool);
        else if (uiSourceCode)
          uiSourceCode.addLineDecoration(line, PerfUI.LineLevelProfile.LineDecorator.type, time);
      }
    }
  }
};


/**
 * @unrestricted
 */
PerfUI.LineLevelProfile.Presentation = class {
  /**
   * @param {!SDK.DebuggerModel.Location} rawLocation
   * @param {number} time
   * @param {!Bindings.LiveLocationPool} locationPool
   */
  constructor(rawLocation, time, locationPool) {
    this._time = time;
    Bindings.debuggerWorkspaceBinding.createLiveLocation(rawLocation, this.updateLocation.bind(this), locationPool);
  }

  /**
   * @param {!Bindings.LiveLocation} liveLocation
   */
  updateLocation(liveLocation) {
    if (this._uiLocation)
      this._uiLocation.uiSourceCode.removeDecorationsForType(PerfUI.LineLevelProfile.LineDecorator.type);
    this._uiLocation = liveLocation.uiLocation();
    if (this._uiLocation) {
      this._uiLocation.uiSourceCode.addLineDecoration(
          this._uiLocation.lineNumber, PerfUI.LineLevelProfile.LineDecorator.type, this._time);
    }
  }
};

/**
 * @implements {SourceFrame.LineDecorator}
 * @unrestricted
 */
PerfUI.LineLevelProfile.LineDecorator = class {
  /**
   * @override
   * @param {!Workspace.UISourceCode} uiSourceCode
   * @param {!TextEditor.CodeMirrorTextEditor} textEditor
   */
  decorate(uiSourceCode, textEditor) {
    const gutterType = 'CodeMirror-gutter-performance';
    const decorations = uiSourceCode.decorationsForType(PerfUI.LineLevelProfile.LineDecorator.type);
    textEditor.uninstallGutter(gutterType);
    if (!decorations || !decorations.size)
      return;
    textEditor.installGutter(gutterType, false);
    for (const decoration of decorations) {
      const time = /** @type {number} */ (decoration.data());
      const text = Common.UIString('%.1f\xa0ms', time);
      const intensity = Number.constrain(Math.log10(1 + 2 * time) / 5, 0.02, 1);
      const element = createElementWithClass('div', 'text-editor-line-marker-performance');
      element.textContent = text;
      element.style.backgroundColor = `hsla(44, 100%, 50%, ${intensity.toFixed(3)})`;
      textEditor.setGutterDecoration(decoration.range().startLine, gutterType, element);
    }
  }
};

PerfUI.LineLevelProfile.LineDecorator.type = 'performance';
