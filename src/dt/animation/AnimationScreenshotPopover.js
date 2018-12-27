// Copyright (c) 2015 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
/**
 * @unrestricted
 */
Animation.AnimationScreenshotPopover = class extends UI.VBox {
  /**
   * @param {!Array.<!Image>} images
   */
  constructor(images) {
    super(true);
    console.assert(images.length);
    this.registerRequiredCSS('animation/animationScreenshotPopover.css');
    this.contentElement.classList.add('animation-screenshot-popover');
    this._frames = images;
    for (const image of images) {
      this.contentElement.appendChild(image);
      image.style.display = 'none';
    }
    this._currentFrame = 0;
    this._frames[0].style.display = 'block';
    this._progressBar = this.contentElement.createChild('div', 'animation-progress');
  }

  /**
   * @override
   */
  wasShown() {
    this._rafId = this.contentElement.window().requestAnimationFrame(this._changeFrame.bind(this));
  }

  /**
   * @override
   */
  willHide() {
    this.contentElement.window().cancelAnimationFrame(this._rafId);
    delete this._endDelay;
  }

  _changeFrame() {
    this._rafId = this.contentElement.window().requestAnimationFrame(this._changeFrame.bind(this));

    if (this._endDelay) {
      this._endDelay--;
      return;
    }
    this._showFrame = !this._showFrame;
    if (!this._showFrame)
      return;

    const numFrames = this._frames.length;
    this._frames[this._currentFrame % numFrames].style.display = 'none';
    this._currentFrame++;
    this._frames[(this._currentFrame) % numFrames].style.display = 'block';
    if (this._currentFrame % numFrames === numFrames - 1)
      this._endDelay = 50;
    this._progressBar.style.width = (this._currentFrame % numFrames + 1) / numFrames * 100 + '%';
  }
};
