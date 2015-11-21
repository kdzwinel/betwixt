// Copyright (c) 2015 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * @constructor
 * @param {!WebInspector.AnimationModel.Animation} animation
 * @param {!WebInspector.AnimationTimeline} timeline
 * @param {!Element} parentElement
 */
WebInspector.AnimationUI = function(animation, timeline, parentElement) {
    this._animation = animation;
    this._timeline = timeline;
    this._parentElement = parentElement;

    if (this._animation.source().keyframesRule())
        this._keyframes =  this._animation.source().keyframesRule().keyframes();

    this._nameElement = parentElement.createChild("div", "animation-name");
    this._nameElement.textContent = this._animation.name();

    this._svg = parentElement.createSVGChild("svg", "animation-ui");
    this._svg.setAttribute("height", WebInspector.AnimationUI.Options.AnimationSVGHeight);
    this._svg.style.marginLeft = "-" + WebInspector.AnimationUI.Options.AnimationMargin + "px";
    this._svg.addEventListener("mousedown", this._mouseDown.bind(this, WebInspector.AnimationUI.MouseEvents.AnimationDrag, null));
    this._svg.addEventListener("contextmenu", this._onContextMenu.bind(this));
    this._activeIntervalGroup = this._svg.createSVGChild("g");

    /** @type {!Array.<{group: ?Element, animationLine: ?Element, keyframePoints: !Object.<number, !Element>, keyframeRender: !Object.<number, !Element>}>} */
    this._cachedElements = [];

    this._movementInMs = 0;
    this._color = WebInspector.AnimationUI.Color(this._animation);
}

/**
 * @enum {string}
 */
WebInspector.AnimationUI.MouseEvents = {
    AnimationDrag: "AnimationDrag",
    KeyframeMove: "KeyframeMove",
    StartEndpointMove: "StartEndpointMove",
    FinishEndpointMove: "FinishEndpointMove"
}

