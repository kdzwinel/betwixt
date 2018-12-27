/*
 * Copyright (C) 2013 Google Inc. All rights reserved.
 * Copyright (C) 2012 Intel Inc. All rights reserved.
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
Timeline.TimelineUIUtils = class {
  /**
   * @return {!Object.<string, !Timeline.TimelineRecordStyle>}
   */
  static _initEventStyles() {
    if (Timeline.TimelineUIUtils._eventStylesMap)
      return Timeline.TimelineUIUtils._eventStylesMap;

    const recordTypes = TimelineModel.TimelineModel.RecordType;
    const categories = Timeline.TimelineUIUtils.categories();

    const eventStyles = {};
    eventStyles[recordTypes.Task] = new Timeline.TimelineRecordStyle(Common.UIString('Task'), categories['other']);
    eventStyles[recordTypes.Program] = new Timeline.TimelineRecordStyle(Common.UIString('Other'), categories['other']);
    eventStyles[recordTypes.Animation] =
        new Timeline.TimelineRecordStyle(Common.UIString('Animation'), categories['rendering']);
    eventStyles[recordTypes.EventDispatch] =
        new Timeline.TimelineRecordStyle(Common.UIString('Event'), categories['scripting']);
    eventStyles[recordTypes.RequestMainThreadFrame] =
        new Timeline.TimelineRecordStyle(Common.UIString('Request Main Thread Frame'), categories['rendering'], true);
    eventStyles[recordTypes.BeginFrame] =
        new Timeline.TimelineRecordStyle(Common.UIString('Frame Start'), categories['rendering'], true);
    eventStyles[recordTypes.BeginMainThreadFrame] =
        new Timeline.TimelineRecordStyle(Common.UIString('Frame Start (main thread)'), categories['rendering'], true);
    eventStyles[recordTypes.DrawFrame] =
        new Timeline.TimelineRecordStyle(Common.UIString('Draw Frame'), categories['rendering'], true);
    eventStyles[recordTypes.HitTest] =
        new Timeline.TimelineRecordStyle(Common.UIString('Hit Test'), categories['rendering']);
    eventStyles[recordTypes.ScheduleStyleRecalculation] = new Timeline.TimelineRecordStyle(
        Common.UIString('Schedule Style Recalculation'), categories['rendering'], true);
    eventStyles[recordTypes.RecalculateStyles] =
        new Timeline.TimelineRecordStyle(Common.UIString('Recalculate Style'), categories['rendering']);
    eventStyles[recordTypes.UpdateLayoutTree] =
        new Timeline.TimelineRecordStyle(Common.UIString('Recalculate Style'), categories['rendering']);
    eventStyles[recordTypes.InvalidateLayout] =
        new Timeline.TimelineRecordStyle(Common.UIString('Invalidate Layout'), categories['rendering'], true);
    eventStyles[recordTypes.Layout] =
        new Timeline.TimelineRecordStyle(Common.UIString('Layout'), categories['rendering']);
    eventStyles[recordTypes.PaintSetup] =
        new Timeline.TimelineRecordStyle(Common.UIString('Paint Setup'), categories['painting']);
    eventStyles[recordTypes.PaintImage] =
        new Timeline.TimelineRecordStyle(Common.UIString('Paint Image'), categories['painting'], true);
    eventStyles[recordTypes.UpdateLayer] =
        new Timeline.TimelineRecordStyle(Common.UIString('Update Layer'), categories['painting'], true);
    eventStyles[recordTypes.UpdateLayerTree] =
        new Timeline.TimelineRecordStyle(Common.UIString('Update Layer Tree'), categories['rendering']);
    eventStyles[recordTypes.Paint] = new Timeline.TimelineRecordStyle(Common.UIString('Paint'), categories['painting']);
    eventStyles[recordTypes.RasterTask] =
        new Timeline.TimelineRecordStyle(Common.UIString('Rasterize Paint'), categories['painting']);
    eventStyles[recordTypes.ScrollLayer] =
        new Timeline.TimelineRecordStyle(Common.UIString('Scroll'), categories['rendering']);
    eventStyles[recordTypes.CompositeLayers] =
        new Timeline.TimelineRecordStyle(Common.UIString('Composite Layers'), categories['painting']);
    eventStyles[recordTypes.ParseHTML] =
        new Timeline.TimelineRecordStyle(Common.UIString('Parse HTML'), categories['loading']);
    eventStyles[recordTypes.ParseAuthorStyleSheet] =
        new Timeline.TimelineRecordStyle(Common.UIString('Parse Stylesheet'), categories['loading']);
    eventStyles[recordTypes.TimerInstall] =
        new Timeline.TimelineRecordStyle(Common.UIString('Install Timer'), categories['scripting']);
    eventStyles[recordTypes.TimerRemove] =
        new Timeline.TimelineRecordStyle(Common.UIString('Remove Timer'), categories['scripting']);
    eventStyles[recordTypes.TimerFire] =
        new Timeline.TimelineRecordStyle(Common.UIString('Timer Fired'), categories['scripting']);
    eventStyles[recordTypes.XHRReadyStateChange] =
        new Timeline.TimelineRecordStyle(Common.UIString('XHR Ready State Change'), categories['scripting']);
    eventStyles[recordTypes.XHRLoad] =
        new Timeline.TimelineRecordStyle(Common.UIString('XHR Load'), categories['scripting']);
    eventStyles[recordTypes.CompileScript] =
        new Timeline.TimelineRecordStyle(Common.UIString('Compile Script'), categories['scripting']);
    eventStyles[recordTypes.EvaluateScript] =
        new Timeline.TimelineRecordStyle(Common.UIString('Evaluate Script'), categories['scripting']);
    eventStyles[recordTypes.CompileModule] =
        new Timeline.TimelineRecordStyle(Common.UIString('Compile Module'), categories['scripting']);
    eventStyles[recordTypes.EvaluateModule] =
        new Timeline.TimelineRecordStyle(Common.UIString('Evaluate Module'), categories['scripting']);
    eventStyles[recordTypes.ParseScriptOnBackground] =
        new Timeline.TimelineRecordStyle(Common.UIString('Parse Script'), categories['scripting']);
    eventStyles[recordTypes.FrameStartedLoading] =
        new Timeline.TimelineRecordStyle(ls`Frame Started Loading`, categories['loading'], true);
    eventStyles[recordTypes.MarkLoad] =
        new Timeline.TimelineRecordStyle(ls`Onload Event`, categories['scripting'], true);
    eventStyles[recordTypes.MarkDOMContent] =
        new Timeline.TimelineRecordStyle(ls`DOMContentLoaded Event`, categories['scripting'], true);
    eventStyles[recordTypes.MarkFirstPaint] =
        new Timeline.TimelineRecordStyle(ls`First Paint`, categories['painting'], true);
    eventStyles[recordTypes.MarkFCP] =
        new Timeline.TimelineRecordStyle(ls`First Contentful Paint`, categories['rendering'], true);
    eventStyles[recordTypes.MarkFMP] =
        new Timeline.TimelineRecordStyle(ls`First Meaningful Paint`, categories['rendering'], true);
    eventStyles[recordTypes.TimeStamp] =
        new Timeline.TimelineRecordStyle(Common.UIString('Timestamp'), categories['scripting']);
    eventStyles[recordTypes.ConsoleTime] =
        new Timeline.TimelineRecordStyle(Common.UIString('Console Time'), categories['scripting']);
    eventStyles[recordTypes.UserTiming] =
        new Timeline.TimelineRecordStyle(Common.UIString('User Timing'), categories['scripting']);
    eventStyles[recordTypes.ResourceSendRequest] =
        new Timeline.TimelineRecordStyle(Common.UIString('Send Request'), categories['loading']);
    eventStyles[recordTypes.ResourceReceiveResponse] =
        new Timeline.TimelineRecordStyle(Common.UIString('Receive Response'), categories['loading']);
    eventStyles[recordTypes.ResourceFinish] =
        new Timeline.TimelineRecordStyle(Common.UIString('Finish Loading'), categories['loading']);
    eventStyles[recordTypes.ResourceReceivedData] =
        new Timeline.TimelineRecordStyle(Common.UIString('Receive Data'), categories['loading']);
    eventStyles[recordTypes.RunMicrotasks] =
        new Timeline.TimelineRecordStyle(Common.UIString('Run Microtasks'), categories['scripting']);
    eventStyles[recordTypes.FunctionCall] =
        new Timeline.TimelineRecordStyle(Common.UIString('Function Call'), categories['scripting']);
    eventStyles[recordTypes.GCEvent] =
        new Timeline.TimelineRecordStyle(Common.UIString('GC Event'), categories['scripting']);
    eventStyles[recordTypes.MajorGC] =
        new Timeline.TimelineRecordStyle(Common.UIString('Major GC'), categories['scripting']);
    eventStyles[recordTypes.MinorGC] =
        new Timeline.TimelineRecordStyle(Common.UIString('Minor GC'), categories['scripting']);
    eventStyles[recordTypes.JSFrame] =
        new Timeline.TimelineRecordStyle(Common.UIString('JS Frame'), categories['scripting']);
    eventStyles[recordTypes.RequestAnimationFrame] =
        new Timeline.TimelineRecordStyle(Common.UIString('Request Animation Frame'), categories['scripting']);
    eventStyles[recordTypes.CancelAnimationFrame] =
        new Timeline.TimelineRecordStyle(Common.UIString('Cancel Animation Frame'), categories['scripting']);
    eventStyles[recordTypes.FireAnimationFrame] =
        new Timeline.TimelineRecordStyle(Common.UIString('Animation Frame Fired'), categories['scripting']);
    eventStyles[recordTypes.RequestIdleCallback] =
        new Timeline.TimelineRecordStyle(Common.UIString('Request Idle Callback'), categories['scripting']);
    eventStyles[recordTypes.CancelIdleCallback] =
        new Timeline.TimelineRecordStyle(Common.UIString('Cancel Idle Callback'), categories['scripting']);
    eventStyles[recordTypes.FireIdleCallback] =
        new Timeline.TimelineRecordStyle(Common.UIString('Fire Idle Callback'), categories['scripting']);
    eventStyles[recordTypes.WebSocketCreate] =
        new Timeline.TimelineRecordStyle(Common.UIString('Create WebSocket'), categories['scripting']);
    eventStyles[recordTypes.WebSocketSendHandshakeRequest] =
        new Timeline.TimelineRecordStyle(Common.UIString('Send WebSocket Handshake'), categories['scripting']);
    eventStyles[recordTypes.WebSocketReceiveHandshakeResponse] =
        new Timeline.TimelineRecordStyle(Common.UIString('Receive WebSocket Handshake'), categories['scripting']);
    eventStyles[recordTypes.WebSocketDestroy] =
        new Timeline.TimelineRecordStyle(Common.UIString('Destroy WebSocket'), categories['scripting']);
    eventStyles[recordTypes.EmbedderCallback] =
        new Timeline.TimelineRecordStyle(Common.UIString('Embedder Callback'), categories['scripting']);
    eventStyles[recordTypes.DecodeImage] =
        new Timeline.TimelineRecordStyle(Common.UIString('Image Decode'), categories['painting']);
    eventStyles[recordTypes.ResizeImage] =
        new Timeline.TimelineRecordStyle(Common.UIString('Image Resize'), categories['painting']);
    eventStyles[recordTypes.GPUTask] = new Timeline.TimelineRecordStyle(Common.UIString('GPU'), categories['gpu']);
    eventStyles[recordTypes.LatencyInfo] =
        new Timeline.TimelineRecordStyle(Common.UIString('Input Latency'), categories['scripting']);

    eventStyles[recordTypes.GCCollectGarbage] =
        new Timeline.TimelineRecordStyle(Common.UIString('DOM GC'), categories['scripting']);

    eventStyles[recordTypes.CryptoDoEncrypt] =
        new Timeline.TimelineRecordStyle(Common.UIString('Encrypt'), categories['scripting']);
    eventStyles[recordTypes.CryptoDoEncryptReply] =
        new Timeline.TimelineRecordStyle(Common.UIString('Encrypt Reply'), categories['scripting']);
    eventStyles[recordTypes.CryptoDoDecrypt] =
        new Timeline.TimelineRecordStyle(Common.UIString('Decrypt'), categories['scripting']);
    eventStyles[recordTypes.CryptoDoDecryptReply] =
        new Timeline.TimelineRecordStyle(Common.UIString('Decrypt Reply'), categories['scripting']);
    eventStyles[recordTypes.CryptoDoDigest] =
        new Timeline.TimelineRecordStyle(Common.UIString('Digest'), categories['scripting']);
    eventStyles[recordTypes.CryptoDoDigestReply] =
        new Timeline.TimelineRecordStyle(Common.UIString('Digest Reply'), categories['scripting']);
    eventStyles[recordTypes.CryptoDoSign] =
        new Timeline.TimelineRecordStyle(Common.UIString('Sign'), categories['scripting']);
    eventStyles[recordTypes.CryptoDoSignReply] =
        new Timeline.TimelineRecordStyle(Common.UIString('Sign Reply'), categories['scripting']);
    eventStyles[recordTypes.CryptoDoVerify] =
        new Timeline.TimelineRecordStyle(Common.UIString('Verify'), categories['scripting']);
    eventStyles[recordTypes.CryptoDoVerifyReply] =
        new Timeline.TimelineRecordStyle(Common.UIString('Verify Reply'), categories['scripting']);

    eventStyles[recordTypes.AsyncTask] =
        new Timeline.TimelineRecordStyle(Common.UIString('Async Task'), categories['async']);

    Timeline.TimelineUIUtils._eventStylesMap = eventStyles;
    return eventStyles;
  }

  /**
   * @param {!TimelineModel.TimelineIRModel.InputEvents} inputEventType
   * @return {?string}
   */
  static inputEventDisplayName(inputEventType) {
    if (!Timeline.TimelineUIUtils._inputEventToDisplayName) {
      const inputEvent = TimelineModel.TimelineIRModel.InputEvents;

      /** @type {!Map<!TimelineModel.TimelineIRModel.InputEvents, string>} */
      Timeline.TimelineUIUtils._inputEventToDisplayName = new Map([
        [inputEvent.Char, Common.UIString('Key Character')],
        [inputEvent.KeyDown, Common.UIString('Key Down')],
        [inputEvent.KeyDownRaw, Common.UIString('Key Down')],
        [inputEvent.KeyUp, Common.UIString('Key Up')],
        [inputEvent.Click, Common.UIString('Click')],
        [inputEvent.ContextMenu, Common.UIString('Context Menu')],
        [inputEvent.MouseDown, Common.UIString('Mouse Down')],
        [inputEvent.MouseMove, Common.UIString('Mouse Move')],
        [inputEvent.MouseUp, Common.UIString('Mouse Up')],
        [inputEvent.MouseWheel, Common.UIString('Mouse Wheel')],
        [inputEvent.ScrollBegin, Common.UIString('Scroll Begin')],
        [inputEvent.ScrollEnd, Common.UIString('Scroll End')],
        [inputEvent.ScrollUpdate, Common.UIString('Scroll Update')],
        [inputEvent.FlingStart, Common.UIString('Fling Start')],
        [inputEvent.FlingCancel, Common.UIString('Fling Halt')],
        [inputEvent.Tap, Common.UIString('Tap')],
        [inputEvent.TapCancel, Common.UIString('Tap Halt')],
        [inputEvent.ShowPress, Common.UIString('Tap Begin')],
        [inputEvent.TapDown, Common.UIString('Tap Down')],
        [inputEvent.TouchCancel, Common.UIString('Touch Cancel')],
        [inputEvent.TouchEnd, Common.UIString('Touch End')],
        [inputEvent.TouchMove, Common.UIString('Touch Move')],
        [inputEvent.TouchStart, Common.UIString('Touch Start')],
        [inputEvent.PinchBegin, Common.UIString('Pinch Begin')],
        [inputEvent.PinchEnd, Common.UIString('Pinch End')],
        [inputEvent.PinchUpdate, Common.UIString('Pinch Update')]
      ]);
    }
    return Timeline.TimelineUIUtils._inputEventToDisplayName.get(inputEventType) || null;
  }

  /**
   * @param {!Protocol.Runtime.CallFrame} frame
   * @return {string}
   */
  static frameDisplayName(frame) {
    if (!TimelineModel.TimelineJSProfileProcessor.isNativeRuntimeFrame(frame))
      return UI.beautifyFunctionName(frame.functionName);
    const nativeGroup = TimelineModel.TimelineJSProfileProcessor.nativeGroup(frame.functionName);
    const groups = TimelineModel.TimelineJSProfileProcessor.NativeGroups;
    switch (nativeGroup) {
      case groups.Compile:
        return Common.UIString('Compile');
      case groups.Parse:
        return Common.UIString('Parse');
    }
    return frame.functionName;
  }

  /**
   * @param {!SDK.TracingModel.Event} traceEvent
   * @param {!RegExp} regExp
   * @return {boolean}
   */
  static testContentMatching(traceEvent, regExp) {
    const title = Timeline.TimelineUIUtils.eventStyle(traceEvent).title;
    const tokens = [title];
    const url = TimelineModel.TimelineData.forEvent(traceEvent).url;
    if (url)
      tokens.push(url);
    appendObjectProperties(traceEvent.args, 2);
    return regExp.test(tokens.join('|'));

    /**
     * @param {!Object} object
     * @param {number} depth
     */
    function appendObjectProperties(object, depth) {
      if (!depth)
        return;
      for (const key in object) {
        const value = object[key];
        const type = typeof value;
        if (type === 'string')
          tokens.push(value);
        else if (type === 'number')
          tokens.push(String(value));
        else if (type === 'object')
          appendObjectProperties(value, depth - 1);
      }
    }
  }

  /**
   * @param {!SDK.TracingModel.Event} event
   * @return {?string}
   */
  static eventURL(event) {
    const data = event.args['data'] || event.args['beginData'];
    const url = data && data.url;
    if (url)
      return url;
    const stackTrace = data && data['stackTrace'];
    const frame =
        stackTrace && stackTrace.length && stackTrace[0] || TimelineModel.TimelineData.forEvent(event).topFrame();
    return frame && frame.url || null;
  }

  /**
   * @param {!SDK.TracingModel.Event} event
   * @return {!{title: string, category: !Timeline.TimelineCategory}}
   */
  static eventStyle(event) {
    const eventStyles = Timeline.TimelineUIUtils._initEventStyles();
    if (event.hasCategory(TimelineModel.TimelineModel.Category.Console) ||
        event.hasCategory(TimelineModel.TimelineModel.Category.UserTiming))
      return {title: event.name, category: Timeline.TimelineUIUtils.categories()['scripting']};

    if (event.hasCategory(TimelineModel.TimelineModel.Category.LatencyInfo)) {
      /** @const */
      const prefix = 'InputLatency::';
      const inputEventType = event.name.startsWith(prefix) ? event.name.substr(prefix.length) : event.name;
      const displayName = Timeline.TimelineUIUtils.inputEventDisplayName(
          /** @type {!TimelineModel.TimelineIRModel.InputEvents} */ (inputEventType));
      return {title: displayName || inputEventType, category: Timeline.TimelineUIUtils.categories()['scripting']};
    }
    let result = eventStyles[event.name];
    if (!result) {
      result = new Timeline.TimelineRecordStyle(event.name, Timeline.TimelineUIUtils.categories()['other'], true);
      eventStyles[event.name] = result;
    }
    return result;
  }

  /**
   * @param {!SDK.TracingModel.Event} event
   * @return {string}
   */
  static eventColor(event) {
    if (event.name === TimelineModel.TimelineModel.RecordType.JSFrame) {
      const frame = event.args['data'];
      if (Timeline.TimelineUIUtils.isUserFrame(frame))
        return Timeline.TimelineUIUtils.colorForId(frame.url);
    }
    return Timeline.TimelineUIUtils.eventStyle(event).category.color;
  }

  /**
   * @param {!ProductRegistry.Registry} productRegistry
   * @param {!TimelineModel.TimelineModel} model
   * @param {!Map<string, string>} urlToColorCache
   * @param {!SDK.TracingModel.Event} event
   * @return {string}
   */
  static eventColorByProduct(productRegistry, model, urlToColorCache, event) {
    const url = Timeline.TimelineUIUtils.eventURL(event) || '';
    let color = urlToColorCache.get(url);
    if (color)
      return color;
    const defaultColor = '#f2ecdc';
    const parsedURL = url.asParsedURL();
    if (!parsedURL)
      return defaultColor;
    let name = productRegistry && productRegistry.nameForUrl(parsedURL);
    if (!name) {
      name = parsedURL.host;
      const rootFrames = model.rootFrames();
      if (rootFrames.some(pageFrame => new Common.ParsedURL(pageFrame.url).host === name))
        color = defaultColor;
    }
    if (!color)
      color = name ? ProductRegistry.BadgePool.colorForEntryName(name) : defaultColor;
    urlToColorCache.set(url, color);
    return color;
  }

  /**
   * @param {!SDK.TracingModel.Event} event
   * @return {string}
   */
  static eventTitle(event) {
    const recordType = TimelineModel.TimelineModel.RecordType;
    const eventData = event.args['data'];
    if (event.name === recordType.JSFrame)
      return Timeline.TimelineUIUtils.frameDisplayName(eventData);
    const title = Timeline.TimelineUIUtils.eventStyle(event).title;
    if (event.hasCategory(TimelineModel.TimelineModel.Category.Console))
      return title;
    if (event.name === recordType.TimeStamp)
      return Common.UIString('%s: %s', title, eventData['message']);
    if (event.name === recordType.Animation && eventData && eventData['name'])
      return Common.UIString('%s: %s', title, eventData['name']);
    return title;
  }

  /**
   * !Map<!TimelineModel.TimelineIRModel.Phases, !{color: string, label: string}>
   */
  static _interactionPhaseStyles() {
    let map = Timeline.TimelineUIUtils._interactionPhaseStylesMap;
    if (!map) {
      map = new Map([
        [TimelineModel.TimelineIRModel.Phases.Idle, {color: 'white', label: 'Idle'}],
        [
          TimelineModel.TimelineIRModel.Phases.Response,
          {color: 'hsl(43, 83%, 64%)', label: Common.UIString('Response')}
        ],
        [TimelineModel.TimelineIRModel.Phases.Scroll, {color: 'hsl(256, 67%, 70%)', label: Common.UIString('Scroll')}],
        [TimelineModel.TimelineIRModel.Phases.Fling, {color: 'hsl(256, 67%, 70%)', label: Common.UIString('Fling')}],
        [TimelineModel.TimelineIRModel.Phases.Drag, {color: 'hsl(256, 67%, 70%)', label: Common.UIString('Drag')}],
        [
          TimelineModel.TimelineIRModel.Phases.Animation,
          {color: 'hsl(256, 67%, 70%)', label: Common.UIString('Animation')}
        ],
        [
          TimelineModel.TimelineIRModel.Phases.Uncategorized,
          {color: 'hsl(0, 0%, 87%)', label: Common.UIString('Uncategorized')}
        ]
      ]);
      Timeline.TimelineUIUtils._interactionPhaseStylesMap = map;
    }
    return map;
  }

  /**
   * @param {!TimelineModel.TimelineIRModel.Phases} phase
   * @return {string}
   */
  static interactionPhaseColor(phase) {
    return Timeline.TimelineUIUtils._interactionPhaseStyles().get(phase).color;
  }

  /**
   * @param {!TimelineModel.TimelineIRModel.Phases} phase
   * @return {string}
   */
  static interactionPhaseLabel(phase) {
    return Timeline.TimelineUIUtils._interactionPhaseStyles().get(phase).label;
  }

  /**
   * @param {!Protocol.Runtime.CallFrame} frame
   * @return {boolean}
   */
  static isUserFrame(frame) {
    return frame.scriptId !== '0' && !(frame.url && frame.url.startsWith('native '));
  }

  /**
   * @param {!TimelineModel.TimelineModel.NetworkRequest} request
   * @return {!Timeline.TimelineUIUtils.NetworkCategory}
   */
  static networkRequestCategory(request) {
    const categories = Timeline.TimelineUIUtils.NetworkCategory;
    switch (request.mimeType) {
      case 'text/html':
        return categories.HTML;
      case 'application/javascript':
      case 'application/x-javascript':
      case 'text/javascript':
        return categories.Script;
      case 'text/css':
        return categories.Style;
      case 'audio/ogg':
      case 'image/gif':
      case 'image/jpeg':
      case 'image/png':
      case 'image/svg+xml':
      case 'image/webp':
      case 'image/x-icon':
      case 'font/opentype':
      case 'font/woff2':
      case 'application/font-woff':
        return categories.Media;
      default:
        return categories.Other;
    }
  }

  /**
   * @param {!Timeline.TimelineUIUtils.NetworkCategory} category
   * @return {string}
   */
  static networkCategoryColor(category) {
    const categories = Timeline.TimelineUIUtils.NetworkCategory;
    switch (category) {
      case categories.HTML:
        return 'hsl(214, 67%, 66%)';
      case categories.Script:
        return 'hsl(43, 83%, 64%)';
      case categories.Style:
        return 'hsl(256, 67%, 70%)';
      case categories.Media:
        return 'hsl(109, 33%, 55%)';
      default:
        return 'hsl(0, 0%, 70%)';
    }
  }

  /**
   * @param {!SDK.TracingModel.Event} event
   * @param {?SDK.Target} target
   * @return {?string}
   */
  static buildDetailsTextForTraceEvent(event, target) {
    const recordType = TimelineModel.TimelineModel.RecordType;
    let detailsText;
    const eventData = event.args['data'];
    switch (event.name) {
      case recordType.GCEvent:
      case recordType.MajorGC:
      case recordType.MinorGC: {
        const delta = event.args['usedHeapSizeBefore'] - event.args['usedHeapSizeAfter'];
        detailsText = Common.UIString('%s collected', Number.bytesToString(delta));
        break;
      }
      case recordType.FunctionCall:
        if (eventData) {
          detailsText =
              linkifyLocationAsText(eventData['scriptId'], eventData['lineNumber'], eventData['columnNumber']);
        }
        break;
      case recordType.JSFrame:
        detailsText = Timeline.TimelineUIUtils.frameDisplayName(eventData);
        break;
      case recordType.EventDispatch:
        detailsText = eventData ? eventData['type'] : null;
        break;
      case recordType.Paint: {
        const width = Timeline.TimelineUIUtils.quadWidth(eventData.clip);
        const height = Timeline.TimelineUIUtils.quadHeight(eventData.clip);
        if (width && height)
          detailsText = Common.UIString('%d\xa0\u00d7\xa0%d', width, height);
        break;
      }
      case recordType.ParseHTML: {
        const endLine = event.args['endData'] && event.args['endData']['endLine'];
        const url = Bindings.displayNameForURL(event.args['beginData']['url']);
        detailsText = Common.UIString(
            '%s [%s\u2026%s]', url, event.args['beginData']['startLine'] + 1, endLine >= 0 ? endLine + 1 : '');
        break;
      }
      case recordType.CompileModule:
        detailsText = Bindings.displayNameForURL(event.args['fileName']);
        break;
      case recordType.CompileScript:
      case recordType.EvaluateScript: {
        const url = eventData && eventData['url'];
        if (url)
          detailsText = Bindings.displayNameForURL(url) + ':' + (eventData['lineNumber'] + 1);
        break;
      }
      case recordType.ParseScriptOnBackground:
      case recordType.XHRReadyStateChange:
      case recordType.XHRLoad: {
        const url = eventData['url'];
        if (url)
          detailsText = Bindings.displayNameForURL(url);
        break;
      }
      case recordType.TimeStamp:
        detailsText = eventData['message'];
        break;

      case recordType.WebSocketCreate:
      case recordType.WebSocketSendHandshakeRequest:
      case recordType.WebSocketReceiveHandshakeResponse:
      case recordType.WebSocketDestroy:
      case recordType.ResourceSendRequest:
      case recordType.ResourceReceivedData:
      case recordType.ResourceReceiveResponse:
      case recordType.ResourceFinish:
      case recordType.PaintImage:
      case recordType.DecodeImage:
      case recordType.ResizeImage:
      case recordType.DecodeLazyPixelRef: {
        const url = TimelineModel.TimelineData.forEvent(event).url;
        if (url)
          detailsText = Bindings.displayNameForURL(url);
        break;
      }

      case recordType.EmbedderCallback:
        detailsText = eventData['callbackName'];
        break;

      case recordType.Animation:
        detailsText = eventData && eventData['name'];
        break;

      case recordType.AsyncTask:
        detailsText = eventData ? eventData['name'] : null;
        break;

      default:
        if (event.hasCategory(TimelineModel.TimelineModel.Category.Console))
          detailsText = null;
        else
          detailsText = linkifyTopCallFrameAsText();
        break;
    }

    return detailsText;

    /**
     * @param {string} scriptId
     * @param {number} lineNumber
     * @param {number} columnNumber
     * @return {?string}
     */
    function linkifyLocationAsText(scriptId, lineNumber, columnNumber) {
      const debuggerModel = target ? target.model(SDK.DebuggerModel) : null;
      if (!target || target.isDisposed() || !scriptId || !debuggerModel)
        return null;
      const rawLocation = debuggerModel.createRawLocationByScriptId(scriptId, lineNumber, columnNumber);
      if (!rawLocation)
        return null;
      const uiLocation = Bindings.debuggerWorkspaceBinding.rawLocationToUILocation(rawLocation);
      return uiLocation ? uiLocation.linkText() : null;
    }

    /**
     * @return {?string}
     */
    function linkifyTopCallFrameAsText() {
      const frame = TimelineModel.TimelineData.forEvent(event).topFrame();
      if (!frame)
        return null;
      let text = linkifyLocationAsText(frame.scriptId, frame.lineNumber, frame.columnNumber);
      if (!text) {
        text = frame.url;
        if (typeof frame.lineNumber === 'number')
          text += ':' + (frame.lineNumber + 1);
      }
      return text;
    }
  }

  /**
   * @param {!SDK.TracingModel.Event} event
   * @param {?SDK.Target} target
   * @param {!Components.Linkifier} linkifier
   * @return {?Node}
   */
  static buildDetailsNodeForTraceEvent(event, target, linkifier) {
    const recordType = TimelineModel.TimelineModel.RecordType;
    let details = null;
    let detailsText;
    const eventData = event.args['data'];
    switch (event.name) {
      case recordType.GCEvent:
      case recordType.MajorGC:
      case recordType.MinorGC:
      case recordType.EventDispatch:
      case recordType.Paint:
      case recordType.Animation:
      case recordType.EmbedderCallback:
      case recordType.ParseHTML:
      case recordType.WebSocketCreate:
      case recordType.WebSocketSendHandshakeRequest:
      case recordType.WebSocketReceiveHandshakeResponse:
      case recordType.WebSocketDestroy:
        detailsText = Timeline.TimelineUIUtils.buildDetailsTextForTraceEvent(event, target);
        break;
      case recordType.PaintImage:
      case recordType.DecodeImage:
      case recordType.ResizeImage:
      case recordType.DecodeLazyPixelRef:
      case recordType.XHRReadyStateChange:
      case recordType.XHRLoad:
      case recordType.ResourceSendRequest:
      case recordType.ResourceReceivedData:
      case recordType.ResourceReceiveResponse:
      case recordType.ResourceFinish: {
        const url = TimelineModel.TimelineData.forEvent(event).url;
        if (url)
          details = Components.Linkifier.linkifyURL(url);
        break;
      }
      case recordType.FunctionCall:
      case recordType.JSFrame:
        details = createElement('span');
        details.createTextChild(Timeline.TimelineUIUtils.frameDisplayName(eventData));
        const location = linkifyLocation(
            eventData['scriptId'], eventData['url'], eventData['lineNumber'], eventData['columnNumber']);
        if (location) {
          details.createTextChild(' @ ');
          details.appendChild(location);
        }
        break;
      case recordType.CompileModule:
        details = linkifyLocation('', event.args['fileName'], 0, 0);
        break;
      case recordType.CompileScript:
      case recordType.EvaluateScript: {
        const url = eventData['url'];
        if (url)
          details = linkifyLocation('', url, eventData['lineNumber'], 0);
        break;
      }
      case recordType.ParseScriptOnBackground: {
        const url = eventData['url'];
        if (url)
          details = linkifyLocation('', url, 0, 0);
        break;
      }
      default:
        if (event.hasCategory(TimelineModel.TimelineModel.Category.Console))
          detailsText = null;
        else
          details = linkifyTopCallFrame();
        break;
    }

    if (!details && detailsText)
      details = createTextNode(detailsText);
    return details;

    /**
     * @param {string} scriptId
     * @param {string} url
     * @param {number} lineNumber
     * @param {number=} columnNumber
     * @return {?Element}
     */
    function linkifyLocation(scriptId, url, lineNumber, columnNumber) {
      return linkifier.linkifyScriptLocation(target, scriptId, url, lineNumber, columnNumber, 'timeline-details');
    }

    /**
     * @return {?Element}
     */
    function linkifyTopCallFrame() {
      const frame = TimelineModel.TimelineData.forEvent(event).topFrame();
      return frame ? linkifier.maybeLinkifyConsoleCallFrame(target, frame, 'timeline-details') : null;
    }
  }

  /**
   * @param {!SDK.TracingModel.Event} event
   * @param {!TimelineModel.TimelineModel} model
   * @param {!Components.Linkifier} linkifier
   * @param {!ProductRegistry.BadgePool} badgePool
   * @param {boolean} detailed
   * @return {!Promise<!DocumentFragment>}
   */
  static async buildTraceEventDetails(event, model, linkifier, badgePool, detailed) {
    const maybeTarget = model.targetByEvent(event);
    /** @type {?Map<number, ?SDK.DOMNode>} */
    let relatedNodesMap = null;
    if (maybeTarget) {
      const target = /** @type {!SDK.Target} */ (maybeTarget);
      if (typeof event[Timeline.TimelineUIUtils._previewElementSymbol] === 'undefined') {
        let previewElement = null;
        const url = TimelineModel.TimelineData.forEvent(event).url;
        if (url)
          previewElement = await Components.ImagePreview.build(target, url, false);
        else if (TimelineModel.TimelineData.forEvent(event).picture)
          previewElement = await Timeline.TimelineUIUtils.buildPicturePreviewContent(event, target);
        event[Timeline.TimelineUIUtils._previewElementSymbol] = previewElement;
      }

      /** @type {!Set<number>} */
      const nodeIdsToResolve = new Set();
      const timelineData = TimelineModel.TimelineData.forEvent(event);
      if (timelineData.backendNodeId)
        nodeIdsToResolve.add(timelineData.backendNodeId);
      const invalidationTrackingEvents = TimelineModel.InvalidationTracker.invalidationEventsFor(event);
      if (invalidationTrackingEvents)
        Timeline.TimelineUIUtils._collectInvalidationNodeIds(nodeIdsToResolve, invalidationTrackingEvents);
      if (nodeIdsToResolve.size) {
        const domModel = target.model(SDK.DOMModel);
        if (domModel)
          relatedNodesMap = await domModel.pushNodesByBackendIdsToFrontend(nodeIdsToResolve);
      }
    }

    const recordTypes = TimelineModel.TimelineModel.RecordType;
    // This message may vary per event.name;
    let relatedNodeLabel;

    const contentHelper = new Timeline.TimelineDetailsContentHelper(model.targetByEvent(event), linkifier);
    const color = model.isMarkerEvent(event) ? Timeline.TimelineUIUtils.markerStyleForEvent(event).color :
                                               Timeline.TimelineUIUtils.eventStyle(event).category.color;
    contentHelper.addSection(Timeline.TimelineUIUtils.eventTitle(event), color);

    const eventData = event.args['data'];
    const timelineData = TimelineModel.TimelineData.forEvent(event);
    const initiator = timelineData.initiator();
    let url = null;

    if (timelineData.warning)
      contentHelper.appendWarningRow(event);
    if (event.name === recordTypes.JSFrame && eventData['deoptReason'])
      contentHelper.appendWarningRow(event, TimelineModel.TimelineModel.WarningType.V8Deopt);

    if (detailed && !Number.isNaN(event.duration + 0)) {
      contentHelper.appendTextRow(ls`Total Time`, Number.millisToString(event.duration, true));
      contentHelper.appendTextRow(ls`Self Time`, Number.millisToString(event.selfTime, true));
    }

    if (model.isGenericTrace()) {
      for (const key in event.args) {
        try {
          contentHelper.appendTextRow(key, JSON.stringify(event.args[key]));
        } catch (e) {
          contentHelper.appendTextRow(key, `<${typeof event.args[key]}>`);
        }
      }
      return contentHelper.fragment;
    }

    switch (event.name) {
      case recordTypes.GCEvent:
      case recordTypes.MajorGC:
      case recordTypes.MinorGC:
        const delta = event.args['usedHeapSizeBefore'] - event.args['usedHeapSizeAfter'];
        contentHelper.appendTextRow(ls`Collected`, Number.bytesToString(delta));
        break;
      case recordTypes.JSFrame:
      case recordTypes.FunctionCall:
        const detailsNode =
            Timeline.TimelineUIUtils.buildDetailsNodeForTraceEvent(event, model.targetByEvent(event), linkifier);
        if (detailsNode)
          contentHelper.appendElementRow(ls`Function`, detailsNode);
        break;
      case recordTypes.TimerFire:
      case recordTypes.TimerInstall:
      case recordTypes.TimerRemove:
        contentHelper.appendTextRow(ls`Timer ID`, eventData['timerId']);
        if (event.name === recordTypes.TimerInstall) {
          contentHelper.appendTextRow(ls`Timeout`, Number.millisToString(eventData['timeout']));
          contentHelper.appendTextRow(ls`Repeats`, !eventData['singleShot']);
        }
        break;
      case recordTypes.FireAnimationFrame:
        contentHelper.appendTextRow(ls`Callback ID`, eventData['id']);
        break;
      case recordTypes.ResourceSendRequest:
      case recordTypes.ResourceReceiveResponse:
      case recordTypes.ResourceReceivedData:
      case recordTypes.ResourceFinish:
        url = timelineData.url;
        if (url)
          contentHelper.appendElementRow(ls`Resource`, Components.Linkifier.linkifyURL(url));
        if (eventData['requestMethod'])
          contentHelper.appendTextRow(ls`Request Method`, eventData['requestMethod']);
        if (typeof eventData['statusCode'] === 'number')
          contentHelper.appendTextRow(ls`Status Code`, eventData['statusCode']);
        if (eventData['mimeType'])
          contentHelper.appendTextRow(ls`MIME Type`, eventData['mimeType']);
        if ('priority' in eventData) {
          const priority = PerfUI.uiLabelForNetworkPriority(eventData['priority']);
          contentHelper.appendTextRow(ls`Priority`, priority);
        }
        if (eventData['encodedDataLength'])
          contentHelper.appendTextRow(ls`Encoded Data`, ls`${eventData['encodedDataLength']} Bytes`);
        if (eventData['decodedBodyLength'])
          contentHelper.appendTextRow(ls`Decoded Body`, ls`${eventData['decodedBodyLength']} Bytes`);
        break;
      case recordTypes.CompileModule:
        contentHelper.appendLocationRow(ls`Module`, event.args['fileName'], 0);
        break;
      case recordTypes.CompileScript:
        url = eventData && eventData['url'];
        if (url)
          contentHelper.appendLocationRow(ls`Script`, url, eventData['lineNumber'], eventData['columnNumber']);
        contentHelper.appendTextRow(ls`Streamed`, eventData['streamed']);
        const cacheProduceOptions = eventData && eventData['cacheProduceOptions'];
        if (cacheProduceOptions) {
          contentHelper.appendTextRow(ls`Cache Produce Options`, cacheProduceOptions);
          contentHelper.appendTextRow(ls`Produced Cache Size`, eventData['producedCacheSize']);
        }
        const cacheConsumeOptions = eventData && eventData['cacheConsumeOptions'];
        if (cacheConsumeOptions) {
          contentHelper.appendTextRow(ls`Cache Consume Options`, cacheConsumeOptions);
          contentHelper.appendTextRow(ls`Consumed Cache Size`, eventData['consumedCacheSize']);
          contentHelper.appendTextRow(ls`Cache Rejected`, eventData['cacheRejected']);
        }
        break;
      case recordTypes.EvaluateScript:
        url = eventData && eventData['url'];
        if (url)
          contentHelper.appendLocationRow(ls`Script`, url, eventData['lineNumber'], eventData['columnNumber']);
        break;
      case recordTypes.Paint:
        const clip = eventData['clip'];
        contentHelper.appendTextRow(ls`Location`, ls`(${clip[0]}, ${clip[1]})`);
        const clipWidth = Timeline.TimelineUIUtils.quadWidth(clip);
        const clipHeight = Timeline.TimelineUIUtils.quadHeight(clip);
        contentHelper.appendTextRow(ls`Dimensions`, ls`${clipWidth} × ${clipHeight}`);
        // Fall-through intended.

      case recordTypes.PaintSetup:
      case recordTypes.Rasterize:
      case recordTypes.ScrollLayer:
        relatedNodeLabel = ls`Layer Root`;
        break;
      case recordTypes.PaintImage:
      case recordTypes.DecodeLazyPixelRef:
      case recordTypes.DecodeImage:
      case recordTypes.ResizeImage:
      case recordTypes.DrawLazyPixelRef:
        relatedNodeLabel = ls`Owner Element`;
        url = timelineData.url;
        if (url)
          contentHelper.appendElementRow(ls`Image URL`, Components.Linkifier.linkifyURL(url));
        break;
      case recordTypes.ParseAuthorStyleSheet:
        url = eventData['styleSheetUrl'];
        if (url)
          contentHelper.appendElementRow(ls`Stylesheet URL`, Components.Linkifier.linkifyURL(url));
        break;
      case recordTypes.UpdateLayoutTree:  // We don't want to see default details.
      case recordTypes.RecalculateStyles:
        contentHelper.appendTextRow(ls`Elements Affected`, event.args['elementCount']);
        break;
      case recordTypes.Layout:
        const beginData = event.args['beginData'];
        contentHelper.appendTextRow(
            ls`Nodes That Need Layout`, ls`${beginData['dirtyObjects']} of ${beginData['totalObjects']}`);
        relatedNodeLabel = ls`Layout root`;
        break;
      case recordTypes.ConsoleTime:
        contentHelper.appendTextRow(ls`Message`, event.name);
        break;
      case recordTypes.WebSocketCreate:
      case recordTypes.WebSocketSendHandshakeRequest:
      case recordTypes.WebSocketReceiveHandshakeResponse:
      case recordTypes.WebSocketDestroy:
        const initiatorData = initiator ? initiator.args['data'] : eventData;
        if (typeof initiatorData['webSocketURL'] !== 'undefined')
          contentHelper.appendTextRow(ls`URL`, initiatorData['webSocketURL']);
        if (typeof initiatorData['webSocketProtocol'] !== 'undefined')
          contentHelper.appendTextRow(ls`WebSocket Protocol`, initiatorData['webSocketProtocol']);
        if (typeof eventData['message'] !== 'undefined')
          contentHelper.appendTextRow(ls`Message`, eventData['message']);
        break;
      case recordTypes.EmbedderCallback:
        contentHelper.appendTextRow(ls`Callback Function`, eventData['callbackName']);
        break;
      case recordTypes.Animation:
        if (event.phase === SDK.TracingModel.Phase.NestableAsyncInstant)
          contentHelper.appendTextRow(ls`State`, eventData['state']);
        break;
      case recordTypes.ParseHTML: {
        const beginData = event.args['beginData'];
        const startLine = beginData['startLine'] - 1;
        const endLine = event.args['endData'] ? event.args['endData']['endLine'] - 1 : undefined;
        url = beginData['url'];
        if (url)
          contentHelper.appendLocationRange(ls`Range`, url, startLine, endLine);
        break;
      }

      case recordTypes.FireIdleCallback:
        contentHelper.appendTextRow(ls`Allotted Time`, Number.millisToString(eventData['allottedMilliseconds']));
        contentHelper.appendTextRow(ls`Invoked by Timeout`, eventData['timedOut']);
        // Fall-through intended.

      case recordTypes.RequestIdleCallback:
      case recordTypes.CancelIdleCallback:
        contentHelper.appendTextRow(ls`Callback ID`, eventData['id']);
        break;
      case recordTypes.EventDispatch:
        contentHelper.appendTextRow(ls`Type`, eventData['type']);
        break;

      case recordTypes.MarkFCP:
      case recordTypes.MarkFMP:
      case recordTypes.MarkLoad:
      case recordTypes.MarkDOMContent:
        contentHelper.appendTextRow(
            ls`Timestamp`, Number.preciseMillisToString(event.startTime - model.minimumRecordTime(), 1));
        const learnMoreLink = UI.XLink.create(
            'https://developers.google.com/web/fundamentals/performance/user-centric-performance-metrics#user-centric_performance_metrics',
            ls`Learn more`);
        const linkDiv = UI.html`<div>${learnMoreLink} about page performance metrics.</div>`;
        contentHelper.appendElementRow(ls`Details`, linkDiv);
        break;

      default: {
        const detailsNode =
            Timeline.TimelineUIUtils.buildDetailsNodeForTraceEvent(event, model.targetByEvent(event), linkifier);
        if (detailsNode)
          contentHelper.appendElementRow(ls`Details`, detailsNode);
        break;
      }
    }

    Timeline.TimelineUIUtils._maybeAppendProductToDetails(
        contentHelper, badgePool, url || eventData && eventData['url']);

    if (timelineData.timeWaitingForMainThread) {
      contentHelper.appendTextRow(
          ls`Time Waiting for Main Thread`, Number.millisToString(timelineData.timeWaitingForMainThread, true));
    }

    const relatedNode = relatedNodesMap && relatedNodesMap.get(timelineData.backendNodeId);
    if (relatedNode) {
      const nodeSpan = await Common.Linkifier.linkify(relatedNode);
      contentHelper.appendElementRow(relatedNodeLabel || ls`Related Node`, nodeSpan);
    }

    if (event[Timeline.TimelineUIUtils._previewElementSymbol]) {
      contentHelper.addSection(ls`Preview`);
      contentHelper.appendElementRow('', event[Timeline.TimelineUIUtils._previewElementSymbol]);
    }

    if (initiator || timelineData.stackTraceForSelfOrInitiator() ||
        TimelineModel.InvalidationTracker.invalidationEventsFor(event))
      Timeline.TimelineUIUtils._generateCauses(event, model.targetByEvent(event), relatedNodesMap, contentHelper);

    const stats = {};
    const showPieChart = detailed && Timeline.TimelineUIUtils._aggregatedStatsForTraceEvent(stats, model, event);
    if (showPieChart) {
      contentHelper.addSection(ls`Aggregated Time`);
      const pieChart = Timeline.TimelineUIUtils.generatePieChart(
          stats, Timeline.TimelineUIUtils.eventStyle(event).category, event.selfTime);
      contentHelper.appendElementRow('', pieChart);
    }

    return contentHelper.fragment;
  }

  /**
   * @param {!Timeline.TimelineDetailsContentHelper} contentHelper
   * @param {!ProductRegistry.BadgePool} badgePool
   * @param {?string} url
   */
  static _maybeAppendProductToDetails(contentHelper, badgePool, url) {
    const parsedURL = url ? url.asParsedURL() : null;
    if (parsedURL)
      contentHelper.appendElementRow('', badgePool.badgeForURL(parsedURL));
  }

  /**
   * @param {!Array<!SDK.TracingModel.Event>} events
   * @param {number} startTime
   * @param {number} endTime
   * @return {!Object<string, number>}
   */
  static statsForTimeRange(events, startTime, endTime) {
    if (!events.length)
      return {'idle': endTime - startTime};

    buildRangeStatsCacheIfNeeded(events);
    const aggregatedStats = subtractStats(aggregatedStatsAtTime(endTime), aggregatedStatsAtTime(startTime));
    const aggregatedTotal = Object.values(aggregatedStats).reduce((a, b) => a + b, 0);
    aggregatedStats['idle'] = Math.max(0, endTime - startTime - aggregatedTotal);
    return aggregatedStats;

    /**
     * @param {number} time
     * @return {!Object}
     */
    function aggregatedStatsAtTime(time) {
      const stats = {};
      const cache = events[Timeline.TimelineUIUtils._categoryBreakdownCacheSymbol];
      for (const category in cache) {
        const categoryCache = cache[category];
        const index = categoryCache.time.upperBound(time);
        let value;
        if (index === 0) {
          value = 0;
        } else if (index === categoryCache.time.length) {
          value = categoryCache.value.peekLast();
        } else {
          const t0 = categoryCache.time[index - 1];
          const t1 = categoryCache.time[index];
          const v0 = categoryCache.value[index - 1];
          const v1 = categoryCache.value[index];
          value = v0 + (v1 - v0) * (time - t0) / (t1 - t0);
        }
        stats[category] = value;
      }
      return stats;
    }

    /**
      * @param {!Object<string, number>} a
      * @param {!Object<string, number>} b
      * @return {!Object<string, number>}
      */
    function subtractStats(a, b) {
      const result = Object.assign({}, a);
      for (const key in b)
        result[key] -= b[key];
      return result;
    }

    /**
     * @param {!Array<!SDK.TracingModel.Event>} events
     */
    function buildRangeStatsCacheIfNeeded(events) {
      if (events[Timeline.TimelineUIUtils._categoryBreakdownCacheSymbol])
        return;

      // aggeregatedStats is a map by categories. For each category there's an array
      // containing sorted time points which records accumulated value of the category.
      const aggregatedStats = {};
      const categoryStack = [];
      let lastTime = 0;
      TimelineModel.TimelineModel.forEachEvent(
          events, onStartEvent, onEndEvent, undefined, undefined, undefined, filterForStats());

      /**
       * @return {function(!SDK.TracingModel.Event):boolean}
       */
      function filterForStats() {
        const visibleEventsFilter = Timeline.TimelineUIUtils.visibleEventsFilter();
        return event => visibleEventsFilter.accept(event) || SDK.TracingModel.isTopLevelEvent(event);
      }

      /**
       * @param {string} category
       * @param {number} time
       */
      function updateCategory(category, time) {
        let statsArrays = aggregatedStats[category];
        if (!statsArrays) {
          statsArrays = {time: [], value: []};
          aggregatedStats[category] = statsArrays;
        }
        if (statsArrays.time.length && statsArrays.time.peekLast() === time)
          return;
        const lastValue = statsArrays.value.length ? statsArrays.value.peekLast() : 0;
        statsArrays.value.push(lastValue + time - lastTime);
        statsArrays.time.push(time);
      }

      /**
       * @param {?string} from
       * @param {?string} to
       * @param {number} time
       */
      function categoryChange(from, to, time) {
        if (from)
          updateCategory(from, time);
        lastTime = time;
        if (to)
          updateCategory(to, time);
      }

      /**
       * @param {!SDK.TracingModel.Event} e
       */
      function onStartEvent(e) {
        const category = Timeline.TimelineUIUtils.eventStyle(e).category.name;
        const parentCategory = categoryStack.length ? categoryStack.peekLast() : null;
        if (category !== parentCategory)
          categoryChange(parentCategory, category, e.startTime);
        categoryStack.push(category);
      }

      /**
       * @param {!SDK.TracingModel.Event} e
       */
      function onEndEvent(e) {
        const category = categoryStack.pop();
        const parentCategory = categoryStack.length ? categoryStack.peekLast() : null;
        if (category !== parentCategory)
          categoryChange(category, parentCategory, e.endTime);
      }

      const obj = /** @type {!Object} */ (events);
      obj[Timeline.TimelineUIUtils._categoryBreakdownCacheSymbol] = aggregatedStats;
    }
  }

  /**
   * @param {!TimelineModel.TimelineModel.NetworkRequest} request
   * @param {!TimelineModel.TimelineModel} model
   * @param {!Components.Linkifier} linkifier
   * @param {!ProductRegistry.BadgePool} badgePool
   * @return {!Promise<!DocumentFragment>}
   */
  static async buildNetworkRequestDetails(request, model, linkifier, badgePool) {
    const target = model.targetByEvent(request.children[0]);
    const contentHelper = new Timeline.TimelineDetailsContentHelper(target, linkifier);
    const category = Timeline.TimelineUIUtils.networkRequestCategory(request);
    const color = Timeline.TimelineUIUtils.networkCategoryColor(category);
    contentHelper.addSection(Common.UIString('Network request'), color);

    const duration = request.endTime - (request.startTime || -Infinity);
    if (request.url)
      contentHelper.appendElementRow(Common.UIString('URL'), Components.Linkifier.linkifyURL(request.url));
    Timeline.TimelineUIUtils._maybeAppendProductToDetails(contentHelper, badgePool, request.url);
    if (isFinite(duration))
      contentHelper.appendTextRow(Common.UIString('Duration'), Number.millisToString(duration, true));
    if (request.requestMethod)
      contentHelper.appendTextRow(Common.UIString('Request Method'), request.requestMethod);
    if (typeof request.priority === 'string') {
      const priority =
          PerfUI.uiLabelForNetworkPriority(/** @type {!Protocol.Network.ResourcePriority} */ (request.priority));
      contentHelper.appendTextRow(Common.UIString('Priority'), priority);
    }
    if (request.mimeType)
      contentHelper.appendTextRow(Common.UIString('Mime Type'), request.mimeType);
    let lengthText = '';
    if (request.fromCache)
      lengthText += Common.UIString(' (from cache)');
    if (request.fromServiceWorker)
      lengthText += Common.UIString(' (from service worker)');
    if (request.encodedDataLength || !lengthText)
      lengthText = `${Number.bytesToString(request.encodedDataLength)}${lengthText}`;
    contentHelper.appendTextRow(Common.UIString('Encoded Data'), lengthText);
    if (request.decodedBodyLength)
      contentHelper.appendTextRow(Common.UIString('Decoded Body'), Number.bytesToString(request.decodedBodyLength));
    const title = Common.UIString('Initiator');
    const sendRequest = request.children[0];
    const topFrame = TimelineModel.TimelineData.forEvent(sendRequest).topFrame();
    if (topFrame) {
      const link = linkifier.maybeLinkifyConsoleCallFrame(target, topFrame);
      if (link)
        contentHelper.appendElementRow(title, link);
    } else {
      const initiator = TimelineModel.TimelineData.forEvent(sendRequest).initiator();
      if (initiator) {
        const initiatorURL = TimelineModel.TimelineData.forEvent(initiator).url;
        if (initiatorURL) {
          const link = linkifier.maybeLinkifyScriptLocation(target, null, initiatorURL, 0);
          if (link)
            contentHelper.appendElementRow(title, link);
        }
      }
    }

    if (!request.previewElement && request.url && target)
      request.previewElement = await Components.ImagePreview.build(target, request.url, false);
    if (request.previewElement)
      contentHelper.appendElementRow(Common.UIString('Preview'), request.previewElement);
    return contentHelper.fragment;
  }

  /**
   * @param {!Array<!Protocol.Runtime.CallFrame>} callFrames
   * @return {!Protocol.Runtime.StackTrace}
   */
  static _stackTraceFromCallFrames(callFrames) {
    return /** @type {!Protocol.Runtime.StackTrace} */ ({callFrames: callFrames});
  }

  /**
   * @param {!SDK.TracingModel.Event} event
   * @param {?SDK.Target} target
   * @param {?Map<number, ?SDK.DOMNode>} relatedNodesMap
   * @param {!Timeline.TimelineDetailsContentHelper} contentHelper
   */
  static _generateCauses(event, target, relatedNodesMap, contentHelper) {
    const recordTypes = TimelineModel.TimelineModel.RecordType;

    let callSiteStackLabel;
    let stackLabel;

    switch (event.name) {
      case recordTypes.TimerFire:
        callSiteStackLabel = Common.UIString('Timer Installed');
        break;
      case recordTypes.FireAnimationFrame:
        callSiteStackLabel = Common.UIString('Animation Frame Requested');
        break;
      case recordTypes.FireIdleCallback:
        callSiteStackLabel = Common.UIString('Idle Callback Requested');
        break;
      case recordTypes.UpdateLayoutTree:
      case recordTypes.RecalculateStyles:
        stackLabel = Common.UIString('Recalculation Forced');
        break;
      case recordTypes.Layout:
        callSiteStackLabel = Common.UIString('First Layout Invalidation');
        stackLabel = Common.UIString('Layout Forced');
        break;
    }

    const timelineData = TimelineModel.TimelineData.forEvent(event);
    // Direct cause.
    if (timelineData.stackTrace && timelineData.stackTrace.length) {
      contentHelper.addSection(Common.UIString('Call Stacks'));
      contentHelper.appendStackTrace(
          stackLabel || Common.UIString('Stack Trace'),
          Timeline.TimelineUIUtils._stackTraceFromCallFrames(timelineData.stackTrace));
    }

    const initiator = TimelineModel.TimelineData.forEvent(event).initiator();
    // Indirect causes.
    if (TimelineModel.InvalidationTracker.invalidationEventsFor(event) && target) {
      // Full invalidation tracking (experimental).
      contentHelper.addSection(Common.UIString('Invalidations'));
      Timeline.TimelineUIUtils._generateInvalidations(event, target, relatedNodesMap, contentHelper);
    } else if (initiator) {  // Partial invalidation tracking.
      const delay = event.startTime - initiator.startTime;
      contentHelper.appendTextRow(Common.UIString('Pending for'), Number.preciseMillisToString(delay, 1));

      const link = createElementWithClass('span', 'devtools-link');
      link.textContent = Common.UIString('reveal');
      link.addEventListener('click', () => {
        Timeline.TimelinePanel.instance().select(
            Timeline.TimelineSelection.fromTraceEvent(/** @type {!SDK.TracingModel.Event} */ (initiator)));
      });
      contentHelper.appendElementRow(Common.UIString('Initiator'), link);

      const initiatorStackTrace = TimelineModel.TimelineData.forEvent(initiator).stackTrace;
      if (initiatorStackTrace) {
        contentHelper.appendStackTrace(
            callSiteStackLabel || Common.UIString('First Invalidated'),
            Timeline.TimelineUIUtils._stackTraceFromCallFrames(initiatorStackTrace));
      }
    }
  }

  /**
   * @param {!SDK.TracingModel.Event} event
   * @param {!SDK.Target} target
   * @param {?Map<number, ?SDK.DOMNode>} relatedNodesMap
   * @param {!Timeline.TimelineDetailsContentHelper} contentHelper
   */
  static _generateInvalidations(event, target, relatedNodesMap, contentHelper) {
    const invalidationTrackingEvents = TimelineModel.InvalidationTracker.invalidationEventsFor(event);
    const invalidations = {};
    invalidationTrackingEvents.forEach(function(invalidation) {
      if (!invalidations[invalidation.type])
        invalidations[invalidation.type] = [invalidation];
      else
        invalidations[invalidation.type].push(invalidation);
    });

    Object.keys(invalidations).forEach(function(type) {
      Timeline.TimelineUIUtils._generateInvalidationsForType(
          type, target, invalidations[type], relatedNodesMap, contentHelper);
    });
  }

  /**
   * @param {string} type
   * @param {!SDK.Target} target
   * @param {!Array.<!TimelineModel.InvalidationTrackingEvent>} invalidations
   * @param {?Map<number, ?SDK.DOMNode>} relatedNodesMap
   * @param {!Timeline.TimelineDetailsContentHelper} contentHelper
   */
  static _generateInvalidationsForType(type, target, invalidations, relatedNodesMap, contentHelper) {
    let title;
    switch (type) {
      case TimelineModel.TimelineModel.RecordType.StyleRecalcInvalidationTracking:
        title = Common.UIString('Style Invalidations');
        break;
      case TimelineModel.TimelineModel.RecordType.LayoutInvalidationTracking:
        title = Common.UIString('Layout Invalidations');
        break;
      default:
        title = Common.UIString('Other Invalidations');
        break;
    }

    const invalidationsTreeOutline = new UI.TreeOutlineInShadow();
    invalidationsTreeOutline.registerRequiredCSS('timeline/invalidationsTree.css');
    invalidationsTreeOutline.element.classList.add('invalidations-tree');

    const invalidationGroups = groupInvalidationsByCause(invalidations);
    invalidationGroups.forEach(function(group) {
      const groupElement =
          new Timeline.TimelineUIUtils.InvalidationsGroupElement(target, relatedNodesMap, contentHelper, group);
      invalidationsTreeOutline.appendChild(groupElement);
    });
    contentHelper.appendElementRow(title, invalidationsTreeOutline.element, false, true);

    /**
     * @param {!Array<!TimelineModel.InvalidationTrackingEvent>} invalidations
     * @return {!Array<!Array<!TimelineModel.InvalidationTrackingEvent>>}
     */
    function groupInvalidationsByCause(invalidations) {
      /** @type {!Map<string, !Array<!TimelineModel.InvalidationTrackingEvent>>} */
      const causeToInvalidationMap = new Map();
      for (let index = 0; index < invalidations.length; index++) {
        const invalidation = invalidations[index];
        let causeKey = '';
        if (invalidation.cause.reason)
          causeKey += invalidation.cause.reason + '.';
        if (invalidation.cause.stackTrace) {
          invalidation.cause.stackTrace.forEach(function(stackFrame) {
            causeKey += stackFrame['functionName'] + '.';
            causeKey += stackFrame['scriptId'] + '.';
            causeKey += stackFrame['url'] + '.';
            causeKey += stackFrame['lineNumber'] + '.';
            causeKey += stackFrame['columnNumber'] + '.';
          });
        }

        if (causeToInvalidationMap.has(causeKey))
          causeToInvalidationMap.get(causeKey).push(invalidation);
        else
          causeToInvalidationMap.set(causeKey, [invalidation]);
      }
      return causeToInvalidationMap.valuesArray();
    }
  }

  /**
   * @param {!Set<number>} nodeIds
   * @param {!Array<!TimelineModel.InvalidationTrackingEvent>} invalidations
   */
  static _collectInvalidationNodeIds(nodeIds, invalidations) {
    nodeIds.addAll(invalidations.map(invalidation => invalidation.nodeId).filter(id => id));
  }

  /**
   * @param {!Object} total
   * @param {!TimelineModel.TimelineModel} model
   * @param {!SDK.TracingModel.Event} event
   * @return {boolean}
   */
  static _aggregatedStatsForTraceEvent(total, model, event) {
    const events = model.inspectedTargetEvents();
    /**
     * @param {number} startTime
     * @param {!SDK.TracingModel.Event} e
     * @return {number}
     */
    function eventComparator(startTime, e) {
      return startTime - e.startTime;
    }
    const index = events.binaryIndexOf(event.startTime, eventComparator);
    // Not a main thread event?
    if (index < 0)
      return false;
    let hasChildren = false;
    const endTime = event.endTime;
    if (endTime) {
      for (let i = index; i < events.length; i++) {
        const nextEvent = events[i];
        if (nextEvent.startTime >= endTime)
          break;
        if (!nextEvent.selfTime)
          continue;
        if (nextEvent.thread !== event.thread)
          continue;
        if (i > index)
          hasChildren = true;
        const categoryName = Timeline.TimelineUIUtils.eventStyle(nextEvent).category.name;
        total[categoryName] = (total[categoryName] || 0) + nextEvent.selfTime;
      }
    }
    if (SDK.TracingModel.isAsyncPhase(event.phase)) {
      if (event.endTime) {
        let aggregatedTotal = 0;
        for (const categoryName in total)
          aggregatedTotal += total[categoryName];
        total['idle'] = Math.max(0, event.endTime - event.startTime - aggregatedTotal);
      }
      return false;
    }
    return hasChildren;
  }

  /**
   * @param {!SDK.TracingModel.Event} event
   * @param {!SDK.Target} target
   * @return {!Promise<?Element>}
   */
  static async buildPicturePreviewContent(event, target) {
    const snapshotWithRect = await new TimelineModel.LayerPaintEvent(event, target).snapshotPromise();
    if (!snapshotWithRect)
      return null;
    const imageURLPromise = snapshotWithRect.snapshot.replay();
    snapshotWithRect.snapshot.release();
    const imageURL = await imageURLPromise;
    if (!imageURL)
      return null;
    const container = createElement('div');
    UI.appendStyle(container, 'components/imagePreview.css');
    container.classList.add('image-preview-container', 'vbox', 'link');
    const img = container.createChild('img');
    img.src = imageURL;
    const paintProfilerButton = container.createChild('a');
    paintProfilerButton.textContent = Common.UIString('Paint Profiler');
    container.addEventListener(
        'click', () => Timeline.TimelinePanel.instance().select(Timeline.TimelineSelection.fromTraceEvent(event)),
        false);
    return container;
  }

  /**
   * @param {!SDK.TracingModel.Event} event
   * @param {number} zeroTime
   * @return {!Element}
   */
  static createEventDivider(event, zeroTime) {
    const eventDivider = createElementWithClass('div', 'resources-event-divider');
    const startTime = Number.millisToString(event.startTime - zeroTime);
    eventDivider.title = Common.UIString('%s at %s', Timeline.TimelineUIUtils.eventTitle(event), startTime);
    const style = Timeline.TimelineUIUtils.markerStyleForEvent(event);
    if (style.tall)
      eventDivider.style.backgroundColor = style.color;
    return eventDivider;
  }

  /**
   * @return {!Array.<string>}
   */
  static _visibleTypes() {
    const eventStyles = Timeline.TimelineUIUtils._initEventStyles();
    const result = [];
    for (const name in eventStyles) {
      if (!eventStyles[name].hidden)
        result.push(name);
    }
    return result;
  }

  /**
   * @return {!TimelineModel.TimelineModelFilter}
   */
  static visibleEventsFilter() {
    return new TimelineModel.TimelineVisibleEventsFilter(Timeline.TimelineUIUtils._visibleTypes());
  }

  /**
   * @return {!Object.<string, !Timeline.TimelineCategory>}
   */
  static categories() {
    if (Timeline.TimelineUIUtils._categories)
      return Timeline.TimelineUIUtils._categories;
    Timeline.TimelineUIUtils._categories = {
      loading: new Timeline.TimelineCategory(
          'loading', Common.UIString('Loading'), true, 'hsl(214, 67%, 74%)', 'hsl(214, 67%, 66%)'),
      scripting: new Timeline.TimelineCategory(
          'scripting', Common.UIString('Scripting'), true, 'hsl(43, 83%, 72%)', 'hsl(43, 83%, 64%) '),
      rendering: new Timeline.TimelineCategory(
          'rendering', Common.UIString('Rendering'), true, 'hsl(256, 67%, 76%)', 'hsl(256, 67%, 70%)'),
      painting: new Timeline.TimelineCategory(
          'painting', Common.UIString('Painting'), true, 'hsl(109, 33%, 64%)', 'hsl(109, 33%, 55%)'),
      gpu: new Timeline.TimelineCategory(
          'gpu', Common.UIString('GPU'), false, 'hsl(109, 33%, 64%)', 'hsl(109, 33%, 55%)'),
      async: new Timeline.TimelineCategory(
          'async', Common.UIString('Async'), false, 'hsl(0, 100%, 50%)', 'hsl(0, 100%, 40%)'),
      other:
          new Timeline.TimelineCategory('other', Common.UIString('Other'), false, 'hsl(0, 0%, 87%)', 'hsl(0, 0%, 79%)'),
      idle: new Timeline.TimelineCategory('idle', Common.UIString('Idle'), false, 'hsl(0, 0%, 98%)', 'hsl(0, 0%, 98%)')
    };
    return Timeline.TimelineUIUtils._categories;
  }

  /**
   * @param {!Object} aggregatedStats
   * @param {!Timeline.TimelineCategory=} selfCategory
   * @param {number=} selfTime
   * @return {!Element}
   */
  static generatePieChart(aggregatedStats, selfCategory, selfTime) {
    let total = 0;
    for (const categoryName in aggregatedStats)
      total += aggregatedStats[categoryName];

    const element = createElementWithClass('div', 'timeline-details-view-pie-chart-wrapper hbox');
    const pieChart = new PerfUI.PieChart(110, value => Number.preciseMillisToString(value), true);
    pieChart.element.classList.add('timeline-details-view-pie-chart');
    pieChart.setTotal(total);
    const pieChartContainer = element.createChild('div', 'vbox');
    pieChartContainer.appendChild(pieChart.element);
    const footerElement = element.createChild('div', 'timeline-aggregated-info-legend');

    /**
     * @param {string} name
     * @param {string} title
     * @param {number} value
     * @param {string} color
     */
    function appendLegendRow(name, title, value, color) {
      if (!value)
        return;
      pieChart.addSlice(value, color);
      const rowElement = footerElement.createChild('div');
      rowElement.createChild('span', 'timeline-aggregated-legend-value').textContent =
          Number.preciseMillisToString(value, 1);
      rowElement.createChild('span', 'timeline-aggregated-legend-swatch').style.backgroundColor = color;
      rowElement.createChild('span', 'timeline-aggregated-legend-title').textContent = title;
    }

    // In case of self time, first add self, then children of the same category.
    if (selfCategory) {
      if (selfTime) {
        appendLegendRow(
            selfCategory.name, Common.UIString('%s (self)', selfCategory.title), selfTime, selfCategory.color);
      }
      // Children of the same category.
      const categoryTime = aggregatedStats[selfCategory.name];
      const value = categoryTime - selfTime;
      if (value > 0) {
        appendLegendRow(
            selfCategory.name, Common.UIString('%s (children)', selfCategory.title), value, selfCategory.childColor);
      }
    }

    // Add other categories.
    for (const categoryName in Timeline.TimelineUIUtils.categories()) {
      const category = Timeline.TimelineUIUtils.categories()[categoryName];
      if (category === selfCategory)
        continue;
      appendLegendRow(category.name, category.title, aggregatedStats[category.name], category.childColor);
    }
    return element;
  }

  /**
   * @param {!TimelineModel.TimelineFrame} frame
   * @param {?SDK.FilmStripModel.Frame} filmStripFrame
   * @return {!Element}
   */
  static generateDetailsContentForFrame(frame, filmStripFrame) {
    const contentHelper = new Timeline.TimelineDetailsContentHelper(null, null);
    contentHelper.addSection(Common.UIString('Frame'));

    const duration = Timeline.TimelineUIUtils.frameDuration(frame);
    contentHelper.appendElementRow(Common.UIString('Duration'), duration, frame.hasWarnings());
    const durationInMillis = frame.endTime - frame.startTime;
    contentHelper.appendTextRow(Common.UIString('FPS'), Math.floor(1000 / durationInMillis));
    contentHelper.appendTextRow(Common.UIString('CPU time'), Number.millisToString(frame.cpuTime, true));
    if (filmStripFrame) {
      const filmStripPreview = createElementWithClass('div', 'timeline-filmstrip-preview');
      filmStripFrame.imageDataPromise()
          .then(data => UI.loadImageFromData(data))
          .then(image => image && filmStripPreview.appendChild(image));
      contentHelper.appendElementRow('', filmStripPreview);
      filmStripPreview.addEventListener('click', frameClicked.bind(null, filmStripFrame), false);
    }

    if (frame.layerTree) {
      contentHelper.appendElementRow(
          Common.UIString('Layer tree'),
          Components.Linkifier.linkifyRevealable(frame.layerTree, Common.UIString('show')));
    }

    /**
     * @param {!SDK.FilmStripModel.Frame} filmStripFrame
     */
    function frameClicked(filmStripFrame) {
      new PerfUI.FilmStripView.Dialog(filmStripFrame, 0);
    }

    return contentHelper.fragment;
  }

  /**
   * @param {!TimelineModel.TimelineFrame} frame
   * @return {!Element}
   */
  static frameDuration(frame) {
    const durationText = Common.UIString(
        '%s (at %s)', Number.millisToString(frame.endTime - frame.startTime, true),
        Number.millisToString(frame.startTimeOffset, true));
    const element = createElement('span');
    element.createTextChild(durationText);
    if (!frame.hasWarnings())
      return element;
    element.createTextChild(Common.UIString('. Long frame times are an indication of '));
    element.appendChild(UI.XLink.create(
        'https://developers.google.com/web/fundamentals/performance/rendering/', Common.UIString('jank')));
    element.createTextChild('.');
    return element;
  }

  /**
   * @param {!CanvasRenderingContext2D} context
   * @param {number} width
   * @param {number} height
   * @param {string} color0
   * @param {string} color1
   * @param {string} color2
   * @return {!CanvasGradient}
   */
  static createFillStyle(context, width, height, color0, color1, color2) {
    const gradient = context.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, color0);
    gradient.addColorStop(0.25, color1);
    gradient.addColorStop(0.75, color1);
    gradient.addColorStop(1, color2);
    return gradient;
  }

  /**
   * @param {!Array.<number>} quad
   * @return {number}
   */
  static quadWidth(quad) {
    return Math.round(Math.sqrt(Math.pow(quad[0] - quad[2], 2) + Math.pow(quad[1] - quad[3], 2)));
  }

  /**
   * @param {!Array.<number>} quad
   * @return {number}
   */
  static quadHeight(quad) {
    return Math.round(Math.sqrt(Math.pow(quad[0] - quad[6], 2) + Math.pow(quad[1] - quad[7], 2)));
  }

  /**
   * @return {!Array.<!Timeline.TimelineUIUtils.EventDispatchTypeDescriptor>}
   */
  static eventDispatchDesciptors() {
    if (Timeline.TimelineUIUtils._eventDispatchDesciptors)
      return Timeline.TimelineUIUtils._eventDispatchDesciptors;
    const lightOrange = 'hsl(40,100%,80%)';
    const orange = 'hsl(40,100%,50%)';
    const green = 'hsl(90,100%,40%)';
    const purple = 'hsl(256,100%,75%)';
    Timeline.TimelineUIUtils._eventDispatchDesciptors = [
      new Timeline.TimelineUIUtils.EventDispatchTypeDescriptor(
          1, lightOrange, ['mousemove', 'mouseenter', 'mouseleave', 'mouseout', 'mouseover']),
      new Timeline.TimelineUIUtils.EventDispatchTypeDescriptor(
          1, lightOrange, ['pointerover', 'pointerout', 'pointerenter', 'pointerleave', 'pointermove']),
      new Timeline.TimelineUIUtils.EventDispatchTypeDescriptor(2, green, ['wheel']),
      new Timeline.TimelineUIUtils.EventDispatchTypeDescriptor(3, orange, ['click', 'mousedown', 'mouseup']),
      new Timeline.TimelineUIUtils.EventDispatchTypeDescriptor(
          3, orange, ['touchstart', 'touchend', 'touchmove', 'touchcancel']),
      new Timeline.TimelineUIUtils.EventDispatchTypeDescriptor(
          3, orange, ['pointerdown', 'pointerup', 'pointercancel', 'gotpointercapture', 'lostpointercapture']),
      new Timeline.TimelineUIUtils.EventDispatchTypeDescriptor(3, purple, ['keydown', 'keyup', 'keypress'])
    ];
    return Timeline.TimelineUIUtils._eventDispatchDesciptors;
  }

  /**
   * @param {!SDK.TracingModel.Event} event
   * @return {?string}
   */
  static markerShortTitle(event) {
    const recordTypes = TimelineModel.TimelineModel.RecordType;
    switch (event.name) {
      case recordTypes.MarkDOMContent:
        return ls`DCL`;
      case recordTypes.MarkLoad:
        return ls`L`;
      case recordTypes.MarkFirstPaint:
        return ls`FP`;
      case recordTypes.MarkFCP:
        return ls`FCP`;
      case recordTypes.MarkFMP:
        return ls`FMP`;
    }
    return null;
  }

  /**
   * @param {!SDK.TracingModel.Event} event
   * @return {!Timeline.TimelineMarkerStyle}
   */
  static markerStyleForEvent(event) {
    const tallMarkerDashStyle = [6, 4];
    const title = Timeline.TimelineUIUtils.eventTitle(event);

    if (event.hasCategory(TimelineModel.TimelineModel.Category.Console) ||
        event.hasCategory(TimelineModel.TimelineModel.Category.UserTiming)) {
      return {
        title: title,
        dashStyle: tallMarkerDashStyle,
        lineWidth: 0.5,
        color: event.hasCategory(TimelineModel.TimelineModel.Category.UserTiming) ? 'purple' : 'orange',
        tall: false,
        lowPriority: false,
      };
    }
    const recordTypes = TimelineModel.TimelineModel.RecordType;
    let tall = false;
    let color = 'grey';
    switch (event.name) {
      case recordTypes.FrameStartedLoading:
        color = 'green';
        tall = true;
        break;
      case recordTypes.MarkDOMContent:
        color = '#0867CB';
        tall = true;
        break;
      case recordTypes.MarkLoad:
        color = '#B31412';
        tall = true;
        break;
      case recordTypes.MarkFirstPaint:
        color = 'hsl(180, 45%, 79%)';
        tall = true;
        break;
      case recordTypes.MarkFCP:
        color = '#208043';
        tall = true;
        break;
      case recordTypes.MarkFMP:
        color = '#14522B';
        tall = true;
        break;
      case recordTypes.TimeStamp:
        color = 'orange';
        break;
    }
    return {
      title: title,
      dashStyle: tallMarkerDashStyle,
      lineWidth: 0.5,
      color: color,
      tall: tall,
      lowPriority: false,
    };
  }

  /**
   * @return {!Timeline.TimelineMarkerStyle}
   */
  static markerStyleForFrame() {
    return {
      title: Common.UIString('Frame'),
      color: 'rgba(100, 100, 100, 0.4)',
      lineWidth: 3,
      dashStyle: [3],
      tall: true,
      lowPriority: true
    };
  }

  /**
   * @param {string} id
   * @return {string}
   */
  static colorForId(id) {
    if (!Timeline.TimelineUIUtils.colorForId._colorGenerator) {
      Timeline.TimelineUIUtils.colorForId._colorGenerator =
          new Common.Color.Generator({min: 30, max: 330}, {min: 50, max: 80, count: 3}, 85);
      Timeline.TimelineUIUtils.colorForId._colorGenerator.setColorForID('', '#f2ecdc');
    }
    return Timeline.TimelineUIUtils.colorForId._colorGenerator.colorForID(id);
  }

  /**
   * @param {!SDK.TracingModel.Event} event
   * @param {string=} warningType
   * @return {?Element}
   */
  static eventWarning(event, warningType) {
    const timelineData = TimelineModel.TimelineData.forEvent(event);
    const warning = warningType || timelineData.warning;
    if (!warning)
      return null;
    const warnings = TimelineModel.TimelineModel.WarningType;
    const span = createElement('span');
    const eventData = event.args['data'];

    switch (warning) {
      case warnings.ForcedStyle:
      case warnings.ForcedLayout:
        span.appendChild(UI.createDocumentationLink(
            '../../fundamentals/performance/rendering/avoid-large-complex-layouts-and-layout-thrashing#avoid-forced-synchronous-layouts',
            Common.UIString('Forced reflow')));
        span.createTextChild(Common.UIString(' is a likely performance bottleneck.'));
        break;
      case warnings.IdleDeadlineExceeded:
        span.textContent = Common.UIString(
            'Idle callback execution extended beyond deadline by ' +
            Number.millisToString(event.duration - eventData['allottedMilliseconds'], true));
        break;
      case warnings.LongHandler:
        span.textContent = Common.UIString('Handler took %s', Number.millisToString(event.duration, true));
        break;
      case warnings.LongRecurringHandler:
        span.textContent = Common.UIString('Recurring handler took %s', Number.millisToString(event.duration, true));
        break;
      case warnings.V8Deopt:
        span.appendChild(UI.XLink.create(
            'https://github.com/GoogleChrome/devtools-docs/issues/53', Common.UIString('Not optimized')));
        span.createTextChild(Common.UIString(': %s', eventData['deoptReason']));
        break;
      default:
        console.assert(false, 'Unhandled TimelineModel.WarningType');
    }
    return span;
  }

  /**
   * @param {!TimelineModel.TimelineModel.PageFrame} frame
   * @param {number=} trimAt
   */
  static displayNameForFrame(frame, trimAt) {
    const url = frame.url;
    if (!trimAt)
      trimAt = 30;
    return url.startsWith('about:') ? `"${frame.name.trimMiddle(trimAt)}"` : frame.url.trimEnd(trimAt);
  }
};

