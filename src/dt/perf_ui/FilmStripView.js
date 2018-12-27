// Copyright 2015 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
/**
 * @unrestricted
 */
PerfUI.FilmStripView = class extends UI.HBox {
  constructor() {
    super(true);
    this.registerRequiredCSS('perf_ui/filmStripView.css');
    this.contentElement.classList.add('film-strip-view');
    this._statusLabel = this.contentElement.createChild('div', 'label');
    this.reset();
    this.setMode(PerfUI.FilmStripView.Modes.TimeBased);
  }

  /**
   * @param {!Element} imageElement
   * @param {?string} data
   */
  static _setImageData(imageElement, data) {
    if (data)
      imageElement.src = 'data:image/jpg;base64,' + data;
  }

  /**
   * @param {string} mode
   */
  setMode(mode) {
    this._mode = mode;
    this.contentElement.classList.toggle('time-based', mode === PerfUI.FilmStripView.Modes.TimeBased);
    this.update();
  }

  /**
   * @param {!SDK.FilmStripModel} filmStripModel
   * @param {number} zeroTime
   * @param {number} spanTime
   */
  setModel(filmStripModel, zeroTime, spanTime) {
    this._model = filmStripModel;
    this._zeroTime = zeroTime;
    this._spanTime = spanTime;
    const frames = filmStripModel.frames();
    if (!frames.length) {
      this.reset();
      return;
    }
    this.update();
  }

  /**
   * @param {!SDK.FilmStripModel.Frame} frame
   * @return {!Promise<!Element>}
   */
  createFrameElement(frame) {
    const time = frame.timestamp;
    const element = createElementWithClass('div', 'frame');
    element.title = Common.UIString('Doubleclick to zoom image. Click to view preceding requests.');
    element.createChild('div', 'time').textContent = Number.millisToString(time - this._zeroTime);
    const imageElement = element.createChild('div', 'thumbnail').createChild('img');
    element.addEventListener(
        'mousedown', this._onMouseEvent.bind(this, PerfUI.FilmStripView.Events.FrameSelected, time), false);
    element.addEventListener(
        'mouseenter', this._onMouseEvent.bind(this, PerfUI.FilmStripView.Events.FrameEnter, time), false);
    element.addEventListener(
        'mouseout', this._onMouseEvent.bind(this, PerfUI.FilmStripView.Events.FrameExit, time), false);
    element.addEventListener('dblclick', this._onDoubleClick.bind(this, frame), false);

    return frame.imageDataPromise()
        .then(PerfUI.FilmStripView._setImageData.bind(null, imageElement))
        .then(returnElement);
    /**
     * @return {!Element}
     */
    function returnElement() {
      return element;
    }
  }

  /**
   * @param {number} time
   * @return {!SDK.FilmStripModel.Frame}
   */
  frameByTime(time) {
    /**
     * @param {number} time
     * @param {!SDK.FilmStripModel.Frame} frame
     * @return {number}
     */
    function comparator(time, frame) {
      return time - frame.timestamp;
    }
    // Using the first frame to fill the interval between recording start
    // and a moment the frame is taken.
    const frames = this._model.frames();
    const index = Math.max(frames.upperBound(time, comparator) - 1, 0);
    return frames[index];
  }

  update() {
    if (!this._model)
      return;
    const frames = this._model.frames();
    if (!frames.length)
      return;

    if (this._mode === PerfUI.FilmStripView.Modes.FrameBased) {
      Promise.all(frames.map(this.createFrameElement.bind(this))).then(appendElements.bind(this));
      return;
    }

    const width = this.contentElement.clientWidth;
    const scale = this._spanTime / width;
    this.createFrameElement(frames[0]).then(
        continueWhenFrameImageLoaded.bind(this));  // Calculate frame width basing on the first frame.

    /**
     * @this {PerfUI.FilmStripView}
     * @param {!Element} element0
     */
    function continueWhenFrameImageLoaded(element0) {
      const frameWidth = Math.ceil(UI.measurePreferredSize(element0, this.contentElement).width);
      if (!frameWidth)
        return;

      const promises = [];
      for (let pos = frameWidth; pos < width; pos += frameWidth) {
        const time = pos * scale + this._zeroTime;
        promises.push(this.createFrameElement(this.frameByTime(time)).then(fixWidth));
      }
      Promise.all(promises).then(appendElements.bind(this));
      /**
       * @param {!Element} element
       * @return {!Element}
       */
      function fixWidth(element) {
        element.style.width = frameWidth + 'px';
        return element;
      }
    }

    /**
     * @param {!Array.<!Element>} elements
     * @this {PerfUI.FilmStripView}
     */
    function appendElements(elements) {
      this.contentElement.removeChildren();
      for (let i = 0; i < elements.length; ++i)
        this.contentElement.appendChild(elements[i]);
    }
  }

  /**
   * @override
   */
  onResize() {
    if (this._mode === PerfUI.FilmStripView.Modes.FrameBased)
      return;
    this.update();
  }

  /**
   * @param {string} eventName
   * @param {number} timestamp
   */
  _onMouseEvent(eventName, timestamp) {
    this.dispatchEventToListeners(eventName, timestamp);
  }

  /**
   * @param {!SDK.FilmStripModel.Frame} filmStripFrame
   */
  _onDoubleClick(filmStripFrame) {
    new PerfUI.FilmStripView.Dialog(filmStripFrame, this._zeroTime);
  }

  reset() {
    this._zeroTime = 0;
    this.contentElement.removeChildren();
    this.contentElement.appendChild(this._statusLabel);
  }

  /**
   * @param {string} text
   */
  setStatusText(text) {
    this._statusLabel.textContent = text;
  }
};