WebInspector.AnimationUI.prototype = {
    /**
     * @return {!WebInspector.AnimationModel.Animation}
     */
    animation: function()
    {
        return this._animation;
    },

    /**
     * @param {?WebInspector.DOMNode} node
     */
    setNode: function(node)
    {
        this._node = node;
    },

    /**
     * @param {!Element} parentElement
     * @param {string} className
     */
    _createLine: function(parentElement, className)
    {
        var line = parentElement.createSVGChild("line", className);
        line.setAttribute("x1", WebInspector.AnimationUI.Options.AnimationMargin);
        line.setAttribute("y1", WebInspector.AnimationUI.Options.AnimationHeight);
        line.setAttribute("y2", WebInspector.AnimationUI.Options.AnimationHeight);
        line.style.stroke = this._color;
        return line;
    },

    /**
     * @param {number} iteration
     * @param {!Element} parentElement
     */
    _drawAnimationLine: function(iteration, parentElement)
    {
        var cache = this._cachedElements[iteration];
        if (!cache.animationLine)
            cache.animationLine = this._createLine(parentElement, "animation-line");
        cache.animationLine.setAttribute("x2", (this._duration() * this._timeline.pixelMsRatio() + WebInspector.AnimationUI.Options.AnimationMargin).toFixed(2));
    },

    /**
     * @param {!Element} parentElement
     */
    _drawDelayLine: function(parentElement)
    {
        if (!this._delayLine) {
            this._delayLine = this._createLine(parentElement, "animation-delay-line");
            this._endDelayLine = this._createLine(parentElement, "animation-delay-line");
        }
        this._delayLine.setAttribute("x1", WebInspector.AnimationUI.Options.AnimationMargin);
        this._delayLine.setAttribute("x2", (this._delay() * this._timeline.pixelMsRatio() + WebInspector.AnimationUI.Options.AnimationMargin).toFixed(2));
        var leftMargin = (this._delay() + this._duration() * this._animation.source().iterations()) * this._timeline.pixelMsRatio();
        this._endDelayLine.style.transform = "translateX(" + Math.min(leftMargin, this._timeline.width()).toFixed(2) + "px)";
        this._endDelayLine.setAttribute("x1", WebInspector.AnimationUI.Options.AnimationMargin);
        this._endDelayLine.setAttribute("x2", (this._animation.source().endDelay() * this._timeline.pixelMsRatio() + WebInspector.AnimationUI.Options.AnimationMargin).toFixed(2));
    },

    /**
     * @param {number} iteration
     * @param {!Element} parentElement
     * @param {number} x
     * @param {number} keyframeIndex
     * @param {boolean} attachEvents
     */
    _drawPoint: function(iteration, parentElement, x, keyframeIndex, attachEvents)
    {
        if (this._cachedElements[iteration].keyframePoints[keyframeIndex]) {
            this._cachedElements[iteration].keyframePoints[keyframeIndex].setAttribute("cx", x.toFixed(2));
            return;
        }

        var circle = parentElement.createSVGChild("circle", keyframeIndex <= 0 ? "animation-endpoint" : "animation-keyframe-point");
        circle.setAttribute("cx", x.toFixed(2));
        circle.setAttribute("cy", WebInspector.AnimationUI.Options.AnimationHeight);
        circle.style.stroke = this._color;
        circle.setAttribute("r", WebInspector.AnimationUI.Options.AnimationMargin / 2);

        if (keyframeIndex <= 0)
            circle.style.fill = this._color;

        this._cachedElements[iteration].keyframePoints[keyframeIndex] = circle;

        if (!attachEvents)
            return;

        if (keyframeIndex === 0) {
            circle.addEventListener("mousedown", this._mouseDown.bind(this, WebInspector.AnimationUI.MouseEvents.StartEndpointMove, keyframeIndex));
        } else if (keyframeIndex === -1) {
            circle.addEventListener("mousedown", this._mouseDown.bind(this, WebInspector.AnimationUI.MouseEvents.FinishEndpointMove, keyframeIndex));
        } else {
            circle.addEventListener("mousedown", this._mouseDown.bind(this, WebInspector.AnimationUI.MouseEvents.KeyframeMove, keyframeIndex));
        }
    },

    /**
     * @param {number} iteration
     * @param {number} keyframeIndex
     * @param {!Element} parentElement
     * @param {number} leftDistance
     * @param {number} width
     * @param {string} easing
     */
    _renderKeyframe: function(iteration, keyframeIndex, parentElement, leftDistance, width, easing)
    {
        /**
         * @param {!Element} parentElement
         * @param {number} x
         * @param {string} strokeColor
         */
        function createStepLine(parentElement, x, strokeColor)
        {
            var line = parentElement.createSVGChild("line");
            line.setAttribute("x1", x);
            line.setAttribute("x2", x);
            line.setAttribute("y1", WebInspector.AnimationUI.Options.AnimationMargin);
            line.setAttribute("y2", WebInspector.AnimationUI.Options.AnimationHeight);
            line.style.stroke = strokeColor;
        }

        var bezier = WebInspector.Geometry.CubicBezier.parse(easing);
        var cache = this._cachedElements[iteration].keyframeRender;
        if (!cache[keyframeIndex])
            cache[keyframeIndex] = bezier ? parentElement.createSVGChild("path", "animation-keyframe") : parentElement.createSVGChild("g", "animation-keyframe-step");
        var group = cache[keyframeIndex];
        group.style.transform = "translateX(" + leftDistance.toFixed(2) + "px)";

        if (bezier) {
            group.style.fill = this._color;
            WebInspector.BezierUI.drawVelocityChart(bezier, group, width);
        } else {
            var stepFunction = WebInspector.AnimationTimeline.StepTimingFunction.parse(easing);
            group.removeChildren();
            const offsetMap = {"start": 0, "middle": 0.5, "end": 1};
            const offsetWeight = offsetMap[stepFunction.stepAtPosition];
            for (var i = 0; i < stepFunction.steps; i++)
                createStepLine(group, (i + offsetWeight) * width / stepFunction.steps, this._color);
        }
    },

    redraw: function()
    {
        var durationWithDelay = this._delay() + this._duration() * this._animation.source().iterations() + this._animation.source().endDelay();
        var leftMargin = ((this._animation.startTime() - this._timeline.startTime()) * this._timeline.pixelMsRatio());
        var maxWidth = this._timeline.width() - WebInspector.AnimationUI.Options.AnimationMargin - leftMargin;
        var svgWidth = Math.min(maxWidth, durationWithDelay * this._timeline.pixelMsRatio());

        this._svg.classList.toggle("animation-ui-canceled", this._animation.playState() === "idle");
        this._svg.setAttribute("width", (svgWidth + 2 * WebInspector.AnimationUI.Options.AnimationMargin).toFixed(2));
        this._svg.style.transform = "translateX(" + leftMargin.toFixed(2)  + "px)";
        this._activeIntervalGroup.style.transform = "translateX(" + (this._delay() * this._timeline.pixelMsRatio()).toFixed(2) + "px)";

        this._nameElement.style.transform = "translateX(" + (leftMargin + this._delay() * this._timeline.pixelMsRatio() + WebInspector.AnimationUI.Options.AnimationMargin).toFixed(2) + "px)";
        this._nameElement.style.width = (this._duration() * this._timeline.pixelMsRatio().toFixed(2)) + "px";
        this._drawDelayLine(this._svg);

        if (this._animation.type() === "CSSTransition") {
            this._renderTransition();
            return;
        }

        this._renderIteration(this._activeIntervalGroup, 0);
        if (!this._tailGroup)
            this._tailGroup = this._activeIntervalGroup.createSVGChild("g", "animation-tail-iterations");
        var iterationWidth = this._duration() * this._timeline.pixelMsRatio();
        for (var iteration = 1; iteration < this._animation.source().iterations() && iterationWidth * (iteration - 1) < this._timeline.width(); iteration++)
            this._renderIteration(this._tailGroup, iteration);
        while (iteration < this._cachedElements.length)
            this._cachedElements.pop().group.remove();
    },


    _renderTransition: function()
    {
        if (!this._cachedElements[0])
            this._cachedElements[0] = { animationLine: null, keyframePoints: {}, keyframeRender: {}, group: null };
        this._drawAnimationLine(0, this._activeIntervalGroup);
        this._renderKeyframe(0, 0, this._activeIntervalGroup, WebInspector.AnimationUI.Options.AnimationMargin, this._duration() * this._timeline.pixelMsRatio(), this._animation.source().easing());
        this._drawPoint(0, this._activeIntervalGroup, WebInspector.AnimationUI.Options.AnimationMargin, 0, true);
        this._drawPoint(0, this._activeIntervalGroup, this._duration() * this._timeline.pixelMsRatio() + WebInspector.AnimationUI.Options.AnimationMargin, -1, true);
    },

    /**
     * @param {!Element} parentElement
     * @param {number} iteration
     */
    _renderIteration: function(parentElement, iteration)
    {
        if (!this._cachedElements[iteration])
            this._cachedElements[iteration] = { animationLine: null, keyframePoints: {}, keyframeRender: {}, group: parentElement.createSVGChild("g") };
        var group = this._cachedElements[iteration].group;
        group.style.transform = "translateX(" + (iteration * this._duration() * this._timeline.pixelMsRatio()).toFixed(2) + "px)";
        this._drawAnimationLine(iteration, group);
        console.assert(this._keyframes.length > 1);
        for (var i = 0; i < this._keyframes.length - 1; i++) {
            var leftDistance = this._offset(i) * this._duration() * this._timeline.pixelMsRatio() + WebInspector.AnimationUI.Options.AnimationMargin;
            var width = this._duration() * (this._offset(i + 1) - this._offset(i)) * this._timeline.pixelMsRatio();
            this._renderKeyframe(iteration, i, group, leftDistance, width, this._keyframes[i].easing());
            if (i || (!i && iteration === 0))
                this._drawPoint(iteration, group, leftDistance, i, iteration === 0);
        }
        this._drawPoint(iteration, group, this._duration() * this._timeline.pixelMsRatio() + WebInspector.AnimationUI.Options.AnimationMargin, -1, iteration === 0);
    },

    /**
     * @return {number}
     */
    _delay: function()
    {
        var delay = this._animation.source().delay();
        if (this._mouseEventType === WebInspector.AnimationUI.MouseEvents.AnimationDrag || this._mouseEventType === WebInspector.AnimationUI.MouseEvents.StartEndpointMove)
            delay += this._movementInMs;
        // FIXME: add support for negative start delay
        return Math.max(0, delay);
    },

    /**
     * @return {number}
     */
    _duration: function()
    {
        var duration = this._animation.source().duration();
        if (this._mouseEventType === WebInspector.AnimationUI.MouseEvents.FinishEndpointMove)
            duration += this._movementInMs;
        else if (this._mouseEventType === WebInspector.AnimationUI.MouseEvents.StartEndpointMove)
            duration -= Math.max(this._movementInMs, -this._animation.source().delay()); // Cannot have negative delay
        return Math.max(0, duration);
    },

    /**
     * @param {number} i
     * @return {number} offset
     */
    _offset: function(i)
    {
        var offset = this._keyframes[i].offsetAsNumber();
        if (this._mouseEventType === WebInspector.AnimationUI.MouseEvents.KeyframeMove && i === this._keyframeMoved) {
            console.assert(i > 0 && i < this._keyframes.length - 1, "First and last keyframe cannot be moved");
            offset += this._movementInMs / this._animation.source().duration();
            offset = Math.max(offset, this._keyframes[i - 1].offsetAsNumber());
            offset = Math.min(offset, this._keyframes[i + 1].offsetAsNumber());
        }
        return offset;
    },

    /**
     * @param {!WebInspector.AnimationUI.MouseEvents} mouseEventType
     * @param {?number} keyframeIndex
     * @param {!Event} event
     */
    _mouseDown: function(mouseEventType, keyframeIndex, event)
    {
        if (event.buttons == 2)
            return;
        if (this._animation.playState() === "idle")
            return;
        this._mouseEventType = mouseEventType;
        this._keyframeMoved = keyframeIndex;
        this._downMouseX = event.clientX;
        this._mouseMoveHandler = this._mouseMove.bind(this);
        this._mouseUpHandler = this._mouseUp.bind(this);
        this._parentElement.ownerDocument.addEventListener("mousemove", this._mouseMoveHandler);
        this._parentElement.ownerDocument.addEventListener("mouseup", this._mouseUpHandler);
        event.preventDefault();
        event.stopPropagation();

        if (this._node)
            WebInspector.Revealer.reveal(this._node);
    },

    /**
     * @param {!Event} event
     */
    _mouseMove: function (event)
    {
        this._movementInMs = (event.clientX - this._downMouseX) / this._timeline.pixelMsRatio();
        if (this._animation.startTime() + this._delay() + this._duration() - this._timeline.startTime() > this._timeline.duration() * 0.8)
            this._timeline.setDuration(this._timeline.duration() * 1.2);
        this.redraw();
    },

    /**
     * @param {!Event} event
     */
    _mouseUp: function(event)
    {
        this._movementInMs = (event.clientX - this._downMouseX) / this._timeline.pixelMsRatio();

        // Commit changes
        if (this._mouseEventType === WebInspector.AnimationUI.MouseEvents.KeyframeMove)
            this._keyframes[this._keyframeMoved].setOffset(this._offset(this._keyframeMoved));
        else
            this._animation.setTiming(this._duration(), this._delay());

        this._movementInMs = 0;
        this.redraw();

        this._parentElement.ownerDocument.removeEventListener("mousemove", this._mouseMoveHandler);
        this._parentElement.ownerDocument.removeEventListener("mouseup", this._mouseUpHandler);
        delete this._mouseMoveHandler;
        delete this._mouseUpHandler;
        delete this._mouseEventType;
        delete this._downMouseX;
        delete this._keyframeMoved;
    },

    /**
     * @param {!Event} event
     */
    _onContextMenu: function(event)
    {
        /**
         * @param {?WebInspector.RemoteObject} remoteObject
         */
        function showContextMenu(remoteObject)
        {
            if (!remoteObject)
                return;
            var contextMenu = new WebInspector.ContextMenu(event);
            contextMenu.appendApplicableItems(remoteObject);
            contextMenu.show();
        }

        this._animation.remoteObjectPromise().then(showContextMenu);
        event.consume(true);
    }
}

