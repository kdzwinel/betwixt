// Copyright 2017 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * @implements {UI.ContextMenu.Provider}
 * @implements {UI.ActionDelegate}
 */
Profiler.HeapProfilerPanel = class extends Profiler.ProfilesPanel {
  constructor() {
    const registry = Profiler.ProfileTypeRegistry.instance;
    const profileTypes =
        [registry.heapSnapshotProfileType, registry.trackingHeapSnapshotProfileType, registry.samplingHeapProfileType];
    if (Runtime.experiments.isEnabled('nativeHeapProfiler')) {
      profileTypes.push(registry.samplingNativeHeapProfileType);
      profileTypes.push(registry.samplingNativeHeapSnapshotRendererType);
      profileTypes.push(registry.samplingNativeHeapSnapshotBrowserType);
    }
    super('heap_profiler', profileTypes, 'profiler.heap-toggle-recording');
  }

  /**
   * @override
   * @param {!Event} event
   * @param {!UI.ContextMenu} contextMenu
   * @param {!Object} target
   */
  appendApplicableItems(event, contextMenu, target) {
    if (!(target instanceof SDK.RemoteObject))
      return;

    if (!this.isShowing())
      return;

    const object = /** @type {!SDK.RemoteObject} */ (target);
    if (!object.objectId)
      return;
    const objectId = /** @type {string} */ (object.objectId);

    const heapProfiles = Profiler.ProfileTypeRegistry.instance.heapSnapshotProfileType.getProfiles();
    if (!heapProfiles.length)
      return;

    const heapProfilerModel = object.runtimeModel().heapProfilerModel();
    if (!heapProfilerModel)
      return;

    /**
     * @param {string} viewName
     * @this {Profiler.ProfilesPanel}
     */
    function revealInView(viewName) {
      heapProfilerModel.snapshotObjectIdForObjectId(objectId).then(result => {
        if (this.isShowing() && result)
          this.showObject(result, viewName);
      });
    }

    contextMenu.revealSection().appendItem(
        Common.UIString('Reveal in Summary view'), revealInView.bind(this, 'Summary'));
  }

  /**
   * @override
   * @param {!UI.Context} context
   * @param {string} actionId
   * @return {boolean}
   */
  handleAction(context, actionId) {
    const panel = UI.context.flavor(Profiler.HeapProfilerPanel);
    console.assert(panel && panel instanceof Profiler.HeapProfilerPanel);
    panel.toggleRecord();
    return true;
  }

  /**
   * @override
   */
  wasShown() {
    UI.context.setFlavor(Profiler.HeapProfilerPanel, this);
  }

  /**
   * @override
   */
  willHide() {
    UI.context.setFlavor(Profiler.HeapProfilerPanel, null);
  }

  /**
   * @override
   * @param {!Protocol.HeapProfiler.HeapSnapshotObjectId} snapshotObjectId
   * @param {string} perspectiveName
   */
  showObject(snapshotObjectId, perspectiveName) {
    const registry = Profiler.ProfileTypeRegistry.instance;
    const heapProfiles = registry.heapSnapshotProfileType.getProfiles();
    for (let i = 0; i < heapProfiles.length; i++) {
      const profile = heapProfiles[i];
      // FIXME: allow to choose snapshot if there are several options.
      if (profile.maxJSObjectId >= snapshotObjectId) {
        this.showProfile(profile);
        const view = this.viewForProfile(profile);
        view.selectLiveObject(perspectiveName, snapshotObjectId);
        break;
      }
    }
  }
};
