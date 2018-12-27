// Copyright 2018 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * @override
 */
Audits2.ReportRenderer = class extends ReportRenderer {
  /**
   * @param {!Element} el Parent element to render the report into.
   * @param {!ReportRenderer.RunnerResultArtifacts=} artifacts
   */
  static addViewTraceButton(el, artifacts) {
    if (!artifacts || !artifacts.traces || !artifacts.traces.defaultPass)
      return;

    const defaultPassTrace = artifacts.traces.defaultPass;
    const timelineButton = UI.createTextButton(Common.UIString('View Trace'), onViewTraceClick, 'view-trace');
    el.querySelector('.lh-column').appendChild(timelineButton);
    return el;

    async function onViewTraceClick() {
      Host.userMetrics.actionTaken(Host.UserMetrics.Action.Audits2ViewTrace);
      await UI.inspectorView.showPanel('timeline');
      Timeline.TimelinePanel.instance().loadFromEvents(defaultPassTrace.traceEvents);
    }
  }

  /**
   * @param {!Element} el
   */
  static async linkifyNodeDetails(el) {
    const mainTarget = SDK.targetManager.mainTarget();
    const resourceTreeModel = mainTarget.model(SDK.ResourceTreeModel);
    await resourceTreeModel.once(SDK.ResourceTreeModel.Events.Load);

    const domModel = mainTarget.model(SDK.DOMModel);

    for (const origElement of el.getElementsByClassName('lh-node')) {
      /** @type {!DetailsRenderer.NodeDetailsJSON} */
      const detailsItem = origElement.dataset;
      if (!detailsItem.path)
        continue;

      const nodeId = await domModel.pushNodeByPathToFrontend(detailsItem.path);

      if (!nodeId)
        continue;
      const node = domModel.nodeForId(nodeId);
      if (!node)
        continue;

      const element =
          await Common.Linkifier.linkify(node, /** @type {!Common.Linkifier.Options} */ ({title: detailsItem.snippet}));
      origElement.title = '';
      origElement.textContent = '';
      origElement.appendChild(element);
    }
  }
};

class ReportUIFeatures {
  /**
   * @param {!ReportRenderer.ReportJSON} report
   */
  initFeatures(report) {
  }
}
