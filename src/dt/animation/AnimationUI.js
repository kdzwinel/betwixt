// Copyright (c) 2015 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
/**
 * @unrestricted
 */
Animation.AnimationUI = class {
  /**
   * @param {!Animation.AnimationModel.Animation} animation
   * @param {!Animation.AnimationTimeline} timeline
   * @param {!Element} parentElement
   */
  constructor(animation, timeline, parentElement) {
    this._animation = animation;
    this._timeline = timeline;
    this._parentElement = parentElement;

    if (this._animation.source().keyframesRule())
      this._keyframes = this._animation.source().keyframesRule().keyframes();

    this._nameElement = parentElement.createChild('div', 'animation-name');
    this._nameElement.textContent = this._animation.name();

    this._svg = parentElement.createSVGChild('svg', 'animation-ui');
    this._svg.setAttribute('height', Animation.AnimationUI.Options.AnimationSVGHeight);
    this._svg.style.marginLeft = '-' + Animation.AnimationUI.Options.AnimationMargin + 'px';
    this._svg.addEventListener('contextmenu', this._onContextMenu.bind(this));
    this._activeIntervalGroup = this._svg.createSVGChild('g');
    UI.installDragHandle(
        this._activeIntervalGroup, this._mouseDown.bind(this, Animation.AnimationUI.MouseEvents.AnimationDrag, null),
        this._mouseMove.bind(this), this._mouseUp.bind(this), '-webkit-grabbing', '-webkit-grab');

    /** @type {!Array.<{group: ?Element, animationLine: ?Element, keyframePoints: !Object.<number, !Element>, keyframeRender: !Object.<number, !Element>}>} */
    this._cachedElements = [];

    this._movementInMs = 0;
    this._color = Animation.AnimationUI.Color(this._animation);
  }

  /**
   * @param {!Animation.AnimationModel.Animation} animation
   * @return {string}
   */
  static Color(animation) {
    const names = Object.keys(Animation.AnimationUI.Colors);
    const color =
        Animation.AnimationUI.Colors[names[String.hashCode(animation.name() || animation.id()) % names.length]];
    return color.asString(Common.Color.Format.RGB);
  }

  /**
   * @return {!Animation.AnimationModel.Animation}
   */
  animation() {
    return this._animation;
  }

  /**
   * @param {?SDK.DOMNode} node
   */
  setNode(node) {
    this._node = node;
  }

  /**
   * @param {!Element} parentElement
   * @param {string} className
   */
  _createLine(parentElement, className) {
    const line = parentElement.createSVGChild('line', className);
    line.setAttribute('x1', Animation.AnimationUI.Options.AnimationMargin);
    line.setAttribute('y1', Animation.AnimationUI.Options.AnimationHeight);
    line.setAttribute('y2', Animation.AnimationUI.Options.AnimationHeight);
    line.style.stroke = this._color;
    return line;
  }

  /**
   * @param {number} iteration
   * @param {!Element} parentElement
   */
  _drawAnimationLine(iteration, parentElement) {
    const cache = this._cachedElements[iteration];
    if (!cache.animationLine)
      cache.animationLine = this._createLine(parentElement, 'animation-line');
    cache.animationLine.setAttribute(
        'x2',
        (this._duration() * this._timeline.pixelMsRatio() + Animation.AnimationUI.Options.AnimationMargin).toFixed(2));
  }

  /**
   * @param {!Element} parentElement
   */
  _drawDelayLine(parentElement) {
    if (!this._delayLine) {
      this._delayLine = this._createLine(parentElement, 'animation-delay-line');
      this._endDelayLine = this._createLine(parentElement, 'animation-delay-line');
    }
    const fill = this._animation.source().fill();
    this._delayLine.classList.toggle('animation-fill', fill === 'backwards' || fill === 'both');
    const margin = Animation.AnimationUI.Options.AnimationMargin;
    this._delayLine.setAttribute('x1', margin);
    this._delayLine.setAttribute('x2', (this._delay() * this._timeline.pixelMsRatio() + margin).toFixed(2));
    const forwardsFill = fill === 'forwards' || fill === 'both';
    this._endDelayLine.classList.toggle('animation-fill', forwardsFill);
    const leftMargin = Math.min(
        this._timeline.width(),
        (this._delay() + this._duration() * this._animation.source().iterations()) * this._timeline.pixelMsRatio());
    this._endDelayLine.style.transform = 'translateX(' + leftMargin.toFixed(2) + 'px)';
    this._endDelayLine.setAttribute('x1', margin);
    this._endDelayLine.setAttribute(
        'x2', forwardsFill ? (this._timeline.width() - leftMargin + margin).toFixed(2) :
                             (this._animation.source().endDelay() * this._timeline.pixelMsRatio() + margin).toFixed(2));
  }

  /**
   * @param {number} iteration
   * @param {!Element} parentElement
   * @param {number} x
   * @param {number} keyframeIndex
   * @param {boolean} attachEvents
   */
  _drawPoint(iteration, parentElement, x, keyframeIndex, attachEvents) {
    if (this._cachedElements[iteration].keyframePoints[keyframeIndex]) {
      this._cachedElements[iteration].keyframePoints[keyframeIndex].setAttribute('cx', x.toFixed(2));
      return;
    }

    const circle =
        parentElement.createSVGChild('circle', keyframeIndex <= 0 ? 'animation-endpoint' : 'animation-keyframe-point');
    circle.setAttribute('cx', x.toFixed(2));
    circle.setAttribute('cy', Animation.AnimationUI.Options.AnimationHeight);
    circle.style.stroke = this._color;
    circle.setAttribute('r', Animation.AnimationUI.Options.AnimationMargin / 2);

    if (keyframeIndex <= 0)
      circle.style.fill = this._color;

    this._cachedElements[iteration].keyframePoints[keyframeIndex] = circle;

    if (!attachEvents)
      return;

    let eventType;
    if (keyframeIndex === 0)
      eventType = Animation.AnimationUI.MouseEvents.StartEndpointMove;
    else if (keyframeIndex === -1)
      eventType = Animation.AnimationUI.MouseEvents.FinishEndpointMove;
    else
      eventType = Animation.AnimationUI.MouseEvents.KeyframeMove;
    UI.installDragHandle(
        circle, this._mouseDown.bind(this, eventType, keyframeIndex), this._mouseMove.bind(this),
        this._mouseUp.bind(this), 'ew-resize');
  }

  /**
   * @param {number} iteration
   * @param {number} keyframeIndex
   * @param {!Element} parentElement
   * @param {number} leftDistance
   * @param {number} width
   * @param {string} easing
   */
  _renderKeyframe(iteration, keyframeIndex, parentElement, leftDistance, width, easing) {
    /**
     * @param {!Element} parentElement
     * @param {number} x
     * @param {string} strokeColor
     */
    function createStepLine(parentElement, x, strokeColor) {
      const line = parentElement.createSVGChild('line');
      line.setAttribute('x1', x);
      line.setAttribute('x2', x);
      line.setAttribute('y1', Animation.AnimationUI.Options.AnimationMargin);
      line.setAttribute('y2', Animation.AnimationUI.Options.AnimationHeight);
      line.style.stroke = strokeColor;
    }

    const bezier = UI.Geometry.CubicBezier.parse(easing);
    const cache = this._cachedElements[iteration].keyframeRender;
    if (!cache[keyframeIndex]) {
      cache[keyframeIndex] = bezier ? parentElement.createSVGChild('path', 'animation-keyframe') :
                                      parentElement.createSVGChild('g', 'animation-keyframe-step');
    }
    const group = cache[keyframeIndex];
    group.style.transform = 'translateX(' + leftDistance.toFixed(2) + 'px)';

    if (easing === 'linear') {
      group.style.fill = this._color;
      const height = InlineEditor.BezierUI.Height;
      group.setAttribute(
          'd', ['M', 0, height, 'L', 0, 5, 'L', width.toFixed(2), 5, 'L', width.toFixed(2), height, 'Z'].join(' '));
    } else if (bezier) {
      group.style.fill = this._color;
      InlineEditor.BezierUI.drawVelocityChart(bezier, group, width);
    } else {
      const stepFunction = Animation.AnimationTimeline.StepTimingFunction.parse(easing);
      group.removeChildren();
      /** @const */ const offsetMap = {'start': 0, 'middle': 0.5, 'end': 1};
      /** @const */ const offsetWeight = offsetMap[stepFunction.stepAtPosition];
      for (let i = 0; i < stepFunction.steps; i++)
        createStepLine(group, (i + offsetWeight) * width / stepFunction.steps, this._color);
    }
  }

  redraw() {
    const maxWidth = this._timeline.width() - Animation.AnimationUI.Options.AnimationMargin;

    this._svg.setAttribute('width', (maxWidth + 2 * Animation.AnimationUI.Options.AnimationMargin).toFixed(2));
    this._activeIntervalGroup.style.transform =
        'translateX(' + (this._delay() * this._timeline.pixelMsRatio()).toFixed(2) + 'px)';

    this._nameElement.style.transform = 'translateX(' +
        (this._delay() * this._timeline.pixelMsRatio() + Animation.AnimationUI.Options.AnimationMargin).toFixed(2) +
        'px)';
    this._nameElement.style.width = (this._duration() * this._timeline.pixelMsRatio()).toFixed(2) + 'px';
    this._drawDelayLine(this._svg);

    if (this._animation.type() === 'CSSTransition') {
      this._renderTransition();
      return;
    }

    this._renderIteration(this._activeIntervalGroup, 0);
    if (!this._tailGroup)
      this._tailGroup = this._activeIntervalGroup.createSVGChild('g', 'animation-tail-iterations');
    const iterationWidth = this._duration() * this._timeline.pixelMsRatio();
    let iteration;
    for (iteration = 1;
         iteration < this._animation.source().iterations() && iterationWidth * (iteration - 1) < this._timeline.width();
         iteration++)
      this._renderIteration(this._tailGroup, iteration);
    while (iteration < this._cachedElements.length)
      this._cachedElements.pop().group.remove();
  }

  _renderTransition() {
    if (!this._cachedElements[0])
      this._cachedElements[0] = {animationLine: null, keyframePoints: {}, keyframeRender: {}, group: null};
    this._drawAnimationLine(0, this._activeIntervalGroup);
    this._renderKeyframe(
        0, 0, this._activeIntervalGroup, Animation.AnimationUI.Options.AnimationMargin,
        this._duration() * this._timeline.pixelMsRatio(), this._animation.source().easing());
    this._drawPoint(0, this._activeIntervalGroup, Animation.AnimationUI.Options.AnimationMargin, 0, true);
    this._drawPoint(
        0, this._activeIntervalGroup,
        this._duration() * this._timeline.pixelMsRatio() + Animation.AnimationUI.Options.AnimationMargin, -1, true);
  }

  /**
   * @param {!Element} parentElement
   * @param {number} iteration
   */
  _renderIteration(parentElement, iteration) {
    if (!this._cachedElements[iteration]) {
      this._cachedElements[iteration] =
          {animationLine: null, keyframePoints: {}, keyframeRender: {}, group: parentElement.createSVGChild('g')};
    }
    const group = this._cachedElements[iteration].group;
    group.style.transform =
        'translateX(' + (iteration * this._duration() * this._timeline.pixelMsRatio()).toFixed(2) + 'px)';
    this._drawAnimationLine(iteration, group);
    console.assert(this._keyframes.length > 1);
    for (let i = 0; i < this._keyframes.length - 1; i++) {
      const leftDistance = this._offset(i) * this._duration() * this._timeline.pixelMsRatio() +
          Animation.AnimationUI.Options.AnimationMargin;
      const width = this._duration() * (this._offset(i + 1) - this._offset(i)) * this._timeline.pixelMsRatio();
      this._renderKeyframe(iteration, i, group, leftDistance, width, this._keyframes[i].easing());
      if (i || (!i && iteration === 0))
        this._drawPoint(iteration, group, leftDistance, i, iteration === 0);
    }
    this._drawPoint(
        iteration, group,
        this._duration() * this._timeline.pixelMsRatio() + Animation.AnimationUI.Options.AnimationMargin, -1,
        iteration === 0);
  }

  /**
   * @return {number}
   */
  _delay() {
    let delay = this._animation.source().delay();
    if (this._mouseEventType === Animation.AnimationUI.MouseEvents.AnimationDrag ||
        this._mouseEventType === Animation.AnimationUI.MouseEvents.StartEndpointMove)
      delay += this._movementInMs;
    // FIXME: add support for negative start delay
    return Math.max(0, delay);
  }

  /**
   * @return {number}
   */
  _duration() {
    let duration = this._animation.source().duration();
    if (this._mouseEventType === Animation.AnimationUI.MouseEvents.FinishEndpointMove)
      duration += this._movementInMs;
    else if (this._mouseEventType === Animation.AnimationUI.MouseEvents.StartEndpointMove)
      duration -= Math.max(this._movementInMs, -this._animation.source().delay());  // Cannot have negative delay
    return Math.max(0, duration);
  }

  /**
   * @param {number} i
   * @return {number} offset
   */
  _offset(i) {
    let offset = this._keyframes[i].offsetAsNumber();
    if (this._mouseEventType === Animation.AnimationUI.MouseEvents.KeyframeMove && i === this._keyframeMoved) {
      console.assert(i > 0 && i < this._keyframes.length - 1, 'First and last keyframe cannot be moved');
      offset += this._movementInMs / this._animation.source().duration();
      offset = Math.max(offset, this._keyframes[i - 1].offsetAsNumber());
      offset = Math.min(offset, this._keyframes[i + 1].offsetAsNumber());
    }
    return offset;
  }

  /**
   * @param {!Animation.AnimationUI.MouseEvents} mouseEventType
   * @param {?number} keyframeIndex
   * @param {!Event} event
   */
  _mouseDown(mouseEventType, keyframeIndex, event) {
    if (event.buttons === 2)
      return false;
    if (this._svg.enclosingNodeOrSelfWithClass('animation-node-removed'))
      return false;
    this._mouseEventType = mouseEventType;
    this._keyframeMoved = keyframeIndex;
    this._downMouseX = event.clientX;
    event.consume(true);
    if (this._node)
      Common.Revealer.reveal(this._node);
    return true;
  }

  /**
   * @param {!Event} event
   */
  _mouseMove(event) {
    this._movementInMs = (event.clientX - this._downMouseX) / this._timeline.pixelMsRatio();
    if (this._delay() + this._duration() > this._timeline.duration() * 0.8)
      this._timeline.setDuration(this._timeline.duration() * 1.2);
    this.redraw();
  }

  /**
   * @param {!Event} event
   */
  _mouseUp(event) {
    this._movementInMs = (event.clientX - this._downMouseX) / this._timeline.pixelMsRatio();

    // Commit changes
    if (this._mouseEventType === Animation.AnimationUI.MouseEvents.KeyframeMove)
      this._keyframes[this._keyframeMoved].setOffset(this._offset(this._keyframeMoved));
    else
      this._animation.setTiming(this._duration(), this._delay());

    this._movementInMs = 0;
    this.redraw();

    delete this._mouseEventType;
    delete this._downMouseX;
    delete this._keyframeMoved;
  }

  /**
   * @param {!Event} event
   */
  _onContextMenu(event) {
    /**
     * @param {?SDK.RemoteObject} remoteObject
     */
    function showContextMenu(remoteObject) {
      if (!remoteObject)
        return;
      const contextMenu = new UI.ContextMenu(event);
      contextMenu.appendApplicableItems(remoteObject);
      contextMenu.show();
    }

    this._animation.remoteObjectPromise().then(showContextMenu);
    event.consume(true);
  }
};

/**
 * @enum {string}
 */
Animation.AnimationUI.MouseEvents = {
  AnimationDrag: 'AnimationDrag',
  KeyframeMove: 'KeyframeMove',
  StartEndpointMove: 'StartEndpointMove',
  FinishEndpointMove: 'FinishEndpointMove'
};

Animation.AnimationUI.Options = {
  AnimationHeight: 26,
  AnimationSVGHeight: 50,
  AnimationMargin: 7,
  EndpointsClickRegionSize: 10,
  GridCanvasHeight: 40
};

Animation.AnimationUI.Colors = {
  'Purple': Common.Color.parse('#9C27B0'),
  'Light Blue': Common.Color.parse('#03A9F4'),
  'Deep Orange': Common.Color.parse('#FF5722'),
  'Blue': Common.Color.parse('#5677FC'),
  'Lime': Common.Color.parse('#CDDC39'),
  'Blue Grey': Common.Color.parse('#607D8B'),
  'Pink': Common.Color.parse('#E91E63'),
  'Green': Common.Color.parse('#0F9D58'),
  'Brown': Common.Color.parse('#795548'),
  'Cyan': Common.Color.parse('#00BCD4')
};
