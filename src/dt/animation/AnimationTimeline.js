// Copyright (c) 2015 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
/**
 * @implements {SDK.SDKModelObserver<!Animation.AnimationModel>}
 * @unrestricted
 */
Animation.AnimationTimeline = class extends UI.VBox {
  constructor() {
    super(true);
    this.registerRequiredCSS('animation/animationTimeline.css');
    this.element.classList.add('animations-timeline');

    this._grid = this.contentElement.createSVGChild('svg', 'animation-timeline-grid');

    this._playbackRate = 1;
    this._allPaused = false;
    this._createHeader();
    this._animationsContainer = this.contentElement.createChild('div', 'animation-timeline-rows');
    const timelineHint = this.contentElement.createChild('div', 'animation-timeline-rows-hint');
    timelineHint.textContent = ls`Select an effect above to inspect and modify.`;

    /** @const */ this._defaultDuration = 100;
    this._duration = this._defaultDuration;
    /** @const */ this._timelineControlsWidth = 150;
    /** @type {!Map.<!Protocol.DOM.BackendNodeId, !Animation.AnimationTimeline.NodeUI>} */
    this._nodesMap = new Map();
    this._uiAnimations = [];
    this._groupBuffer = [];
    /** @type {!Map.<!Animation.AnimationModel.AnimationGroup, !Animation.AnimationGroupPreviewUI>} */
    this._previewMap = new Map();
    this._symbol = Symbol('animationTimeline');
    /** @type {!Map.<string, !Animation.AnimationModel.Animation>} */
    this._animationsMap = new Map();
    SDK.targetManager.addModelListener(SDK.DOMModel, SDK.DOMModel.Events.NodeRemoved, this._nodeRemoved, this);
    SDK.targetManager.observeModels(Animation.AnimationModel, this);
    UI.context.addFlavorChangeListener(SDK.DOMNode, this._nodeChanged, this);
  }

  /**
   * @override
   */
  wasShown() {
    for (const animationModel of SDK.targetManager.models(Animation.AnimationModel))
      this._addEventListeners(animationModel);
  }

  /**
   * @override
   */
  willHide() {
    for (const animationModel of SDK.targetManager.models(Animation.AnimationModel))
      this._removeEventListeners(animationModel);
    this._popoverHelper.hidePopover();
  }

  /**
   * @override
   * @param {!Animation.AnimationModel} animationModel
   */
  modelAdded(animationModel) {
    if (this.isShowing())
      this._addEventListeners(animationModel);
  }

  /**
   * @override
   * @param {!Animation.AnimationModel} animationModel
   */
  modelRemoved(animationModel) {
    this._removeEventListeners(animationModel);
  }

  /**
   * @param {!Animation.AnimationModel} animationModel
   */
  _addEventListeners(animationModel) {
    animationModel.ensureEnabled();
    animationModel.addEventListener(
        Animation.AnimationModel.Events.AnimationGroupStarted, this._animationGroupStarted, this);
    animationModel.addEventListener(Animation.AnimationModel.Events.ModelReset, this._reset, this);
  }

  /**
   * @param {!Animation.AnimationModel} animationModel
   */
  _removeEventListeners(animationModel) {
    animationModel.removeEventListener(
        Animation.AnimationModel.Events.AnimationGroupStarted, this._animationGroupStarted, this);
    animationModel.removeEventListener(Animation.AnimationModel.Events.ModelReset, this._reset, this);
  }

  _nodeChanged() {
    for (const nodeUI of this._nodesMap.values())
      nodeUI._nodeChanged();
  }

  /**
   * @return {!Element} element
   */
  _createScrubber() {
    this._timelineScrubber = createElementWithClass('div', 'animation-scrubber hidden');
    this._timelineScrubberLine = this._timelineScrubber.createChild('div', 'animation-scrubber-line');
    this._timelineScrubberLine.createChild('div', 'animation-scrubber-head');
    this._timelineScrubber.createChild('div', 'animation-time-overlay');
    return this._timelineScrubber;
  }

  _createHeader() {
    const toolbarContainer = this.contentElement.createChild('div', 'animation-timeline-toolbar-container');
    const topToolbar = new UI.Toolbar('animation-timeline-toolbar', toolbarContainer);
    const clearButton = new UI.ToolbarButton(ls`Clear all`, 'largeicon-clear');
    clearButton.addEventListener(UI.ToolbarButton.Events.Click, this._reset.bind(this));
    topToolbar.appendToolbarItem(clearButton);
    topToolbar.appendSeparator();

    this._pauseButton = new UI.ToolbarToggle(ls`Pause all`, 'largeicon-pause', 'largeicon-resume');
    this._pauseButton.addEventListener(UI.ToolbarButton.Events.Click, this._togglePauseAll.bind(this));
    topToolbar.appendToolbarItem(this._pauseButton);

    const playbackRateControl = toolbarContainer.createChild('div', 'animation-playback-rate-control');
    this._playbackRateButtons = [];
    for (const playbackRate of Animation.AnimationTimeline.GlobalPlaybackRates) {
      const button = playbackRateControl.createChild('div', 'animation-playback-rate-button');
      button.textContent = playbackRate ? ls`${playbackRate * 100}%` : ls`Pause`;
      button.playbackRate = playbackRate;
      button.addEventListener('click', this._setPlaybackRate.bind(this, playbackRate));
      button.title = ls`Set speed to ${button.textContent}`;
      this._playbackRateButtons.push(button);
    }
    this._updatePlaybackControls();

    this._previewContainer = this.contentElement.createChild('div', 'animation-timeline-buffer');
    this._popoverHelper = new UI.PopoverHelper(this._previewContainer, this._getPopoverRequest.bind(this));
    this._popoverHelper.setDisableOnClick(true);
    this._popoverHelper.setTimeout(0);
    const emptyBufferHint = this.contentElement.createChild('div', 'animation-timeline-buffer-hint');
    emptyBufferHint.textContent = ls`Listening for animations...`;
    const container = this.contentElement.createChild('div', 'animation-timeline-header');
    const controls = container.createChild('div', 'animation-controls');
    this._currentTime = controls.createChild('div', 'animation-timeline-current-time monospace');

    const toolbar = new UI.Toolbar('animation-controls-toolbar', controls);
    this._controlButton = new UI.ToolbarToggle(ls`Replay timeline`, 'largeicon-replay-animation');
    this._controlState = Animation.AnimationTimeline._ControlState.Replay;
    this._controlButton.setToggled(true);
    this._controlButton.addEventListener(UI.ToolbarButton.Events.Click, this._controlButtonToggle.bind(this));
    toolbar.appendToolbarItem(this._controlButton);

    const gridHeader = container.createChild('div', 'animation-grid-header');
    UI.installDragHandle(
        gridHeader, this._repositionScrubber.bind(this), this._scrubberDragMove.bind(this),
        this._scrubberDragEnd.bind(this), 'text');
    container.appendChild(this._createScrubber());
    UI.installDragHandle(
        this._timelineScrubberLine, this._scrubberDragStart.bind(this), this._scrubberDragMove.bind(this),
        this._scrubberDragEnd.bind(this), 'col-resize');
    this._currentTime.textContent = '';

    return container;
  }

  /**
   * @param {!Event} event
   * @return {?UI.PopoverRequest}
   */
  _getPopoverRequest(event) {
    const element = event.target;
    if (!element.isDescendant(this._previewContainer))
      return null;

    return {
      box: event.target.boxInWindow(),
      show: popover => {
        let animGroup;
        for (const group of this._previewMap.keysArray()) {
          if (this._previewMap.get(group).element === element.parentElement)
            animGroup = group;
        }
        console.assert(animGroup);
        const screenshots = animGroup.screenshots();
        if (!screenshots.length)
          return Promise.resolve(false);

        let fulfill;
        const promise = new Promise(x => fulfill = x);
        if (!screenshots[0].complete)
          screenshots[0].onload = onFirstScreenshotLoaded.bind(null, screenshots);
        else
          onFirstScreenshotLoaded(screenshots);
        return promise;

        /**
         * @param  {!Array.<!Image>} screenshots
         */
        function onFirstScreenshotLoaded(screenshots) {
          new Animation.AnimationScreenshotPopover(screenshots).show(popover.contentElement);
          fulfill(true);
        }
      }
    };
  }

  _togglePauseAll() {
    this._allPaused = !this._allPaused;
    this._pauseButton.setToggled(this._allPaused);
    this._setPlaybackRate(this._playbackRate);
    this._pauseButton.setTitle(this._allPaused ? ls`Resume all` : ls`Pause all`);
  }

  /**
   * @param {number} playbackRate
   */
  _setPlaybackRate(playbackRate) {
    this._playbackRate = playbackRate;
    for (const animationModel of SDK.targetManager.models(Animation.AnimationModel))
      animationModel.setPlaybackRate(this._allPaused ? 0 : this._playbackRate);
    Host.userMetrics.actionTaken(Host.UserMetrics.Action.AnimationsPlaybackRateChanged);
    if (this._scrubberPlayer)
      this._scrubberPlayer.playbackRate = this._effectivePlaybackRate();

    this._updatePlaybackControls();
  }

  _updatePlaybackControls() {
    for (const button of this._playbackRateButtons) {
      const selected = this._playbackRate === button.playbackRate;
      button.classList.toggle('selected', selected);
    }
  }

  _controlButtonToggle() {
    if (this._controlState === Animation.AnimationTimeline._ControlState.Play)
      this._togglePause(false);
    else if (this._controlState === Animation.AnimationTimeline._ControlState.Replay)
      this._replay();
    else
      this._togglePause(true);
  }

  _updateControlButton() {
    this._controlButton.setEnabled(!!this._selectedGroup);
    if (this._selectedGroup && this._selectedGroup.paused()) {
      this._controlState = Animation.AnimationTimeline._ControlState.Play;
      this._controlButton.setToggled(true);
      this._controlButton.setTitle(ls`Play timeline`);
      this._controlButton.setGlyph('largeicon-play-animation');
    } else if (!this._scrubberPlayer || this._scrubberPlayer.currentTime >= this.duration()) {
      this._controlState = Animation.AnimationTimeline._ControlState.Replay;
      this._controlButton.setToggled(true);
      this._controlButton.setTitle(ls`Replay timeline`);
      this._controlButton.setGlyph('largeicon-replay-animation');
    } else {
      this._controlState = Animation.AnimationTimeline._ControlState.Pause;
      this._controlButton.setToggled(false);
      this._controlButton.setTitle(ls`Pause timeline`);
      this._controlButton.setGlyph('largeicon-pause-animation');
    }
  }

  /**
   * @return {number}
   */
  _effectivePlaybackRate() {
    return (this._allPaused || (this._selectedGroup && this._selectedGroup.paused())) ? 0 : this._playbackRate;
  }

  /**
   * @param {boolean} pause
   */
  _togglePause(pause) {
    this._selectedGroup.togglePause(pause);
    if (this._scrubberPlayer)
      this._scrubberPlayer.playbackRate = this._effectivePlaybackRate();
    this._previewMap.get(this._selectedGroup).element.classList.toggle('paused', pause);
    this._updateControlButton();
  }

  _replay() {
    if (!this._selectedGroup)
      return;
    this._selectedGroup.seekTo(0);
    this._animateTime(0);
    this._updateControlButton();
  }

  /**
   * @return {number}
   */
  duration() {
    return this._duration;
  }

  /**
   * @param {number} duration
   */
  setDuration(duration) {
    this._duration = duration;
    this.scheduleRedraw();
  }

  _clearTimeline() {
    this._uiAnimations = [];
    this._nodesMap.clear();
    this._animationsMap.clear();
    this._animationsContainer.removeChildren();
    this._duration = this._defaultDuration;
    this._timelineScrubber.classList.add('hidden');
    delete this._selectedGroup;
    if (this._scrubberPlayer)
      this._scrubberPlayer.cancel();
    delete this._scrubberPlayer;
    this._currentTime.textContent = '';
    this._updateControlButton();
  }

  _reset() {
    this._clearTimeline();
    if (this._allPaused)
      this._togglePauseAll();
    else
      this._setPlaybackRate(this._playbackRate);

    for (const group of this._groupBuffer)
      group.release();
    this._groupBuffer = [];
    this._previewMap.clear();
    this._previewContainer.removeChildren();
    this._popoverHelper.hidePopover();
    this._renderGrid();
  }

  /**
   * @param {!Common.Event} event
   */
  _animationGroupStarted(event) {
    this._addAnimationGroup(/** @type {!Animation.AnimationModel.AnimationGroup} */ (event.data));
  }

  /**
   * @param {!Animation.AnimationModel.AnimationGroup} group
   */
  _addAnimationGroup(group) {
    /**
     * @param {!Animation.AnimationModel.AnimationGroup} left
     * @param {!Animation.AnimationModel.AnimationGroup} right
     */
    function startTimeComparator(left, right) {
      return left.startTime() > right.startTime();
    }

    if (this._previewMap.get(group)) {
      if (this._selectedGroup === group)
        this._syncScrubber();
      else
        this._previewMap.get(group).replay();
      return;
    }
    this._groupBuffer.sort(startTimeComparator);
    // Discard oldest groups from buffer if necessary
    const groupsToDiscard = [];
    const bufferSize = this.width() / 50;
    while (this._groupBuffer.length > bufferSize) {
      const toDiscard = this._groupBuffer.splice(this._groupBuffer[0] === this._selectedGroup ? 1 : 0, 1);
      groupsToDiscard.push(toDiscard[0]);
    }
    for (const g of groupsToDiscard) {
      this._previewMap.get(g).element.remove();
      this._previewMap.delete(g);
      g.release();
    }
    // Generate preview
    const preview = new Animation.AnimationGroupPreviewUI(group);
    this._groupBuffer.push(group);
    this._previewMap.set(group, preview);
    this._previewContainer.appendChild(preview.element);
    preview.removeButton().addEventListener('click', this._removeAnimationGroup.bind(this, group));
    preview.element.addEventListener('click', this._selectAnimationGroup.bind(this, group));
  }

  /**
   * @param {!Animation.AnimationModel.AnimationGroup} group
   * @param {!Event} event
   */
  _removeAnimationGroup(group, event) {
    this._groupBuffer.remove(group);
    this._previewMap.get(group).element.remove();
    this._previewMap.delete(group);
    group.release();
    event.consume(true);

    if (this._selectedGroup === group) {
      this._clearTimeline();
      this._renderGrid();
    }
  }

  /**
   * @param {!Animation.AnimationModel.AnimationGroup} group
   */
  _selectAnimationGroup(group) {
    /**
     * @param {!Animation.AnimationGroupPreviewUI} ui
     * @param {!Animation.AnimationModel.AnimationGroup} group
     * @this {!Animation.AnimationTimeline}
     */
    function applySelectionClass(ui, group) {
      ui.element.classList.toggle('selected', this._selectedGroup === group);
    }

    if (this._selectedGroup === group) {
      this._togglePause(false);
      this._replay();
      return;
    }
    this._clearTimeline();
    this._selectedGroup = group;
    this._previewMap.forEach(applySelectionClass, this);
    this.setDuration(Math.max(500, group.finiteDuration() + 100));
    for (const anim of group.animations())
      this._addAnimation(anim);
    this.scheduleRedraw();
    this._timelineScrubber.classList.remove('hidden');
    this._togglePause(false);
    this._replay();
  }

  /**
   * @param {!Animation.AnimationModel.Animation} animation
   */
  _addAnimation(animation) {
    /**
     * @param {?SDK.DOMNode} node
     * @this {Animation.AnimationTimeline}
     */
    function nodeResolved(node) {
      nodeUI.nodeResolved(node);
      uiAnimation.setNode(node);
      if (node)
        node[this._symbol] = nodeUI;
    }

    let nodeUI = this._nodesMap.get(animation.source().backendNodeId());
    if (!nodeUI) {
      nodeUI = new Animation.AnimationTimeline.NodeUI(animation.source());
      this._animationsContainer.appendChild(nodeUI.element);
      this._nodesMap.set(animation.source().backendNodeId(), nodeUI);
    }
    const nodeRow = nodeUI.createNewRow();
    const uiAnimation = new Animation.AnimationUI(animation, this, nodeRow);
    animation.source().deferredNode().resolve(nodeResolved.bind(this));
    this._uiAnimations.push(uiAnimation);
    this._animationsMap.set(animation.id(), animation);
  }

  /**
   * @param {!Common.Event} event
   */
  _nodeRemoved(event) {
    const node = event.data.node;
    if (node[this._symbol])
      node[this._symbol].nodeRemoved();
  }

  _renderGrid() {
    /** @const */ const gridSize = 250;
    this._grid.setAttribute('width', this.width() + 10);
    this._grid.setAttribute('height', this._cachedTimelineHeight + 30);
    this._grid.setAttribute('shape-rendering', 'crispEdges');
    this._grid.removeChildren();
    let lastDraw = undefined;
    for (let time = 0; time < this.duration(); time += gridSize) {
      const line = this._grid.createSVGChild('rect', 'animation-timeline-grid-line');
      line.setAttribute('x', time * this.pixelMsRatio() + 10);
      line.setAttribute('y', 23);
      line.setAttribute('height', '100%');
      line.setAttribute('width', 1);
    }
    for (let time = 0; time < this.duration(); time += gridSize) {
      const gridWidth = time * this.pixelMsRatio();
      if (lastDraw === undefined || gridWidth - lastDraw > 50) {
        lastDraw = gridWidth;
        const label = this._grid.createSVGChild('text', 'animation-timeline-grid-label');
        label.textContent = Number.millisToString(time);
        label.setAttribute('x', gridWidth + 10);
        label.setAttribute('y', 16);
      }
    }
  }

  scheduleRedraw() {
    this._renderQueue = [];
    for (const ui of this._uiAnimations)
      this._renderQueue.push(ui);
    if (this._redrawing)
      return;
    this._redrawing = true;
    this._renderGrid();
    this._animationsContainer.window().requestAnimationFrame(this._render.bind(this));
  }

  /**
   * @param {number=} timestamp
   */
  _render(timestamp) {
    while (this._renderQueue.length && (!timestamp || window.performance.now() - timestamp < 50))
      this._renderQueue.shift().redraw();
    if (this._renderQueue.length)
      this._animationsContainer.window().requestAnimationFrame(this._render.bind(this));
    else
      delete this._redrawing;
  }

  /**
   * @override
   */
  onResize() {
    this._cachedTimelineWidth = Math.max(0, this._animationsContainer.offsetWidth - this._timelineControlsWidth) || 0;
    this._cachedTimelineHeight = this._animationsContainer.offsetHeight;
    this.scheduleRedraw();
    if (this._scrubberPlayer)
      this._syncScrubber();
    delete this._gridOffsetLeft;
  }

  /**
   * @return {number}
   */
  width() {
    return this._cachedTimelineWidth || 0;
  }

  /**
   * @param {!Animation.AnimationModel.Animation} animation
   * @return {boolean}
   */
  _resizeWindow(animation) {
    let resized = false;

    // This shows at most 3 iterations
    const duration = animation.source().duration() * Math.min(2, animation.source().iterations());
    const requiredDuration = animation.source().delay() + duration + animation.source().endDelay();
    if (requiredDuration > this._duration) {
      resized = true;
      this._duration = requiredDuration + 200;
    }
    return resized;
  }

  _syncScrubber() {
    if (!this._selectedGroup)
      return;
    this._selectedGroup.currentTimePromise()
        .then(this._animateTime.bind(this))
        .then(this._updateControlButton.bind(this));
  }

  /**
   * @param {number} currentTime
   */
  _animateTime(currentTime) {
    if (this._scrubberPlayer)
      this._scrubberPlayer.cancel();

    this._scrubberPlayer = this._timelineScrubber.animate(
        [{transform: 'translateX(0px)'}, {transform: 'translateX(' + this.width() + 'px)'}],
        {duration: this.duration(), fill: 'forwards'});
    this._scrubberPlayer.playbackRate = this._effectivePlaybackRate();
    this._scrubberPlayer.onfinish = this._updateControlButton.bind(this);
    this._scrubberPlayer.currentTime = currentTime;
    this.element.window().requestAnimationFrame(this._updateScrubber.bind(this));
  }

  /**
   * @return {number}
   */
  pixelMsRatio() {
    return this.width() / this.duration() || 0;
  }

  /**
   * @param {number} timestamp
   */
  _updateScrubber(timestamp) {
    if (!this._scrubberPlayer)
      return;
    this._currentTime.textContent = Number.millisToString(this._scrubberPlayer.currentTime);
    if (this._scrubberPlayer.playState === 'pending' || this._scrubberPlayer.playState === 'running')
      this.element.window().requestAnimationFrame(this._updateScrubber.bind(this));
    else if (this._scrubberPlayer.playState === 'finished')
      this._currentTime.textContent = '';
  }

  /**
   * @param {!Event} event
   * @return {boolean}
   */
  _repositionScrubber(event) {
    if (!this._selectedGroup)
      return false;

    // Seek to current mouse position.
    if (!this._gridOffsetLeft)
      this._gridOffsetLeft = this._grid.totalOffsetLeft() + 10;
    const seekTime = Math.max(0, event.x - this._gridOffsetLeft) / this.pixelMsRatio();
    this._selectedGroup.seekTo(seekTime);
    this._togglePause(true);
    this._animateTime(seekTime);

    // Interface with scrubber drag.
    this._originalScrubberTime = seekTime;
    this._originalMousePosition = event.x;
    return true;
  }

  /**
   * @param {!Event} event
   * @return {boolean}
   */
  _scrubberDragStart(event) {
    if (!this._scrubberPlayer || !this._selectedGroup)
      return false;

    this._originalScrubberTime = this._scrubberPlayer.currentTime;
    this._timelineScrubber.classList.remove('animation-timeline-end');
    this._scrubberPlayer.pause();
    this._originalMousePosition = event.x;

    this._togglePause(true);
    return true;
  }

  /**
   * @param {!Event} event
   */
  _scrubberDragMove(event) {
    const delta = event.x - this._originalMousePosition;
    const currentTime =
        Math.max(0, Math.min(this._originalScrubberTime + delta / this.pixelMsRatio(), this.duration()));
    this._scrubberPlayer.currentTime = currentTime;
    this._currentTime.textContent = Number.millisToString(Math.round(currentTime));
    this._selectedGroup.seekTo(currentTime);
  }

  /**
   * @param {!Event} event
   */
  _scrubberDragEnd(event) {
    const currentTime = Math.max(0, this._scrubberPlayer.currentTime);
    this._scrubberPlayer.play();
    this._scrubberPlayer.currentTime = currentTime;
    this._currentTime.window().requestAnimationFrame(this._updateScrubber.bind(this));
  }
};