WebInspector.AnimationUI.Options = {
    AnimationHeight: 32,
    AnimationSVGHeight: 80,
    AnimationMargin: 7,
    EndpointsClickRegionSize: 10,
    GridCanvasHeight: 40
}

WebInspector.AnimationUI.Colors = {
    "Purple": WebInspector.Color.parse("#9C27B0"),
    "Light Blue": WebInspector.Color.parse("#03A9F4"),
    "Deep Orange": WebInspector.Color.parse("#FF5722"),
    "Blue": WebInspector.Color.parse("#5677FC"),
    "Lime": WebInspector.Color.parse("#CDDC39"),
    "Blue Grey": WebInspector.Color.parse("#607D8B"),
    "Pink": WebInspector.Color.parse("#E91E63"),
    "Green": WebInspector.Color.parse("#0F9D58"),
    "Brown": WebInspector.Color.parse("#795548"),
    "Cyan": WebInspector.Color.parse("#00BCD4")
}

/**
 * @param {!WebInspector.AnimationModel.Animation} animation
 * @return {string}
 */
WebInspector.AnimationUI.Color = function(animation)
{
    /**
     * @param {string} string
     * @return {number}
     */
    function hash(string)
    {
        var hash = 0;
        for (var i = 0; i < string.length; i++)
            hash = (hash << 5) + hash + string.charCodeAt(i);
        return Math.abs(hash);
    }

    var names = Object.keys(WebInspector.AnimationUI.Colors);
    var color = WebInspector.AnimationUI.Colors[names[hash(animation.name() || animation.id()) % names.length]];
    return color.asString(WebInspector.Color.Format.RGB);
}