/**
 * @unrestricted
 */
Timeline.TimelineRecordStyle = class {
  /**
   * @param {string} title
   * @param {!Timeline.TimelineCategory} category
   * @param {boolean=} hidden
   */
  constructor(title, category, hidden) {
    this.title = title;
    this.category = category;
    this.hidden = !!hidden;
  }
};


/**
 * @enum {symbol}
 */
Timeline.TimelineUIUtils.NetworkCategory = {
  HTML: Symbol('HTML'),
  Script: Symbol('Script'),
  Style: Symbol('Style'),
  Media: Symbol('Media'),
  Other: Symbol('Other')
};


Timeline.TimelineUIUtils._aggregatedStatsKey = Symbol('aggregatedStats');


/**
 * @unrestricted
 */
Timeline.TimelineUIUtils.InvalidationsGroupElement = class extends UI.TreeElement {
  /**
   * @param {!SDK.Target} target
   * @param {?Map<number, ?SDK.DOMNode>} relatedNodesMap
   * @param {!Timeline.TimelineDetailsContentHelper} contentHelper
   * @param {!Array.<!TimelineModel.InvalidationTrackingEvent>} invalidations
   */
  constructor(target, relatedNodesMap, contentHelper, invalidations) {
    super('', true);

    this.listItemElement.classList.add('header');
    this.selectable = false;
    this.toggleOnClick = true;

    this._relatedNodesMap = relatedNodesMap;
    this._contentHelper = contentHelper;
    this._invalidations = invalidations;
    this.title = this._createTitle(target);
  }

  /**
   * @param {!SDK.Target} target
   * @return {!Element}
   */
  _createTitle(target) {
    const first = this._invalidations[0];
    const reason = first.cause.reason;
    const topFrame = first.cause.stackTrace && first.cause.stackTrace[0];

    const title = createElement('span');
    if (reason)
      title.createTextChild(Common.UIString('%s for ', reason));
    else
      title.createTextChild(Common.UIString('Unknown cause for '));

    this._appendTruncatedNodeList(title, this._invalidations);

    if (topFrame && this._contentHelper.linkifier()) {
      title.createTextChild(Common.UIString('. '));
      const stack = title.createChild('span', 'monospace');
      stack.createChild('span').textContent = Timeline.TimelineUIUtils.frameDisplayName(topFrame);
      const link = this._contentHelper.linkifier().maybeLinkifyConsoleCallFrame(target, topFrame);
      if (link) {
        stack.createChild('span').textContent = ' @ ';
        stack.createChild('span').appendChild(link);
      }
    }

    return title;
  }

  /**
   * @override
   */
  onpopulate() {
    const content = createElementWithClass('div', 'content');

    const first = this._invalidations[0];
    if (first.cause.stackTrace) {
      const stack = content.createChild('div');
      stack.createTextChild(Common.UIString('Stack trace:'));
      this._contentHelper.createChildStackTraceElement(
          stack, Timeline.TimelineUIUtils._stackTraceFromCallFrames(first.cause.stackTrace));
    }

    content.createTextChild(this._invalidations.length > 1 ? Common.UIString('Nodes:') : Common.UIString('Node:'));
    const nodeList = content.createChild('div', 'node-list');
    let firstNode = true;
    for (let i = 0; i < this._invalidations.length; i++) {
      const invalidation = this._invalidations[i];
      const invalidationNode = this._createInvalidationNode(invalidation, true);
      if (invalidationNode) {
        if (!firstNode)
          nodeList.createTextChild(Common.UIString(', '));
        firstNode = false;

        nodeList.appendChild(invalidationNode);

        const extraData = invalidation.extraData ? ', ' + invalidation.extraData : '';
        if (invalidation.changedId) {
          nodeList.createTextChild(Common.UIString('(changed id to "%s"%s)', invalidation.changedId, extraData));
        } else if (invalidation.changedClass) {
          nodeList.createTextChild(Common.UIString('(changed class to "%s"%s)', invalidation.changedClass, extraData));
        } else if (invalidation.changedAttribute) {
          nodeList.createTextChild(
              Common.UIString('(changed attribute to "%s"%s)', invalidation.changedAttribute, extraData));
        } else if (invalidation.changedPseudo) {
          nodeList.createTextChild(
              Common.UIString('(changed pesudo to "%s"%s)', invalidation.changedPseudo, extraData));
        } else if (invalidation.selectorPart) {
          nodeList.createTextChild(Common.UIString('(changed "%s"%s)', invalidation.selectorPart, extraData));
        }
      }
    }

    const contentTreeElement = new UI.TreeElement(content, false);
    contentTreeElement.selectable = false;
    this.appendChild(contentTreeElement);
  }

  /**
   * @param {!Element} parentElement
   * @param {!Array.<!TimelineModel.InvalidationTrackingEvent>} invalidations
   */
  _appendTruncatedNodeList(parentElement, invalidations) {
    const invalidationNodes = [];
    const invalidationNodeIdMap = {};
    for (let i = 0; i < invalidations.length; i++) {
      const invalidation = invalidations[i];
      const invalidationNode = this._createInvalidationNode(invalidation, false);
      invalidationNode.addEventListener('click', e => e.consume(), false);
      if (invalidationNode && !invalidationNodeIdMap[invalidation.nodeId]) {
        invalidationNodes.push(invalidationNode);
        invalidationNodeIdMap[invalidation.nodeId] = true;
      }
    }

    if (invalidationNodes.length === 1) {
      parentElement.appendChild(invalidationNodes[0]);
    } else if (invalidationNodes.length === 2) {
      parentElement.appendChild(invalidationNodes[0]);
      parentElement.createTextChild(Common.UIString(' and '));
      parentElement.appendChild(invalidationNodes[1]);
    } else if (invalidationNodes.length >= 3) {
      parentElement.appendChild(invalidationNodes[0]);
      parentElement.createTextChild(Common.UIString(', '));
      parentElement.appendChild(invalidationNodes[1]);
      parentElement.createTextChild(Common.UIString(', and %s others', invalidationNodes.length - 2));
    }
  }

  /**
   * @param {!TimelineModel.InvalidationTrackingEvent} invalidation
   * @param {boolean} showUnknownNodes
   */
  _createInvalidationNode(invalidation, showUnknownNodes) {
    const node = (invalidation.nodeId && this._relatedNodesMap) ? this._relatedNodesMap.get(invalidation.nodeId) : null;
    if (node) {
      const nodeSpan = createElement('span');
      Common.Linkifier.linkify(node).then(link => nodeSpan.appendChild(link));
      return nodeSpan;
    }
    if (invalidation.nodeName) {
      const nodeSpan = createElement('span');
      nodeSpan.textContent = Common.UIString('[ %s ]', invalidation.nodeName);
      return nodeSpan;
    }
    if (showUnknownNodes) {
      const nodeSpan = createElement('span');
      return nodeSpan.createTextChild(Common.UIString('[ unknown node ]'));
    }
  }
};

