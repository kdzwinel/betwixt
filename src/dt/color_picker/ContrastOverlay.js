// Copyright 2017 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

ColorPicker.ContrastOverlay = class {
  /**
   * @param {!ColorPicker.ContrastInfo} contrastInfo
   * @param {!Element} colorElement
   */
  constructor(contrastInfo, colorElement) {
    /** @type {!ColorPicker.ContrastInfo} */
    this._contrastInfo = contrastInfo;

    this._visible = false;

    this._contrastRatioSVG = colorElement.createSVGChild('svg', 'spectrum-contrast-container fill');
    this._contrastRatioLines = {
      aa: this._contrastRatioSVG.createSVGChild('path', 'spectrum-contrast-line'),
      aaa: this._contrastRatioSVG.createSVGChild('path', 'spectrum-contrast-line')
    };

    this._width = 0;
    this._height = 0;

    this._contrastRatioLineBuilder = new ColorPicker.ContrastRatioLineBuilder(this._contrastInfo);

    this._contrastRatioLinesThrottler = new Common.Throttler(0);
    this._drawContrastRatioLinesBound = this._drawContrastRatioLines.bind(this);

    this._contrastInfo.addEventListener(ColorPicker.ContrastInfo.Events.ContrastInfoUpdated, this._update.bind(this));
  }

  _update() {
    if (!this._visible || this._contrastInfo.isNull() || !this._contrastInfo.contrastRatio())
      return;

    this._contrastRatioLinesThrottler.schedule(this._drawContrastRatioLinesBound);
  }

  /**
   * @param {number} width
   * @param {number} height
   */
  setDimensions(width, height) {
    this._width = width;
    this._height = height;
    this._update();
  }

  /**
   * @param {boolean} visible
   */
  setVisible(visible) {
    this._visible = visible;
    this._contrastRatioSVG.classList.toggle('hidden', !visible);
    this._update();
  }

  async _drawContrastRatioLines() {
    for (const level in this._contrastRatioLines) {
      const path = this._contrastRatioLineBuilder.drawContrastRatioLine(this._width, this._height, level);
      if (path)
        this._contrastRatioLines[level].setAttribute('d', path);
      else
        this._contrastRatioLines[level].removeAttribute('d');
    }
  }
};

ColorPicker.ContrastRatioLineBuilder = class {
  /**
   * @param {!ColorPicker.ContrastInfo} contrastInfo
   */
  constructor(contrastInfo) {
    /** @type {!ColorPicker.ContrastInfo} */
    this._contrastInfo = contrastInfo;
  }

  /**
   * @param {number} width
   * @param {number} height
   * @param {string} level
   * @return {?string}
   */
  drawContrastRatioLine(width, height, level) {
    const requiredContrast = this._contrastInfo.contrastRatioThreshold(level);
    if (!width || !height || !requiredContrast)
      return null;

    const dS = 0.02;
    const epsilon = 0.0002;
    const H = 0;
    const S = 1;
    const V = 2;
    const A = 3;

    const hsva = this._contrastInfo.hsva();
    const bgColor = this._contrastInfo.bgColor();
    if (!hsva || !bgColor)
      return null;

    const fgRGBA = [];
    Common.Color.hsva2rgba(hsva, fgRGBA);
    const bgRGBA = bgColor.rgba();
    const bgLuminance = Common.Color.luminance(bgRGBA);
    const blendedRGBA = [];
    Common.Color.blendColors(fgRGBA, bgRGBA, blendedRGBA);
    const fgLuminance = Common.Color.luminance(blendedRGBA);
    const fgIsLighter = fgLuminance > bgLuminance;
    const desiredLuminance = Common.Color.desiredLuminance(bgLuminance, requiredContrast, fgIsLighter);

    let lastV = hsva[V];
    let currentSlope = 0;
    const candidateHSVA = [hsva[H], 0, 0, hsva[A]];
    let pathBuilder = [];
    const candidateRGBA = [];
    Common.Color.hsva2rgba(candidateHSVA, candidateRGBA);
    Common.Color.blendColors(candidateRGBA, bgRGBA, blendedRGBA);

    /**
     * @param {number} index
     * @param {number} x
     */
    function updateCandidateAndComputeDelta(index, x) {
      candidateHSVA[index] = x;
      Common.Color.hsva2rgba(candidateHSVA, candidateRGBA);
      Common.Color.blendColors(candidateRGBA, bgRGBA, blendedRGBA);
      return Common.Color.luminance(blendedRGBA) - desiredLuminance;
    }

    /**
     * Approach a value of the given component of `candidateHSVA` such that the
     * calculated luminance of `candidateHSVA` approximates `desiredLuminance`.
     * @param {number} index The component of `candidateHSVA` to modify.
     * @return {?number} The new value for the modified component, or `null` if
     *     no suitable value exists.
     */
    function approach(index) {
      let x = candidateHSVA[index];
      let multiplier = 1;
      let dLuminance = updateCandidateAndComputeDelta(index, x);
      let previousSign = Math.sign(dLuminance);

      for (let guard = 100; guard; guard--) {
        if (Math.abs(dLuminance) < epsilon)
          return x;

        const sign = Math.sign(dLuminance);
        if (sign !== previousSign) {
          // If `x` overshoots the correct value, halve the step size.
          multiplier /= 2;
          previousSign = sign;
        } else if (x < 0 || x > 1) {
          // If there is no overshoot and `x` is out of bounds, there is no
          // acceptable value for `x`.
          return null;
        }

        // Adjust `x` by a multiple of `dLuminance` to decrease step size as
        // the computed luminance converges on `desiredLuminance`.
        x += multiplier * (index === V ? -dLuminance : dLuminance);

        dLuminance = updateCandidateAndComputeDelta(index, x);
      }
      // The loop should always converge or go out of bounds on its own.
      console.error('Loop exited unexpectedly');
      return null;
    }

    // Plot V for values of S such that the computed luminance approximates
    // `desiredLuminance`, until no suitable value for V can be found, or the
    // current value of S goes of out bounds.
    let s;
    for (s = 0; s < 1 + dS; s += dS) {
      s = Math.min(1, s);
      candidateHSVA[S] = s;

      // Extrapolate the approximate next value for `v` using the approximate
      // gradient of the curve.
      candidateHSVA[V] = lastV + currentSlope * dS;

      const v = approach(V);
      if (v === null)
        break;

      // Approximate the current gradient of the curve.
      currentSlope = s === 0 ? 0 : (v - lastV) / dS;
      lastV = v;

      pathBuilder.push(pathBuilder.length ? 'L' : 'M');
      pathBuilder.push((s * width).toFixed(2));
      pathBuilder.push(((1 - v) * height).toFixed(2));
    }

    // If no suitable V value for an in-bounds S value was found, find the value
    // of S such that V === 1 and add that to the path.
    if (s < 1 + dS) {
      s -= dS;
      candidateHSVA[V] = 1;
      s = approach(S);
      if (s !== null)
        pathBuilder = pathBuilder.concat(['L', (s * width).toFixed(2), '-0.1']);
    }
    if (pathBuilder.length === 0)
      return null;
    return pathBuilder.join(' ');
  }
};
