// Copyright (c) 2015 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * @constructor
 * @extends {WebInspector.VBox}
 * @implements {WebInspector.TargetManager.Observer}
 */
WebInspector.AnimationTimeline = function()
{
    WebInspector.VBox.call(this, true);
    this.registerRequiredCSS("animation/animationTimeline.css");
    this.element.classList.add("animations-timeline");

    this._grid = this.contentElement.createSVGChild("svg", "animation-timeline-grid");
    this.contentElement.appendChild(this._createScrubber());
    WebInspector.installDragHandle(this._timelineScrubberHead, this._scrubberDragStart.bind(this), this._scrubberDragMove.bind(this), this._scrubberDragEnd.bind(this), "move");
    this._timelineScrubberHead.textContent = WebInspector.UIString(Number.millisToString(0));

    this._underlyingPlaybackRate = 1;
    this.contentElement.appendChild(this._createHeader());
    this._animationsContainer = this.contentElement.createChild("div", "animation-timeline-rows");

    this._emptyTimelineMessage = this._animationsContainer.createChild("div", "animation-timeline-empty-message");
    var message = this._emptyTimelineMessage.createChild("div");
    message.textContent = WebInspector.UIString("Trigger animations on the page to view and tweak them on the animation timeline.");

    this._duration = this._defaultDuration();
    this._scrubberRadius = 30;
    this._timelineControlsWidth = 230;
    /** @type {!Map.<!DOMAgent.BackendNodeId, !WebInspector.AnimationTimeline.NodeUI>} */
    this._nodesMap = new Map();
    this._groupBuffer = [];
    this._groupBufferSize = 8;
    /** @type {!Map.<!WebInspector.AnimationModel.AnimationGroup, !WebInspector.AnimationGroupPreviewUI>} */
    this._previewMap = new Map();
    this._symbol = Symbol("animationTimeline");
    /** @type {!Map.<string, !WebInspector.AnimationModel.Animation>} */
    this._animationsMap = new Map();
    WebInspector.targetManager.addModelListener(WebInspector.ResourceTreeModel, WebInspector.ResourceTreeModel.EventTypes.MainFrameNavigated, this._mainFrameNavigated, this);
    WebInspector.targetManager.addModelListener(WebInspector.DOMModel, WebInspector.DOMModel.Events.NodeRemoved, this._nodeRemoved, this);

    WebInspector.targetManager.observeTargets(this, WebInspector.Target.Type.Page);
}

WebInspector.AnimationTimeline.GlobalPlaybackRates = [0.1, 0.25, 0.5, 1.0];

