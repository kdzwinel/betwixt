/*
 * Copyright (C) 2014 Google Inc.  All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions
 * are met:
 *
 * 1.  Redistributions of source code must retain the above copyright
 *     notice, this list of conditions and the following disclaimer.
 * 2.  Redistributions in binary form must reproduce the above copyright
 *     notice, this list of conditions and the following disclaimer in the
 *     documentation and/or other materials provided with the distribution.
 * 3.  Neither the name of Apple Computer, Inc. ("Apple") nor the names of
 *     its contributors may be used to endorse or promote products derived
 *     from this software without specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY APPLE AND ITS CONTRIBUTORS "AS IS" AND ANY
 * EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
 * WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
 * DISCLAIMED. IN NO EVENT SHALL APPLE OR ITS CONTRIBUTORS BE LIABLE FOR ANY
 * DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
 * (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
 * LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND
 * ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF
 * THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */
/**
 * @return {string}
 */
Host.platform = function() {
  if (!Host._platform)
    Host._platform = InspectorFrontendHost.platform();
  return Host._platform;
};

/**
 * @return {boolean}
 */
Host.isMac = function() {
  if (typeof Host._isMac === 'undefined')
    Host._isMac = Host.platform() === 'mac';

  return Host._isMac;
};

/**
 * @return {boolean}
 */
Host.isWin = function() {
  if (typeof Host._isWin === 'undefined')
    Host._isWin = Host.platform() === 'windows';

  return Host._isWin;
};

/**
 * @return {boolean}
 */
Host.isCustomDevtoolsFrontend = function() {
  if (typeof Host._isCustomDevtoolsFronend === 'undefined')
    Host._isCustomDevtoolsFronend = window.location.toString().startsWith('chrome-devtools://devtools/custom/');
  return Host._isCustomDevtoolsFronend;
};

/**
 * @return {string}
 */
Host.fontFamily = function() {
  if (Host._fontFamily)
    return Host._fontFamily;
  switch (Host.platform()) {
    case 'linux':
      Host._fontFamily = 'Roboto, Ubuntu, Arial, sans-serif';
      break;
    case 'mac':
      Host._fontFamily = '\'Lucida Grande\', sans-serif';
      break;
    case 'windows':
      Host._fontFamily = '\'Segoe UI\', Tahoma, sans-serif';
      break;
  }
  return Host._fontFamily;
};