Timeline.TimelineUIUtils._previewElementSymbol = Symbol('previewElement');

/**
 * @unrestricted
 */
Timeline.TimelineUIUtils.EventDispatchTypeDescriptor = class {
  /**
   * @param {number} priority
   * @param {string} color
   * @param {!Array.<string>} eventTypes
   */
  constructor(priority, color, eventTypes) {
    this.priority = priority;
    this.color = color;
    this.eventTypes = eventTypes;
  }
};


/**
 * @unrestricted
 */
Timeline.TimelineCategory = class extends Common.Object {
  /**
   * @param {string} name
   * @param {string} title
   * @param {boolean} visible
   * @param {string} childColor
   * @param {string} color
   */
  constructor(name, title, visible, childColor, color) {
    super();
    this.name = name;
    this.title = title;
    this.visible = visible;
    this.childColor = childColor;
    this.color = color;
    this.hidden = false;
  }

  /**
   * @return {boolean}
   */
  get hidden() {
    return this._hidden;
  }

  /**
   * @param {boolean} hidden
   */
  set hidden(hidden) {
    this._hidden = hidden;
    this.dispatchEventToListeners(Timeline.TimelineCategory.Events.VisibilityChanged, this);
  }
};

/** @enum {symbol} */
Timeline.TimelineCategory.Events = {
  VisibilityChanged: Symbol('VisibilityChanged')
};