WebInspector.AnimationTimeline.prototype = {
    wasShown: function()
    {
        for (var target of WebInspector.targetManager.targets(WebInspector.Target.Type.Page))
            this._addEventListeners(target);
    },

    willHide: function()
    {
        for (var target of WebInspector.targetManager.targets(WebInspector.Target.Type.Page))
            this._removeEventListeners(target);
    },

    /**
     * @override
     * @param {!WebInspector.Target} target
     */
    targetAdded: function(target)
    {
        if (this.isShowing())
            this._addEventListeners(target);
    },

    /**
     * @override
     * @param {!WebInspector.Target} target
     */
    targetRemoved: function(target)
    {
        this._removeEventListeners(target);
    },

    /**
     * @param {!WebInspector.Target} target
     */
    _addEventListeners: function(target)
    {
        var animationModel = WebInspector.AnimationModel.fromTarget(target);
        animationModel.ensureEnabled();
        animationModel.addEventListener(WebInspector.AnimationModel.Events.AnimationGroupStarted, this._animationGroupStarted, this);
    },

    /**
     * @param {!WebInspector.Target} target
     */
    _removeEventListeners: function(target)
    {
        var animationModel = WebInspector.AnimationModel.fromTarget(target);
        animationModel.removeEventListener(WebInspector.AnimationModel.Events.AnimationGroupStarted, this._animationGroupStarted, this);
    },

    /**
     * @param {?WebInspector.DOMNode} node
     */
    setNode: function(node)
    {
        for (var nodeUI of this._nodesMap.values())
            nodeUI.setNode(node);
    },

    /**
     * @return {!Element} element
     */
    _createScrubber: function() {
        this._timelineScrubber = createElementWithClass("div", "animation-scrubber hidden");
        this._timelineScrubber.createChild("div", "animation-time-overlay");
        this._timelineScrubber.createChild("div", "animation-scrubber-arrow");
        this._timelineScrubberHead = this._timelineScrubber.createChild("div", "animation-scrubber-head");
        var timerContainer = this._timelineScrubber.createChild("div", "animation-timeline-timer");
        this._timerSpinner = timerContainer.createChild("div", "timer-spinner timer-hemisphere");
        this._timerFiller = timerContainer.createChild("div", "timer-filler timer-hemisphere");
        this._timerMask = timerContainer.createChild("div", "timer-mask");
        return this._timelineScrubber;
    },

    /**
     * @return {!Element}
     */
    _createHeader: function()
    {
        /**
         * @param {!Event} event
         * @this {WebInspector.AnimationTimeline}
         */
        function playbackSliderInputHandler(event)
        {
            this._underlyingPlaybackRate = WebInspector.AnimationTimeline.GlobalPlaybackRates[event.target.value];
            this._updatePlaybackControls();
        }

        var container = createElementWithClass("div", "animation-timeline-header");
        var controls = container.createChild("div", "animation-controls");
        this._previewContainer = container.createChild("div", "animation-timeline-buffer");

        var toolbar = new WebInspector.Toolbar(controls);
        toolbar.element.classList.add("animation-controls-toolbar");
        this._controlButton = new WebInspector.ToolbarButton(WebInspector.UIString("Replay timeline"), "replay-outline-toolbar-item");
        this._controlButton.addEventListener("click", this._controlButtonToggle.bind(this));
        toolbar.appendToolbarItem(this._controlButton);

        this._playbackLabel = controls.createChild("span", "animation-playback-label");
        this._playbackLabel.createTextChild("1x");
        this._playbackLabel.addEventListener("keydown", this._playbackLabelInput.bind(this));
        this._playbackLabel.addEventListener("focusout", this._playbackLabelInput.bind(this));

        this._playbackSlider = controls.createChild("input", "animation-playback-slider");
        this._playbackSlider.type = "range";
        this._playbackSlider.min = 0;
        this._playbackSlider.max = WebInspector.AnimationTimeline.GlobalPlaybackRates.length - 1;
        this._playbackSlider.value = this._playbackSlider.max;
        this._playbackSlider.addEventListener("input", playbackSliderInputHandler.bind(this));
        this._updateAnimationsPlaybackRate();

        return container;
    },

    /**
     * @param {!Event} event
     */
    _playbackLabelInput: function(event)
    {
        var element = /** @type {!Element} */(event.currentTarget);
        if (event.type !== "focusout" && !WebInspector.handleElementValueModifications(event, element) && !isEnterKey(event))
            return;

        var value = parseFloat(this._playbackLabel.textContent);
        if (!isNaN(value))
            this._underlyingPlaybackRate = Math.max(0, value);
        this._updatePlaybackControls();
        event.consume(true);
    },

    _updatePlaybackControls: function()
    {
        this._playbackLabel.textContent = this._underlyingPlaybackRate + "x";
        var playbackSliderValue = 0;
        for (var rate of WebInspector.AnimationTimeline.GlobalPlaybackRates) {
            if (this._underlyingPlaybackRate > rate)
                playbackSliderValue++;
        }
        this._playbackSlider.value = playbackSliderValue;

        var target = WebInspector.targetManager.mainTarget();
        if (target)
            WebInspector.AnimationModel.fromTarget(target).setPlaybackRate(this._underlyingPlaybackRate);
        WebInspector.userMetrics.actionTaken(WebInspector.UserMetrics.Action.AnimationsPlaybackRateChanged);
        if (this._scrubberPlayer)
            this._scrubberPlayer.playbackRate = this._effectivePlaybackRate();
    },

    _controlButtonToggle: function()
    {
        if (this._emptyTimelineMessage)
            return;
        if (this._controlButton.element.classList.contains("play-outline-toolbar-item"))
            this._togglePause(false);
        else if (this._controlButton.element.classList.contains("replay-outline-toolbar-item"))
            this._replay();
        else
            this._togglePause(true);
        this._updateControlButton();
    },

    _updateControlButton: function()
    {
        this._controlButton.setEnabled(!!this._selectedGroup);
        this._controlButton.element.classList.remove("play-outline-toolbar-item");
        this._controlButton.element.classList.remove("replay-outline-toolbar-item");
        this._controlButton.element.classList.remove("pause-outline-toolbar-item");
        if (this._selectedGroup && this._selectedGroup.paused()) {
            this._controlButton.element.classList.add("play-outline-toolbar-item");
            this._controlButton.setTitle(WebInspector.UIString("Play timeline"));
            this._controlButton.setToggled(true);
        } else if (!this._scrubberPlayer || this._scrubberPlayer.currentTime >= this.duration() - this._scrubberRadius / this.pixelMsRatio()) {
            this._controlButton.element.classList.add("replay-outline-toolbar-item");
            this._controlButton.setTitle(WebInspector.UIString("Replay timeline"));
            this._controlButton.setToggled(true);
        } else {
            this._controlButton.element.classList.add("pause-outline-toolbar-item");
            this._controlButton.setTitle(WebInspector.UIString("Pause timeline"));
            this._controlButton.setToggled(false);
        }
    },

    _updateAnimationsPlaybackRate: function()
    {
        /**
         * @param {number} playbackRate
         * @this {WebInspector.AnimationTimeline}
         */
        function syncPlaybackRate(playbackRate)
        {
            this._underlyingPlaybackRate = playbackRate;
            this._updatePlaybackControls();
        }

        for (var target of WebInspector.targetManager.targets(WebInspector.Target.Type.Page))
            WebInspector.AnimationModel.fromTarget(target).playbackRatePromise().then(syncPlaybackRate.bind(this));
    },

    /**
     * @return {number}
     */
    _effectivePlaybackRate: function()
    {
        return this._selectedGroup && this._selectedGroup.paused() ? 0 : this._underlyingPlaybackRate;
    },

    /**
     * @param {boolean} pause
     */
    _togglePause: function(pause)
    {
        this._selectedGroup.togglePause(pause);
        if (this._scrubberPlayer)
            this._scrubberPlayer.playbackRate = this._effectivePlaybackRate();
    },

    _replay: function()
    {
        if (!this._selectedGroup)
            return;
        this._selectedGroup.seekTo(0);
        this._animateTime(0);
    },

    /**
     * @return {number}
     */
    _defaultDuration: function ()
    {
        return 100;
    },

    /**
     * @return {number}
     */
    duration: function()
    {
        return this._duration;
    },

    /**
     * @param {number} duration
     */
    setDuration: function(duration)
    {
        this._duration = duration;
        this.scheduleRedraw();
    },

    /**
     * @return {number|undefined}
     */
    startTime: function()
    {
        return this._startTime;
    },

    _reset: function()
    {
        if (!this._nodesMap.size)
            return;

        this._nodesMap.clear();
        this._animationsMap.clear();
        this._animationsContainer.removeChildren();
        this._duration = this._defaultDuration();
        delete this._startTime;
    },

    /**
     * @param {!WebInspector.Event} event
     */
    _mainFrameNavigated: function(event)
    {
        this._reset();
        this._updateAnimationsPlaybackRate();
        if (this._underlyingPlaybackRate === 0) {
            this._underlyingPlaybackRate = 1;
            this._updatePlaybackControls();
        }
        if (this._scrubberPlayer)
            this._scrubberPlayer.cancel();
        delete this._scrubberPlayer;
        this._timelineScrubberHead.textContent = WebInspector.UIString(Number.millisToString(0));
        this._updateControlButton();
        this._groupBuffer = [];
        this._previewMap.clear();
        this._previewContainer.removeChildren();
    },

    /**
     * @param {!WebInspector.Event} event
     */
    _animationGroupStarted: function(event)
    {
        this._addAnimationGroup(/** @type {!WebInspector.AnimationModel.AnimationGroup} */(event.data));
    },

    /**
     * @param {!WebInspector.AnimationModel.AnimationGroup} group
     */
    _addAnimationGroup: function(group)
    {
        /**
         * @param {!WebInspector.AnimationModel.AnimationGroup} left
         * @param {!WebInspector.AnimationModel.AnimationGroup} right
         */
        function startTimeComparator(left, right)
        {
            return left.startTime() > right.startTime();
        }

        if (this._previewMap.get(group)) {
            if (this._selectedGroup === group)
                this._syncScrubber();
            this._previewMap.get(group).element.animate([{ opacity: "0.3", transform: "scale(0.7)" }, { opacity: "1", transform: "scale(1)" }], { duration : 150, easing: "cubic-bezier(0, 0, 0.2, 1)" });
            return;
        }
        this._groupBuffer.push(group);
        this._groupBuffer.sort(startTimeComparator);
        // Discard oldest groups from buffer if necessary
        var groupsToDiscard = [];
        while (this._groupBuffer.length > this._groupBufferSize) {
            var toDiscard = this._groupBuffer.splice(this._groupBuffer[0] === this._selectedGroup ? 1 : 0, 1);
            groupsToDiscard.push(toDiscard[0]);
        }
        for (var g of groupsToDiscard) {
            this._previewMap.get(g).element.remove();
            this._previewMap.delete(g);
            // TODO(samli): needs to discard model too
        }
        // Generate preview
        var preview = new WebInspector.AnimationGroupPreviewUI(group);
        this._previewMap.set(group, preview);
        this._previewContainer.appendChild(preview.element);
        preview.element.addEventListener("click", this._selectAnimationGroup.bind(this, group));
    },

    /**
     * @param {!WebInspector.AnimationModel.AnimationGroup} group
     */
    _selectAnimationGroup: function(group)
    {
        /**
         * @param {!WebInspector.AnimationGroupPreviewUI} ui
         * @param {!WebInspector.AnimationModel.AnimationGroup} group
         * @this {!WebInspector.AnimationTimeline}
         */
        function applySelectionClass(ui, group)
        {
            ui.element.classList.toggle("selected", this._selectedGroup === group);
        }

        if (this._selectedGroup === group)
            return;
        this._selectedGroup = group;
        this._previewMap.forEach(applySelectionClass, this);
        this._reset();
        for (var anim of group.animations())
            this._addAnimation(anim);
        this.scheduleRedraw();
        this._timelineScrubber.classList.remove("hidden");
        this._syncScrubber();
    },

    /**
     * @param {!WebInspector.AnimationModel.Animation} animation
     */
    _addAnimation: function(animation)
    {
        /**
         * @param {?WebInspector.DOMNode} node
         * @this {WebInspector.AnimationTimeline}
         */
        function nodeResolved(node)
        {
            if (!node)
                return;
            uiAnimation.setNode(node);
            node[this._symbol] = nodeUI;
        }

        if (this._emptyTimelineMessage) {
            this._emptyTimelineMessage.remove();
            delete this._emptyTimelineMessage;
        }

        // Ignore Web Animations custom effects & groups
        if (animation.type() === "WebAnimation" && animation.source().keyframesRule().keyframes().length === 0)
            return;

        this._resizeWindow(animation);

        var nodeUI = this._nodesMap.get(animation.source().backendNodeId());
        if (!nodeUI) {
            nodeUI = new WebInspector.AnimationTimeline.NodeUI(animation.source());
            this._animationsContainer.appendChild(nodeUI.element);
            this._nodesMap.set(animation.source().backendNodeId(), nodeUI);
        }
        var nodeRow = nodeUI.findRow(animation);
        var uiAnimation = new WebInspector.AnimationUI(animation, this, nodeRow.element);
        animation.source().deferredNode().resolve(nodeResolved.bind(this));
        nodeRow.animations.push(uiAnimation);
        this._animationsMap.set(animation.id(), animation);
    },

    /**
     * @param {!WebInspector.Event} event
     */
    _nodeRemoved: function(event)
    {
        var node = event.data.node;
        if (node[this._symbol])
            node[this._symbol].nodeRemoved();
    },

    _renderGrid: function()
    {
        const gridSize = 250;
        this._grid.setAttribute("width", this.width());
        this._grid.setAttribute("height", this._animationsContainer.offsetHeight + 43);
        this._grid.setAttribute("shape-rendering", "crispEdges");
        this._grid.removeChildren();
        var lastDraw = undefined;
        for (var time = 0; time < this.duration(); time += gridSize) {
            var line = this._grid.createSVGChild("rect", "animation-timeline-grid-line");
            line.setAttribute("x", time * this.pixelMsRatio());
            line.setAttribute("y", 0);
            line.setAttribute("height", "100%");
            line.setAttribute("width", 1);
        }
        for (var time = 0; time < this.duration(); time += gridSize) {
            var gridWidth = time * this.pixelMsRatio();
            if (!lastDraw || gridWidth - lastDraw > 50) {
                lastDraw = gridWidth;
                var label = this._grid.createSVGChild("text", "animation-timeline-grid-label");
                label.setAttribute("x", gridWidth + 5);
                label.setAttribute("y", 15);
                label.textContent = WebInspector.UIString(Number.millisToString(time));
            }
        }
    },

    scheduleRedraw: function() {
        if (this._redrawing)
            return;
        this._redrawing = true;
        this._animationsContainer.window().requestAnimationFrame(this._redraw.bind(this));
    },

    /**
     * @param {number=} timestamp
     */
    _redraw: function(timestamp)
    {
        delete this._redrawing;
        for (var nodeUI of this._nodesMap.values())
            nodeUI.redraw();
        this._renderGrid();
    },

    onResize: function()
    {
        this._cachedTimelineWidth = Math.max(0, this._animationsContainer.offsetWidth - this._timelineControlsWidth) || 0;
        this.scheduleRedraw();
        if (this._scrubberPlayer)
            this._syncScrubber();
    },

    /**
     * @return {number}
     */
    width: function()
    {
        return this._cachedTimelineWidth || 0;
    },

    /**
     * @param {!WebInspector.AnimationModel.Animation} animation
     * @return {boolean}
     */
    _resizeWindow: function(animation)
    {
        var resized = false;
        if (!this._startTime)
            this._startTime = animation.startTime();

        // This shows at most 3 iterations
        var duration = animation.source().duration() * Math.min(3, animation.source().iterations());
        var requiredDuration = animation.startTime() + animation.source().delay() + duration + animation.source().endDelay() - this.startTime();
        if (requiredDuration > this._duration * 0.8) {
            resized = true;
            this._duration = requiredDuration * 1.5;
        }
        return resized;
    },

    _syncScrubber: function()
    {
        if (!this._selectedGroup)
            return;
        this._selectedGroup.currentTimePromise()
            .then(this._animateTime.bind(this))
            .then(this._updateControlButton.bind(this));
    },

    /**
      * @param {number} currentTime
      */
    _animateTime: function(currentTime)
    {
        if (this._scrubberPlayer)
            this._scrubberPlayer.cancel();

        var scrubberDuration = this.duration() - this._scrubberRadius / this.pixelMsRatio();
        this._scrubberPlayer = this._timelineScrubber.animate([
            { transform: "translateX(0px)" },
            { transform: "translateX(" +  (this.width() - this._scrubberRadius) + "px)" }
        ], { duration: scrubberDuration , fill: "forwards" });
        this._scrubberPlayer.playbackRate = this._effectivePlaybackRate();
        this._scrubberPlayer.onfinish = this._updateControlButton.bind(this);
        this._scrubberPlayer.currentTime = currentTime;
        this._timelineScrubber.classList.remove("animation-timeline-end");
        this._timelineScrubberHead.window().requestAnimationFrame(this._updateScrubber.bind(this));
    },

    /**
     * @return {number}
     */
    pixelMsRatio: function()
    {
        return this.width() / this.duration() || 0;
    },

    /**
     * @param {number} timestamp
     */
    _updateScrubber: function(timestamp)
    {
        if (!this._scrubberPlayer)
            return;
        this._timelineScrubberHead.textContent = WebInspector.UIString(Number.millisToString(this._scrubberPlayer.currentTime));
        if (this._scrubberPlayer.playState === "pending" || this._scrubberPlayer.playState === "running") {
            this._timelineScrubberHead.window().requestAnimationFrame(this._updateScrubber.bind(this));
        } else if (this._scrubberPlayer.playState === "finished") {
            this._timelineScrubberHead.textContent = WebInspector.UIString(". . .");
            this._timelineScrubber.classList.add("animation-timeline-end");
        }
    },

    /**
     * @param {!Event} event
     * @return {boolean}
     */
    _scrubberDragStart: function(event)
    {
        if (!this._scrubberPlayer || !this._selectedGroup)
            return false;

        this._originalScrubberTime = this._scrubberPlayer.currentTime;
        this._timelineScrubber.classList.remove("animation-timeline-end");
        this._scrubberPlayer.pause();
        this._originalMousePosition = new WebInspector.Geometry.Point(event.x, event.y);

        this._togglePause(true);
        this._updateControlButton();
        return true;
    },

    /**
     * @param {!Event} event
     */
    _scrubberDragMove: function(event)
    {
        var delta = event.x - this._originalMousePosition.x;
        this._scrubberPlayer.currentTime = Math.min(this._originalScrubberTime + delta / this.pixelMsRatio(), this.duration() - this._scrubberRadius / this.pixelMsRatio());
        var currentTime = Math.max(0, Math.round(this._scrubberPlayer.currentTime));
        this._timelineScrubberHead.textContent = WebInspector.UIString(Number.millisToString(currentTime));
        this._selectedGroup.seekTo(currentTime);
    },

    /**
     * @param {!Event} event
     */
    _scrubberDragEnd: function(event)
    {
        var currentTime = Math.max(0, this._scrubberPlayer.currentTime);
        this._scrubberPlayer.play();
        this._scrubberPlayer.currentTime = currentTime;
        this._timelineScrubberHead.window().requestAnimationFrame(this._updateScrubber.bind(this));
    },

    __proto__: WebInspector.VBox.prototype
}