/** @enum {symbol} */
PerfUI.FilmStripView.Events = {
  FrameSelected: Symbol('FrameSelected'),
  FrameEnter: Symbol('FrameEnter'),
  FrameExit: Symbol('FrameExit'),
};

PerfUI.FilmStripView.Modes = {
  TimeBased: 'TimeBased',
  FrameBased: 'FrameBased'
};

PerfUI.FilmStripView.Dialog = class {
  /**
   * @param {!SDK.FilmStripModel.Frame} filmStripFrame
   * @param {number=} zeroTime
   */
  constructor(filmStripFrame, zeroTime) {
    const prevButton = UI.createTextButton('\u25C0', this._onPrevFrame.bind(this));
    prevButton.title = Common.UIString('Previous frame');
    const nextButton = UI.createTextButton('\u25B6', this._onNextFrame.bind(this));
    nextButton.title = Common.UIString('Next frame');

    this._fragment = UI.Fragment.build`
      <x-widget flex=none margin=12px>
        <x-hbox overflow=auto border='1px solid #ddd' max-height=80vh max-width=80vw>
          <img $=image></img>
        </x-hbox>
        <x-hbox x-center justify-content=center margin-top=10px>
          ${prevButton}
          <x-hbox $=time margin=8px></x-hbox>
          ${nextButton}
        </x-hbox>
      </x-widget>
    `;

    this._widget = /** @type {!UI.XWidget} */ (this._fragment.element());
    this._widget.tabIndex = 0;
    this._widget.addEventListener('keydown', this._keyDown.bind(this), false);

    this._frames = filmStripFrame.model().frames();
    this._index = filmStripFrame.index;
    this._zeroTime = zeroTime || filmStripFrame.model().zeroTime();
    /** @type {?UI.Dialog} */
    this._dialog = null;
    this._render();
  }

  _resize() {
    if (!this._dialog) {
      this._dialog = new UI.Dialog();
      this._dialog.contentElement.appendChild(this._widget);
      this._dialog.setDefaultFocusedElement(this._widget);
      this._dialog.show();
    }
    this._dialog.setSizeBehavior(UI.GlassPane.SizeBehavior.MeasureContent);
  }

  /**
   * @param {!Event} event
   */
  _keyDown(event) {
    switch (event.key) {
      case 'ArrowLeft':
        if (Host.isMac() && event.metaKey)
          this._onFirstFrame();
        else
          this._onPrevFrame();
        break;

      case 'ArrowRight':
        if (Host.isMac() && event.metaKey)
          this._onLastFrame();
        else
          this._onNextFrame();
        break;

      case 'Home':
        this._onFirstFrame();
        break;

      case 'End':
        this._onLastFrame();
        break;
    }
  }

  _onPrevFrame() {
    if (this._index > 0)
      --this._index;
    this._render();
  }

  _onNextFrame() {
    if (this._index < this._frames.length - 1)
      ++this._index;
    this._render();
  }

  _onFirstFrame() {
    this._index = 0;
    this._render();
  }

  _onLastFrame() {
    this._index = this._frames.length - 1;
    this._render();
  }

  /**
   * @return {!Promise<undefined>}
   */
  _render() {
    const frame = this._frames[this._index];
    this._fragment.$('time').textContent = Number.millisToString(frame.timestamp - this._zeroTime);
    return frame.imageDataPromise()
        .then(PerfUI.FilmStripView._setImageData.bind(null, this._fragment.$('image')))
        .then(this._resize.bind(this));
  }
};
