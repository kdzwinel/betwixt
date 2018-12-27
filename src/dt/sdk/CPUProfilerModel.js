/*
 * Copyright (C) 2014 Google Inc. All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are
 * met:
 *
 * 1. Redistributions of source code must retain the above copyright
 * notice, this list of conditions and the following disclaimer.
 *
 * 2. Redistributions in binary form must reproduce the above
 * copyright notice, this list of conditions and the following disclaimer
 * in the documentation and/or other materials provided with the
 * distribution.
 *
 * THIS SOFTWARE IS PROVIDED BY GOOGLE INC. AND ITS CONTRIBUTORS
 * "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT
 * LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR
 * A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL GOOGLE INC.
 * OR ITS CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL,
 * SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT
 * LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE,
 * DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY
 * THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
 * OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */

/**
 * @implements {Protocol.ProfilerDispatcher}
 */
SDK.CPUProfilerModel = class extends SDK.SDKModel {
  /**
   * @param {!SDK.Target} target
   */
  constructor(target) {
    super(target);
    this._isRecording = false;
    this._nextAnonymousConsoleProfileNumber = 1;
    this._anonymousConsoleProfileIdToTitle = new Map();
    this._profilerAgent = target.profilerAgent();
    target.registerProfilerDispatcher(this);
    this._profilerAgent.enable();
    this._debuggerModel = /** @type {!SDK.DebuggerModel} */ (target.model(SDK.DebuggerModel));
  }

  /**
   * @return {!SDK.RuntimeModel}
   */
  runtimeModel() {
    return this._debuggerModel.runtimeModel();
  }

  /**
   * @return {!SDK.DebuggerModel}
   */
  debuggerModel() {
    return this._debuggerModel;
  }

  /**
   * @override
   * @param {string} id
   * @param {!Protocol.Debugger.Location} scriptLocation
   * @param {string=} title
   */
  consoleProfileStarted(id, scriptLocation, title) {
    if (!title) {
      title = Common.UIString('Profile %d', this._nextAnonymousConsoleProfileNumber++);
      this._anonymousConsoleProfileIdToTitle.set(id, title);
    }
    this._dispatchProfileEvent(SDK.CPUProfilerModel.Events.ConsoleProfileStarted, id, scriptLocation, title);
  }

  /**
   * @override
   * @param {string} id
   * @param {!Protocol.Debugger.Location} scriptLocation
   * @param {!Protocol.Profiler.Profile} cpuProfile
   * @param {string=} title
   */
  consoleProfileFinished(id, scriptLocation, cpuProfile, title) {
    if (!title) {
      title = this._anonymousConsoleProfileIdToTitle.get(id);
      this._anonymousConsoleProfileIdToTitle.delete(id);
    }
    // Make sure ProfilesPanel is initialized and CPUProfileType is created.
    self.runtime.loadModulePromise('profiler').then(() => {
      this._dispatchProfileEvent(
          SDK.CPUProfilerModel.Events.ConsoleProfileFinished, id, scriptLocation, title, cpuProfile);
    });
  }

  /**
   * @param {symbol} eventName
   * @param {string} id
   * @param {!Protocol.Debugger.Location} scriptLocation
   * @param {string=} title
   * @param {!Protocol.Profiler.Profile=} cpuProfile
   */
  _dispatchProfileEvent(eventName, id, scriptLocation, title, cpuProfile) {
    const debuggerLocation = SDK.DebuggerModel.Location.fromPayload(this._debuggerModel, scriptLocation);
    const globalId = this.target().id() + '.' + id;
    const data = /** @type {!SDK.CPUProfilerModel.EventData} */ (
        {id: globalId, scriptLocation: debuggerLocation, cpuProfile: cpuProfile, title: title, cpuProfilerModel: this});
    this.dispatchEventToListeners(eventName, data);
  }

  /**
   * @return {boolean}
   */
  isRecordingProfile() {
    return this._isRecording;
  }

  /**
   * @return {!Promise}
   */
  startRecording() {
    this._isRecording = true;
    const intervalUs = Common.moduleSetting('highResolutionCpuProfiling').get() ? 100 : 1000;
    this._profilerAgent.setSamplingInterval(intervalUs);
    return this._profilerAgent.start();
  }

  /**
   * @return {!Promise<?Protocol.Profiler.Profile>}
   */
  stopRecording() {
    this._isRecording = false;
    return this._profilerAgent.stop();
  }

  /**
   * @return {!Promise}
   */
  startPreciseCoverage() {
    const callCount = false;
    const detailed = true;
    return this._profilerAgent.startPreciseCoverage(callCount, detailed);
  }

  /**
   * @return {!Promise<!Array<!Protocol.Profiler.ScriptCoverage>>}
   */
  takePreciseCoverage() {
    return this._profilerAgent.takePreciseCoverage().then(result => result || []);
  }

  /**
   * @return {!Promise}
   */
  stopPreciseCoverage() {
    return this._profilerAgent.stopPreciseCoverage();
  }

  /**
   * @return {!Promise<!Array<!Protocol.Profiler.ScriptCoverage>>}
   */
  bestEffortCoverage() {
    return this._profilerAgent.getBestEffortCoverage().then(result => result || []);
  }
};

SDK.SDKModel.register(SDK.CPUProfilerModel, SDK.Target.Capability.JS, true);

/** @enum {symbol} */
SDK.CPUProfilerModel.Events = {
  ConsoleProfileStarted: Symbol('ConsoleProfileStarted'),
  ConsoleProfileFinished: Symbol('ConsoleProfileFinished')
};

/** @typedef {!{id: string, scriptLocation: !SDK.DebuggerModel.Location, title: string, cpuProfile: (!Protocol.Profiler.Profile|undefined), cpuProfilerModel: !SDK.CPUProfilerModel}} */
SDK.CPUProfilerModel.EventData;