Animation.AnimationTimeline.GlobalPlaybackRates = [1, 0.25, 0.1];

/** @enum {string} */
Animation.AnimationTimeline._ControlState = {
  Play: 'play-outline',
  Replay: 'replay-outline',
  Pause: 'pause-outline'
};

/**
 * @unrestricted
 */
Animation.AnimationTimeline.NodeUI = class {
  /**
   * @param {!Animation.AnimationModel.AnimationEffect} animationEffect
   */
  constructor(animationEffect) {
    this.element = createElementWithClass('div', 'animation-node-row');
    this._description = this.element.createChild('div', 'animation-node-description');
    this._timelineElement = this.element.createChild('div', 'animation-node-timeline');
  }

  /**
   * @param {?SDK.DOMNode} node
   */
  async nodeResolved(node) {
    if (!node) {
      this._description.createTextChild('<node>');
      return;
    }
    this._node = node;
    this._nodeChanged();
    Common.Linkifier.linkify(node).then(link => this._description.appendChild(link));
    if (!node.ownerDocument)
      this.nodeRemoved();
  }

  /**
   * @return {!Element}
   */
  createNewRow() {
    return this._timelineElement.createChild('div', 'animation-timeline-row');
  }

  nodeRemoved() {
    this.element.classList.add('animation-node-removed');
    this._node = null;
  }

  _nodeChanged() {
    this.element.classList.toggle(
        'animation-node-selected', this._node && this._node === UI.context.flavor(SDK.DOMNode));
  }
};

/**
 * @unrestricted
 */
Animation.AnimationTimeline.StepTimingFunction = class {
  /**
   * @param {number} steps
   * @param {string} stepAtPosition
   */
  constructor(steps, stepAtPosition) {
    this.steps = steps;
    this.stepAtPosition = stepAtPosition;
  }

  /**
   * @param {string} text
   * @return {?Animation.AnimationTimeline.StepTimingFunction}
   */
  static parse(text) {
    let match = text.match(/^steps\((\d+), (start|middle)\)$/);
    if (match)
      return new Animation.AnimationTimeline.StepTimingFunction(parseInt(match[1], 10), match[2]);
    match = text.match(/^steps\((\d+)\)$/);
    if (match)
      return new Animation.AnimationTimeline.StepTimingFunction(parseInt(match[1], 10), 'end');
    return null;
  }
};