/**
 * @typedef {!{
 *     title: string,
 *     color: string,
 *     lineWidth: number,
 *     dashStyle: !Array.<number>,
 *     tall: boolean,
 *     lowPriority: boolean
 * }}
 */
Timeline.TimelineMarkerStyle;


/**
 * @unrestricted
 */
Timeline.TimelinePopupContentHelper = class {
  /**
   * @param {string} title
   */
  constructor(title) {
    this._contentTable = createElement('table');
    const titleCell = this._createCell(Common.UIString('%s - Details', title), 'timeline-details-title');
    titleCell.colSpan = 2;
    const titleRow = createElement('tr');
    titleRow.appendChild(titleCell);
    this._contentTable.appendChild(titleRow);
  }

  /**
   * @return {!Element}
   */
  contentTable() {
    return this._contentTable;
  }

  /**
   * @param {string|number} content
   * @param {string=} styleName
   */
  _createCell(content, styleName) {
    const text = createElement('label');
    text.createTextChild(String(content));
    const cell = createElement('td');
    cell.className = 'timeline-details';
    if (styleName)
      cell.className += ' ' + styleName;
    cell.textContent = content;
    return cell;
  }

  /**
   * @param {string} title
   * @param {string|number} content
   */
  appendTextRow(title, content) {
    const row = createElement('tr');
    row.appendChild(this._createCell(title, 'timeline-details-row-title'));
    row.appendChild(this._createCell(content, 'timeline-details-row-data'));
    this._contentTable.appendChild(row);
  }

  /**
   * @param {string} title
   * @param {!Node|string} content
   */
  appendElementRow(title, content) {
    const row = createElement('tr');
    const titleCell = this._createCell(title, 'timeline-details-row-title');
    row.appendChild(titleCell);
    const cell = createElement('td');
    cell.className = 'details';
    if (content instanceof Node)
      cell.appendChild(content);
    else
      cell.createTextChild(content || '');
    row.appendChild(cell);
    this._contentTable.appendChild(row);
  }
};