/**
 * @constructor
 * @param {!WebInspector.AnimationModel.AnimationEffect} animationEffect
 */
WebInspector.AnimationTimeline.NodeUI = function(animationEffect)
{
    /**
     * @param {?WebInspector.DOMNode} node
     * @this {WebInspector.AnimationTimeline.NodeUI}
     */
    function nodeResolved(node)
    {
        if (!node)
            return;
        this._node = node;
        WebInspector.DOMPresentationUtils.decorateNodeLabel(node, this._description);
        this.element.addEventListener("click", WebInspector.Revealer.reveal.bind(WebInspector.Revealer, node, undefined), false);
    }

    this._rows = [];
    this.element = createElementWithClass("div", "animation-node-row");
    this._description = this.element.createChild("div", "animation-node-description");
    animationEffect.deferredNode().resolve(nodeResolved.bind(this));
    this._timelineElement = this.element.createChild("div", "animation-node-timeline");
}

/** @typedef {{element: !Element, animations: !Array<!WebInspector.AnimationUI>}} */
WebInspector.AnimationTimeline.NodeRow;

WebInspector.AnimationTimeline.NodeUI.prototype = {
    /**
     * @param {!WebInspector.AnimationModel.Animation} animation
     * @return {!WebInspector.AnimationTimeline.NodeRow}
     */
    findRow: function(animation)
    {
        // Check if it can fit into an existing row
        var existingRow = this._collapsibleIntoRow(animation);
        if (existingRow)
            return existingRow;

        // Create new row
        var container = this._timelineElement.createChild("div", "animation-timeline-row");
        var nodeRow = {element: container, animations: []};
        this._rows.push(nodeRow);
        return nodeRow;
    },

    redraw: function()
    {
        for (var nodeRow of this._rows) {
            for (var ui of nodeRow.animations)
                ui.redraw();
        }
    },

    /**
     * @param {!WebInspector.AnimationModel.Animation} animation
     * @return {?WebInspector.AnimationTimeline.NodeRow}
     */
    _collapsibleIntoRow: function(animation)
    {
        if (animation.endTime() === Infinity)
            return null;
        for (var nodeRow of this._rows) {
            var overlap = false;
            for (var ui of nodeRow.animations)
                overlap |= animation.overlaps(ui.animation());
            if (!overlap)
                return nodeRow;
        }
        return null;
    },

    nodeRemoved: function()
    {
        this.element.classList.add("animation-node-removed");
    },

    /**
     * @param {?WebInspector.DOMNode} node
     */
    setNode: function(node)
    {
        this.element.classList.toggle("animation-node-selected", node === this._node);
    }
}

/**
 * @constructor
 * @param {number} steps
 * @param {string} stepAtPosition
 */
WebInspector.AnimationTimeline.StepTimingFunction = function(steps, stepAtPosition)
{
    this.steps = steps;
    this.stepAtPosition = stepAtPosition;
}

/**
 * @param {string} text
 * @return {?WebInspector.AnimationTimeline.StepTimingFunction}
 */
WebInspector.AnimationTimeline.StepTimingFunction.parse = function(text) {
    var match = text.match(/^step-(start|middle|end)$/);
    if (match)
        return new WebInspector.AnimationTimeline.StepTimingFunction(1, match[1]);
    match = text.match(/^steps\((\d+), (start|middle|end)\)$/);
    if (match)
        return new WebInspector.AnimationTimeline.StepTimingFunction(parseInt(match[1], 10), match[2]);
    return null;
}
