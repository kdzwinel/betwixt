/*
 * Copyright (C) 2011 Google Inc. All rights reserved.
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
Profiler.ProfileLauncherView = class extends UI.VBox {
  /**
   * @param {!Profiler.ProfilesPanel} profilesPanel
   */
  constructor(profilesPanel) {
    super();
    this._panel = profilesPanel;
    this.element.classList.add('profile-launcher-view');

    this._contentElement = this.element.createChild('div', 'profile-launcher-view-content');
    this._innerContentElement = this._contentElement.createChild('div');
    const controlDiv = this._contentElement.createChild('div', 'vbox profile-launcher-control');
    controlDiv.createChild('h1').textContent = ls`Select JavaScript VM instance`;
    const targetDiv = controlDiv.createChild('div', 'vbox profile-launcher-target-list');
    new Profiler.IsolateSelector().show(targetDiv);
    this._controlButton =
        UI.createTextButton('', this._controlButtonClicked.bind(this), 'profile-launcher-button', true /* primary */);
    this._contentElement.appendChild(this._controlButton);
    this._recordButtonEnabled = true;
    this._loadButton =
        UI.createTextButton(Common.UIString('Load'), this._loadButtonClicked.bind(this), 'profile-launcher-button');
    this._contentElement.appendChild(this._loadButton);

    this._selectedProfileTypeSetting = Common.settings.createSetting('selectedProfileType', 'CPU');
    this._header = this._innerContentElement.createChild('h1');
    this._profileTypeSelectorForm = this._innerContentElement.createChild('form');
    this._innerContentElement.createChild('div', 'flexible-space');
    /** @type {!Map<string, !HTMLOptionElement>} */
    this._typeIdToOptionElement = new Map();
  }

  _loadButtonClicked() {
    this._panel.showLoadFromFileDialog();
  }

  _updateControls() {
    if (this._isEnabled && this._recordButtonEnabled)
      this._controlButton.removeAttribute('disabled');
    else
      this._controlButton.setAttribute('disabled', '');
    this._controlButton.title = this._recordButtonEnabled ? '' : UI.anotherProfilerActiveLabel();
    if (this._isInstantProfile) {
      this._controlButton.classList.remove('running');
      this._controlButton.classList.add('primary-button');
      this._controlButton.textContent = Common.UIString('Take snapshot');
    } else if (this._isProfiling) {
      this._controlButton.classList.add('running');
      this._controlButton.classList.remove('primary-button');
      this._controlButton.textContent = Common.UIString('Stop');
    } else {
      this._controlButton.classList.remove('running');
      this._controlButton.classList.add('primary-button');
      this._controlButton.textContent = Common.UIString('Start');
    }
    for (const item of this._typeIdToOptionElement.values())
      item.disabled = !!this._isProfiling;
  }

  profileStarted() {
    this._isProfiling = true;
    this._updateControls();
  }

  profileFinished() {
    this._isProfiling = false;
    this._updateControls();
  }

  /**
   * @param {!Profiler.ProfileType} profileType
   * @param {boolean} recordButtonEnabled
   */
  updateProfileType(profileType, recordButtonEnabled) {
    this._isInstantProfile = profileType.isInstantProfile();
    this._recordButtonEnabled = recordButtonEnabled;
    this._isEnabled = profileType.isEnabled();
    this._updateControls();
  }

  /**
   * @param {!Profiler.ProfileType} profileType
   */
  addProfileType(profileType) {
    const labelElement = UI.createRadioLabel('profile-type', profileType.name);
    this._profileTypeSelectorForm.appendChild(labelElement);
    const optionElement = labelElement.radioElement;
    this._typeIdToOptionElement.set(profileType.id, optionElement);
    optionElement._profileType = profileType;
    optionElement.style.hidden = true;
    optionElement.addEventListener('change', this._profileTypeChanged.bind(this, profileType), false);
    const descriptionElement = this._profileTypeSelectorForm.createChild('p');
    descriptionElement.textContent = profileType.description;
    const customContent = profileType.customContent();
    if (customContent)
      this._profileTypeSelectorForm.createChild('p').appendChild(customContent);
    if (this._typeIdToOptionElement.size > 1)
      this._header.textContent = ls`Select profiling type`;
    else
      this._header.textContent = profileType.name;
  }

  restoreSelectedProfileType() {
    let typeId = this._selectedProfileTypeSetting.get();
    if (!this._typeIdToOptionElement.has(typeId))
      typeId = this._typeIdToOptionElement.keys().next().value;
    this._typeIdToOptionElement.get(typeId).checked = true;
    const type = this._typeIdToOptionElement.get(typeId)._profileType;
    this.dispatchEventToListeners(Profiler.ProfileLauncherView.Events.ProfileTypeSelected, type);
  }

  _controlButtonClicked() {
    this._panel.toggleRecord();
  }

  /**
   * @param {!Profiler.ProfileType} profileType
   */
  _profileTypeChanged(profileType) {
    this.dispatchEventToListeners(Profiler.ProfileLauncherView.Events.ProfileTypeSelected, profileType);
    this._isInstantProfile = profileType.isInstantProfile();
    this._isEnabled = profileType.isEnabled();
    this._updateControls();
    this._selectedProfileTypeSetting.set(profileType.id);
  }
};

/** @enum {symbol} */
Profiler.ProfileLauncherView.Events = {
  ProfileTypeSelected: Symbol('ProfileTypeSelected')
};