/**
 * @unrestricted
 */
Timeline.TimelineDetailsContentHelper = class {
  /**
   * @param {?SDK.Target} target
   * @param {?Components.Linkifier} linkifier
   */
  constructor(target, linkifier) {
    this.fragment = createDocumentFragment();

    this._linkifier = linkifier;
    this._target = target;

    this.element = createElementWithClass('div', 'timeline-details-view-block');
    this._tableElement = this.element.createChild('div', 'vbox timeline-details-chip-body');
    this.fragment.appendChild(this.element);
  }

  /**
   * @param {string} title
   * @param {string=} swatchColor
   */
  addSection(title, swatchColor) {
    if (!this._tableElement.hasChildNodes()) {
      this.element.removeChildren();
    } else {
      this.element = createElementWithClass('div', 'timeline-details-view-block');
      this.fragment.appendChild(this.element);
    }

    if (title) {
      const titleElement = this.element.createChild('div', 'timeline-details-chip-title');
      if (swatchColor)
        titleElement.createChild('div').style.backgroundColor = swatchColor;
      titleElement.createTextChild(title);
    }

    this._tableElement = this.element.createChild('div', 'vbox timeline-details-chip-body');
    this.fragment.appendChild(this.element);
  }

  /**
   * @return {?Components.Linkifier}
   */
  linkifier() {
    return this._linkifier;
  }

  /**
   * @param {string} title
   * @param {string|number|boolean} value
   */
  appendTextRow(title, value) {
    const rowElement = this._tableElement.createChild('div', 'timeline-details-view-row');
    rowElement.createChild('div', 'timeline-details-view-row-title').textContent = title;
    rowElement.createChild('div', 'timeline-details-view-row-value').textContent = value;
  }

  /**
   * @param {string} title
   * @param {!Node|string} content
   * @param {boolean=} isWarning
   * @param {boolean=} isStacked
   */
  appendElementRow(title, content, isWarning, isStacked) {
    const rowElement = this._tableElement.createChild('div', 'timeline-details-view-row');
    if (isWarning)
      rowElement.classList.add('timeline-details-warning');
    if (isStacked)
      rowElement.classList.add('timeline-details-stack-values');
    const titleElement = rowElement.createChild('div', 'timeline-details-view-row-title');
    titleElement.textContent = title;
    const valueElement = rowElement.createChild('div', 'timeline-details-view-row-value');
    if (content instanceof Node)
      valueElement.appendChild(content);
    else
      valueElement.createTextChild(content || '');
  }

  /**
   * @param {string} title
   * @param {string} url
   * @param {number} startLine
   * @param {number=} startColumn
   */
  appendLocationRow(title, url, startLine, startColumn) {
    if (!this._linkifier || !this._target)
      return;
    const link = this._linkifier.maybeLinkifyScriptLocation(this._target, null, url, startLine, startColumn);
    if (!link)
      return;
    this.appendElementRow(title, link);
  }

  /**
   * @param {string} title
   * @param {string} url
   * @param {number} startLine
   * @param {number=} endLine
   */
  appendLocationRange(title, url, startLine, endLine) {
    if (!this._linkifier || !this._target)
      return;
    const locationContent = createElement('span');
    const link = this._linkifier.maybeLinkifyScriptLocation(this._target, null, url, startLine);
    if (!link)
      return;
    locationContent.appendChild(link);
    locationContent.createTextChild(String.sprintf(' [%s\u2026%s]', startLine + 1, endLine + 1 || ''));
    this.appendElementRow(title, locationContent);
  }

  /**
   * @param {string} title
   * @param {!Protocol.Runtime.StackTrace} stackTrace
   */
  appendStackTrace(title, stackTrace) {
    if (!this._linkifier || !this._target)
      return;

    const rowElement = this._tableElement.createChild('div', 'timeline-details-view-row');
    rowElement.createChild('div', 'timeline-details-view-row-title').textContent = title;
    this.createChildStackTraceElement(rowElement, stackTrace);
  }

  /**
   * @param {!Element} parentElement
   * @param {!Protocol.Runtime.StackTrace} stackTrace
   */
  createChildStackTraceElement(parentElement, stackTrace) {
    if (!this._linkifier || !this._target)
      return;
    parentElement.classList.add('timeline-details-stack-values');
    const stackTraceElement =
        parentElement.createChild('div', 'timeline-details-view-row-value timeline-details-view-row-stack-trace');
    const callFrameContents =
        Components.JSPresentationUtils.buildStackTracePreviewContents(this._target, this._linkifier, stackTrace);
    stackTraceElement.appendChild(callFrameContents.element);
  }

  /**
   * @param {!SDK.TracingModel.Event} event
   * @param {string=} warningType
   */
  appendWarningRow(event, warningType) {
    const warning = Timeline.TimelineUIUtils.eventWarning(event, warningType);
    if (warning)
      this.appendElementRow(Common.UIString('Warning'), warning, true);
  }
};

Timeline.TimelineUIUtils._categoryBreakdownCacheSymbol = Symbol('categoryBreakdownCache');
