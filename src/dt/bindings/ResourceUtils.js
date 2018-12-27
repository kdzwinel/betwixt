/*
 * Copyright (C) 2006, 2007, 2008 Apple Inc.  All rights reserved.
 * Copyright (C) 2007 Matt Lilek (pewtermoose@gmail.com).
 * Copyright (C) 2009 Joseph Pecoraro
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
 * @param {string} url
 * @return {?SDK.Resource}
 */
Bindings.resourceForURL = function(url) {
  for (const resourceTreeModel of SDK.targetManager.models(SDK.ResourceTreeModel)) {
    const resource = resourceTreeModel.resourceForURL(url);
    if (resource)
      return resource;
  }
  return null;
};

/**
 * @param {function(!SDK.Resource)} callback
 */
Bindings.forAllResources = function(callback) {
  for (const resourceTreeModel of SDK.targetManager.models(SDK.ResourceTreeModel))
    resourceTreeModel.forAllResources(callback);
};

/**
 * @param {string} url
 * @return {string}
 */
Bindings.displayNameForURL = function(url) {
  if (!url)
    return '';

  const resource = Bindings.resourceForURL(url);
  if (resource)
    return resource.displayName;

  const uiSourceCode = Workspace.workspace.uiSourceCodeForURL(url);
  if (uiSourceCode)
    return uiSourceCode.displayName();

  const mainTarget = SDK.targetManager.mainTarget();
  const inspectedURL = mainTarget && mainTarget.inspectedURL();
  if (!inspectedURL)
    return url.trimURL('');

  const parsedURL = inspectedURL.asParsedURL();
  const lastPathComponent = parsedURL ? parsedURL.lastPathComponent : parsedURL;
  const index = inspectedURL.indexOf(lastPathComponent);
  if (index !== -1 && index + lastPathComponent.length === inspectedURL.length) {
    const baseURL = inspectedURL.substring(0, index);
    if (url.startsWith(baseURL))
      return url.substring(index);
  }

  if (!parsedURL)
    return url;

  const displayName = url.trimURL(parsedURL.host);
  return displayName === '/' ? parsedURL.host + '/' : displayName;
};

/**
 * @param {!SDK.Target} target
 * @param {string} frameId
 * @param {string} url
 * @return {?Workspace.UISourceCodeMetadata}
 */
Bindings.metadataForURL = function(target, frameId, url) {
  const resourceTreeModel = target.model(SDK.ResourceTreeModel);
  if (!resourceTreeModel)
    return null;
  const frame = resourceTreeModel.frameForId(frameId);
  if (!frame)
    return null;
  return Bindings.resourceMetadata(frame.resourceForURL(url));
};

/**
 * @param {?SDK.Resource} resource
 * @return {?Workspace.UISourceCodeMetadata}
 */
Bindings.resourceMetadata = function(resource) {
  if (!resource || (typeof resource.contentSize() !== 'number' && !resource.lastModified()))
    return null;
  return new Workspace.UISourceCodeMetadata(resource.lastModified(), resource.contentSize());
};

/**
 * @param {!SDK.Script} script
 * @return {string}
 */
Bindings.frameIdForScript = function(script) {
  const executionContext = script.executionContext();
  if (executionContext)
    return executionContext.frameId || '';
  // This is to overcome compilation cache which doesn't get reset.
  const resourceTreeModel = script.debuggerModel.target().model(SDK.ResourceTreeModel);
  if (!resourceTreeModel || !resourceTreeModel.mainFrame)
    return '';
  return resourceTreeModel.mainFrame.id;
};
