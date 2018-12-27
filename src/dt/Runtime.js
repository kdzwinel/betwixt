/*
 * Copyright (C) 2014 Google Inc. All rights reserved.
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
// This gets all concatenated module descriptors in the release mode.
const allDescriptors = [];
let applicationDescriptor;
const _loadedScripts = {};

// FIXME: This is a workaround to force Closure compiler provide
// the standard ES6 runtime for all modules. This should be removed
// once Closure provides standard externs for Map et al.
for (const k of []) {  // eslint-disable-line
}

(function() {
const baseUrl = self.location ? self.location.origin + self.location.pathname : '';
self._importScriptPathPrefix = baseUrl.substring(0, baseUrl.lastIndexOf('/') + 1);
})();

const REMOTE_MODULE_FALLBACK_REVISION = '@010ddcfda246975d194964ccf20038ebbdec6084';

/**
 * @unrestricted
 */
var Runtime = class {  // eslint-disable-line
  /**
   * @param {!Array.<!Runtime.ModuleDescriptor>} descriptors
   */
  constructor(descriptors) {
    /** @type {!Array<!Runtime.Module>} */
    this._modules = [];
    /** @type {!Object<string, !Runtime.Module>} */
    this._modulesMap = {};
    /** @type {!Array<!Runtime.Extension>} */
    this._extensions = [];
    /** @type {!Object<string, !function(new:Object)>} */
    this._cachedTypeClasses = {};
    /** @type {!Object<string, !Runtime.ModuleDescriptor>} */
    this._descriptorsMap = {};

    for (let i = 0; i < descriptors.length; ++i)
      this._registerModule(descriptors[i]);
  }

  /**
   * @param {string} url
   * @return {!Promise.<string>}
   */
  static loadResourcePromise(url) {
    return new Promise(load);

    /**
     * @param {function(?)} fulfill
     * @param {function(*)} reject
     */
    function load(fulfill, reject) {
      const xhr = new XMLHttpRequest();
      xhr.open('GET', url, true);
      xhr.onreadystatechange = onreadystatechange;

      /**
       * @param {Event} e
       */
      function onreadystatechange(e) {
        if (xhr.readyState !== XMLHttpRequest.DONE)
          return;

        // DevTools Proxy server can mask 404s as 200s, check the body to be sure
        const status = /^HTTP\/1.1 404/.test(e.target.response) ? 404 : xhr.status;

        if ([0, 200, 304].indexOf(status) === -1)  // Testing harness file:/// results in 0.
          reject(new Error('While loading from url ' + url + ' server responded with a status of ' + status));
        else
          fulfill(e.target.response);
      }
      xhr.send(null);
    }
  }

  /**
   * @param {string} url
   * @return {!Promise.<string>}
   */
  static loadResourcePromiseWithFallback(url) {
    return Runtime.loadResourcePromise(url).catch(err => {
      const urlWithFallbackVersion = url.replace(/@[0-9a-f]{40}/, REMOTE_MODULE_FALLBACK_REVISION);
      // TODO(phulce): mark fallbacks in module.json and modify build script instead
      if (urlWithFallbackVersion === url || !url.includes('audits2_worker_module'))
        throw err;
      return Runtime.loadResourcePromise(urlWithFallbackVersion);
    });
  }

  /**
   * http://tools.ietf.org/html/rfc3986#section-5.2.4
   * @param {string} path
   * @return {string}
   */
  static normalizePath(path) {
    if (path.indexOf('..') === -1 && path.indexOf('.') === -1)
      return path;

    const normalizedSegments = [];
    const segments = path.split('/');
    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      if (segment === '.')
        continue;
      else if (segment === '..')
        normalizedSegments.pop();
      else if (segment)
        normalizedSegments.push(segment);
    }
    let normalizedPath = normalizedSegments.join('/');
    if (normalizedPath[normalizedPath.length - 1] === '/')
      return normalizedPath;
    if (path[0] === '/' && normalizedPath)
      normalizedPath = '/' + normalizedPath;
    if ((path[path.length - 1] === '/') || (segments[segments.length - 1] === '.') ||
        (segments[segments.length - 1] === '..'))
      normalizedPath = normalizedPath + '/';

    return normalizedPath;
  }

  /**
   * @param {!Array.<string>} scriptNames
   * @param {string=} base
   * @return {!Promise.<undefined>}
   */
  static _loadScriptsPromise(scriptNames, base) {
    /** @type {!Array<!Promise<undefined>>} */
    const promises = [];
    /** @type {!Array<string>} */
    const urls = [];
    const sources = new Array(scriptNames.length);
    let scriptToEval = 0;
    for (let i = 0; i < scriptNames.length; ++i) {
      const scriptName = scriptNames[i];
      let sourceURL = (base || self._importScriptPathPrefix) + scriptName;

      const schemaIndex = sourceURL.indexOf('://') + 3;
      let pathIndex = sourceURL.indexOf('/', schemaIndex);
      if (pathIndex === -1)
        pathIndex = sourceURL.length;
      sourceURL = sourceURL.substring(0, pathIndex) + Runtime.normalizePath(sourceURL.substring(pathIndex));

      if (_loadedScripts[sourceURL])
        continue;
      urls.push(sourceURL);
      const loadResourcePromise =
          base ? Runtime.loadResourcePromiseWithFallback(sourceURL) : Runtime.loadResourcePromise(sourceURL);
      promises.push(
          loadResourcePromise.then(scriptSourceLoaded.bind(null, i), scriptSourceLoaded.bind(null, i, undefined)));
    }
    return Promise.all(promises).then(undefined);

    /**
     * @param {number} scriptNumber
     * @param {string=} scriptSource
     */
    function scriptSourceLoaded(scriptNumber, scriptSource) {
      sources[scriptNumber] = scriptSource || '';
      // Eval scripts as fast as possible.
      while (typeof sources[scriptToEval] !== 'undefined') {
        evaluateScript(urls[scriptToEval], sources[scriptToEval]);
        ++scriptToEval;
      }
    }

    /**
     * @param {string} sourceURL
     * @param {string=} scriptSource
     */
    function evaluateScript(sourceURL, scriptSource) {
      _loadedScripts[sourceURL] = true;
      if (!scriptSource) {
        // Do not reject, as this is normal in the hosted mode.
        console.error('Empty response arrived for script \'' + sourceURL + '\'');
        return;
      }
      self.eval(scriptSource + '\n//# sourceURL=' + sourceURL);
    }
  }

  /**
   * @param {string} url
   * @param {boolean} appendSourceURL
   * @return {!Promise<undefined>}
   */
  static _loadResourceIntoCache(url, appendSourceURL) {
    return Runtime.loadResourcePromise(url).then(
        cacheResource.bind(this, url), cacheResource.bind(this, url, undefined));

    /**
     * @param {string} path
     * @param {string=} content
     */
    function cacheResource(path, content) {
      if (!content) {
        console.error('Failed to load resource: ' + path);
        return;
      }
      const sourceURL = appendSourceURL ? Runtime.resolveSourceURL(path) : '';
      Runtime.cachedResources[path] = content + sourceURL;
    }
  }

  /**
   * @return {!Promise}
   */
  static async appStarted() {
    return Runtime._appStartedPromise;
  }

  /**
   * @param {string} appName
   * @return {!Promise.<undefined>}
   */
  static async startApplication(appName) {
    console.timeStamp('Runtime.startApplication');

    const allDescriptorsByName = {};
    for (let i = 0; i < allDescriptors.length; ++i) {
      const d = allDescriptors[i];
      allDescriptorsByName[d['name']] = d;
    }

    if (!applicationDescriptor) {
      let data = await Runtime.loadResourcePromise(appName + '.json');
      applicationDescriptor = JSON.parse(data);
      let descriptor = applicationDescriptor;
      while (descriptor.extends) {
        data = await Runtime.loadResourcePromise(descriptor.extends + '.json');
        descriptor = JSON.parse(data);
        applicationDescriptor.modules = descriptor.modules.concat(applicationDescriptor.modules);
      }
    }

    const configuration = applicationDescriptor.modules;
    const moduleJSONPromises = [];
    const coreModuleNames = [];
    for (let i = 0; i < configuration.length; ++i) {
      const descriptor = configuration[i];
      const name = descriptor['name'];
      const moduleJSON = allDescriptorsByName[name];
      if (moduleJSON)
        moduleJSONPromises.push(Promise.resolve(moduleJSON));
      else
        moduleJSONPromises.push(Runtime.loadResourcePromise(name + '/module.json').then(JSON.parse.bind(JSON)));
      if (descriptor['type'] === 'autostart')
        coreModuleNames.push(name);
    }

    const moduleDescriptors = await Promise.all(moduleJSONPromises);

    for (let i = 0; i < moduleDescriptors.length; ++i) {
      moduleDescriptors[i].name = configuration[i]['name'];
      moduleDescriptors[i].condition = configuration[i]['condition'];
      moduleDescriptors[i].remote = configuration[i]['type'] === 'remote';
    }
    self.runtime = new Runtime(moduleDescriptors);
    if (coreModuleNames)
      await self.runtime._loadAutoStartModules(coreModuleNames);
    Runtime._appStartedPromiseCallback();
  }

  /**
   * @param {string} appName
   * @return {!Promise.<undefined>}
   */
  static startWorker(appName) {
    return Runtime.startApplication(appName).then(sendWorkerReady);

    function sendWorkerReady() {
      self.postMessage('workerReady');
    }
  }

  /**
   * @param {string} name
   * @return {?string}
   */
  static queryParam(name) {
    return Runtime._queryParamsObject.get(name);
  }

  /**
   * @return {string}
   */
  static queryParamsString() {
    return location.search;
  }

  /**
   * @return {!Object}
   */
  static _experimentsSetting() {
    try {
      return /** @type {!Object} */ (
          JSON.parse(self.localStorage && self.localStorage['experiments'] ? self.localStorage['experiments'] : '{}'));
    } catch (e) {
      console.error('Failed to parse localStorage[\'experiments\']');
      return {};
    }
  }

  static _assert(value, message) {
    if (value)
      return;
    Runtime._originalAssert.call(Runtime._console, value, message + ' ' + new Error().stack);
  }

  /**
   * @param {string} platform
   */
  static setPlatform(platform) {
    Runtime._platform = platform;
  }

  /**
   * @param {!Object} descriptor
   * @return {boolean}
   */
  static _isDescriptorEnabled(descriptor) {
    const activatorExperiment = descriptor['experiment'];
    if (activatorExperiment === '*')
      return Runtime.experiments.supportEnabled();
    if (activatorExperiment && activatorExperiment.startsWith('!') &&
        Runtime.experiments.isEnabled(activatorExperiment.substring(1)))
      return false;
    if (activatorExperiment && !activatorExperiment.startsWith('!') &&
        !Runtime.experiments.isEnabled(activatorExperiment))
      return false;
    const condition = descriptor['condition'];
    if (condition && !condition.startsWith('!') && !Runtime.queryParam(condition))
      return false;
    if (condition && condition.startsWith('!') && Runtime.queryParam(condition.substring(1)))
      return false;
    return true;
  }

  /**
   * @param {string} path
   * @return {string}
   */
  static resolveSourceURL(path) {
    let sourceURL = self.location.href;
    if (self.location.search)
      sourceURL = sourceURL.replace(self.location.search, '');
    sourceURL = sourceURL.substring(0, sourceURL.lastIndexOf('/') + 1) + path;
    return '\n/*# sourceURL=' + sourceURL + ' */';
  }

  useTestBase() {
    Runtime._remoteBase = 'http://localhost:8000/inspector-sources/';
    if (Runtime.queryParam('debugFrontend'))
      Runtime._remoteBase += 'debug/';
  }

  /**
   * @param {!Runtime.ModuleDescriptor} descriptor
   */
  _registerModule(descriptor) {
    const module = new Runtime.Module(this, descriptor);
    this._modules.push(module);
    this._modulesMap[descriptor['name']] = module;
  }

  /**
   * @param {string} moduleName
   * @return {!Promise.<undefined>}
   */
  loadModulePromise(moduleName) {
    return this._modulesMap[moduleName]._loadPromise();
  }

  /**
   * @param {!Array.<string>} moduleNames
   * @return {!Promise.<!Array.<*>>}
   */
  _loadAutoStartModules(moduleNames) {
    const promises = [];
    for (let i = 0; i < moduleNames.length; ++i)
      promises.push(this.loadModulePromise(moduleNames[i]));
    return Promise.all(promises);
  }

  /**
   * @param {!Runtime.Extension} extension
   * @param {?function(function(new:Object)):boolean} predicate
   * @return {boolean}
   */
  _checkExtensionApplicability(extension, predicate) {
    if (!predicate)
      return false;
    const contextTypes = extension.descriptor().contextTypes;
    if (!contextTypes)
      return true;
    for (let i = 0; i < contextTypes.length; ++i) {
      const contextType = this._resolve(contextTypes[i]);
      const isMatching = !!contextType && predicate(contextType);
      if (isMatching)
        return true;
    }
    return false;
  }

  /**
   * @param {!Runtime.Extension} extension
   * @param {?Object} context
   * @return {boolean}
   */
  isExtensionApplicableToContext(extension, context) {
    if (!context)
      return true;
    return this._checkExtensionApplicability(extension, isInstanceOf);

    /**
     * @param {!Function} targetType
     * @return {boolean}
     */
    function isInstanceOf(targetType) {
      return context instanceof targetType;
    }
  }

  /**
   * @param {!Runtime.Extension} extension
   * @param {!Set.<!Function>=} currentContextTypes
   * @return {boolean}
   */
  isExtensionApplicableToContextTypes(extension, currentContextTypes) {
    if (!extension.descriptor().contextTypes)
      return true;

    return this._checkExtensionApplicability(extension, currentContextTypes ? isContextTypeKnown : null);

    /**
     * @param {!Function} targetType
     * @return {boolean}
     */
    function isContextTypeKnown(targetType) {
      return currentContextTypes.has(targetType);
    }
  }

  /**
   * @param {*} type
   * @param {?Object=} context
   * @param {boolean=} sortByTitle
   * @return {!Array.<!Runtime.Extension>}
   */
  extensions(type, context, sortByTitle) {
    return this._extensions.filter(filter).sort(sortByTitle ? titleComparator : orderComparator);

    /**
     * @param {!Runtime.Extension} extension
     * @return {boolean}
     */
    function filter(extension) {
      if (extension._type !== type && extension._typeClass() !== type)
        return false;
      if (!extension.enabled())
        return false;
      return !context || extension.isApplicable(context);
    }

    /**
     * @param {!Runtime.Extension} extension1
     * @param {!Runtime.Extension} extension2
     * @return {number}
     */
    function orderComparator(extension1, extension2) {
      const order1 = extension1.descriptor()['order'] || 0;
      const order2 = extension2.descriptor()['order'] || 0;
      return order1 - order2;
    }

    /**
     * @param {!Runtime.Extension} extension1
     * @param {!Runtime.Extension} extension2
     * @return {number}
     */
    function titleComparator(extension1, extension2) {
      const title1 = extension1.title() || '';
      const title2 = extension2.title() || '';
      return title1.localeCompare(title2);
    }
  }

  /**
   * @param {*} type
   * @param {?Object=} context
   * @return {?Runtime.Extension}
   */
  extension(type, context) {
    return this.extensions(type, context)[0] || null;
  }

  /**
   * @param {*} type
   * @param {?Object=} context
   * @return {!Promise.<!Array.<!Object>>}
   */
  allInstances(type, context) {
    return Promise.all(this.extensions(type, context).map(extension => extension.instance()));
  }

  /**
   * @return {?function(new:Object)}
   */
  _resolve(typeName) {
    if (!this._cachedTypeClasses[typeName]) {
      const path = typeName.split('.');
      let object = self;
      for (let i = 0; object && (i < path.length); ++i)
        object = object[path[i]];
      if (object)
        this._cachedTypeClasses[typeName] = /** @type function(new:Object) */ (object);
    }
    return this._cachedTypeClasses[typeName] || null;
  }

  /**
   * @param {!Function} constructorFunction
   * @return {!Object}
   */
  sharedInstance(constructorFunction) {
    if (Runtime._instanceSymbol in constructorFunction &&
        Object.getOwnPropertySymbols(constructorFunction).includes(Runtime._instanceSymbol))
      return constructorFunction[Runtime._instanceSymbol];

    const instance = new constructorFunction();
    constructorFunction[Runtime._instanceSymbol] = instance;
    return instance;
  }
};

/** @type {!URLSearchParams} */
Runtime._queryParamsObject = new URLSearchParams(Runtime.queryParamsString());

Runtime._instanceSymbol = Symbol('instance');

/**
 * @type {!Object.<string, string>}
 */
Runtime.cachedResources = {
  __proto__: null
};


Runtime._console = console;
Runtime._originalAssert = console.assert;


Runtime._platform = '';


/**
 * @unrestricted
 */
Runtime.ModuleDescriptor = class {
  constructor() {
    /**
     * @type {string}
     */
    this.name;

    /**
     * @type {!Array.<!Runtime.ExtensionDescriptor>}
     */
    this.extensions;

    /**
     * @type {!Array.<string>|undefined}
     */
    this.dependencies;

    /**
     * @type {!Array.<string>}
     */
    this.scripts;

    /**
     * @type {string|undefined}
     */
    this.condition;

    /**
     * @type {boolean|undefined}
     */
    this.remote;
  }
};

/**
 * @unrestricted
 */
Runtime.ExtensionDescriptor = class {
  constructor() {
    /**
     * @type {string}
     */
    this.type;

    /**
     * @type {string|undefined}
     */
    this.className;

    /**
     * @type {string|undefined}
     */
    this.factoryName;

    /**
     * @type {!Array.<string>|undefined}
     */
    this.contextTypes;
  }
};

/**
 * @unrestricted
 */
Runtime.Module = class {
  /**
   * @param {!Runtime} manager
   * @param {!Runtime.ModuleDescriptor} descriptor
   */
  constructor(manager, descriptor) {
    this._manager = manager;
    this._descriptor = descriptor;
    this._name = descriptor.name;
    /** @type {!Array<!Runtime.Extension>} */
    this._extensions = [];

    /** @type {!Map<string, !Array<!Runtime.Extension>>} */
    this._extensionsByClassName = new Map();
    const extensions = /** @type {?Array.<!Runtime.ExtensionDescriptor>} */ (descriptor.extensions);
    for (let i = 0; extensions && i < extensions.length; ++i) {
      const extension = new Runtime.Extension(this, extensions[i]);
      this._manager._extensions.push(extension);
      this._extensions.push(extension);
    }
    this._loadedForTest = false;
  }

  /**
   * @return {string}
   */
  name() {
    return this._name;
  }

  /**
   * @return {boolean}
   */
  enabled() {
    return Runtime._isDescriptorEnabled(this._descriptor);
  }

  /**
   * @param {string} name
   * @return {string}
   */
  resource(name) {
    const fullName = this._name + '/' + name;
    const content = Runtime.cachedResources[fullName];
    if (!content)
      throw new Error(fullName + ' not preloaded. Check module.json');
    return content;
  }

  /**
   * @return {!Promise.<undefined>}
   */
  _loadPromise() {
    if (!this.enabled())
      return Promise.reject(new Error('Module ' + this._name + ' is not enabled'));

    if (this._pendingLoadPromise)
      return this._pendingLoadPromise;

    const dependencies = this._descriptor.dependencies;
    const dependencyPromises = [];
    for (let i = 0; dependencies && i < dependencies.length; ++i)
      dependencyPromises.push(this._manager._modulesMap[dependencies[i]]._loadPromise());

    this._pendingLoadPromise = Promise.all(dependencyPromises)
                                   .then(this._loadResources.bind(this))
                                   .then(this._loadScripts.bind(this))
                                   .then(() => this._loadedForTest = true);

    return this._pendingLoadPromise;
  }

  /**
   * @return {!Promise.<undefined>}
   * @this {Runtime.Module}
   */
  _loadResources() {
    const resources = this._descriptor['resources'];
    if (!resources || !resources.length)
      return Promise.resolve();
    const promises = [];
    for (let i = 0; i < resources.length; ++i) {
      const url = this._modularizeURL(resources[i]);
      promises.push(Runtime._loadResourceIntoCache(url, true));
    }
    return Promise.all(promises).then(undefined);
  }

  /**
   * @return {!Promise.<undefined>}
   */
  _loadScripts() {
    if (!this._descriptor.scripts || !this._descriptor.scripts.length)
      return Promise.resolve();

    // Module namespaces.
    // NOTE: Update scripts/special_case_namespaces.json if you add a special cased namespace.
    // The namespace keyword confuses clang-format.
    // clang-format off
    const specialCases = {
      'sdk': 'SDK',
      'js_sdk': 'JSSDK',
      'browser_sdk': 'BrowserSDK',
      'ui': 'UI',
      'object_ui': 'ObjectUI',
      'javascript_metadata': 'JavaScriptMetadata',
      'perf_ui': 'PerfUI',
      'har_importer': 'HARImporter',
      'sdk_test_runner': 'SDKTestRunner',
      'cpu_profiler_test_runner': 'CPUProfilerTestRunner'
    };
    const namespace = specialCases[this._name] || this._name.split('_').map(a => a.substring(0, 1).toUpperCase() + a.substring(1)).join('');
    self[namespace] = self[namespace] || {};
    // clang-format on
    return Runtime._loadScriptsPromise(this._descriptor.scripts.map(this._modularizeURL, this), this._remoteBase());
  }

  /**
   * @param {string} resourceName
   */
  _modularizeURL(resourceName) {
    return Runtime.normalizePath(this._name + '/' + resourceName);
  }

  /**
   * @return {string|undefined}
   */
  _remoteBase() {
    return !Runtime.queryParam('debugFrontend') && this._descriptor.remote && Runtime._remoteBase || undefined;
  }

  /**
   * @param {string} value
   * @return {string}
   */
  substituteURL(value) {
    const base = this._remoteBase() || '';
    return value.replace(/@url\(([^\)]*?)\)/g, convertURL.bind(this));

    function convertURL(match, url) {
      return base + this._modularizeURL(url);
    }
  }
};


/**
 * @unrestricted
 */
Runtime.Extension = class {
  /**
   * @param {!Runtime.Module} module
   * @param {!Runtime.ExtensionDescriptor} descriptor
   */
  constructor(module, descriptor) {
    this._module = module;
    this._descriptor = descriptor;

    this._type = descriptor.type;
    this._hasTypeClass = this._type.charAt(0) === '@';

    /**
     * @type {?string}
     */
    this._className = descriptor.className || null;
    this._factoryName = descriptor.factoryName || null;
  }

  /**
   * @return {!Object}
   */
  descriptor() {
    return this._descriptor;
  }

  /**
   * @return {!Runtime.Module}
   */
  module() {
    return this._module;
  }

  /**
   * @return {boolean}
   */
  enabled() {
    return this._module.enabled() && Runtime._isDescriptorEnabled(this.descriptor());
  }

  /**
   * @return {?function(new:Object)}
   */
  _typeClass() {
    if (!this._hasTypeClass)
      return null;
    return this._module._manager._resolve(this._type.substring(1));
  }

  /**
   * @param {?Object} context
   * @return {boolean}
   */
  isApplicable(context) {
    return this._module._manager.isExtensionApplicableToContext(this, context);
  }

  /**
   * @return {!Promise.<!Object>}
   */
  instance() {
    return this._module._loadPromise().then(this._createInstance.bind(this));
  }

  /**
   * @return {boolean}
   */
  canInstantiate() {
    return !!(this._className || this._factoryName);
  }

  /**
   * @return {!Object}
   */
  _createInstance() {
    const className = this._className || this._factoryName;
    if (!className)
      throw new Error('Could not instantiate extension with no class');
    const constructorFunction = self.eval(/** @type {string} */ (className));
    if (!(constructorFunction instanceof Function))
      throw new Error('Could not instantiate: ' + className);
    if (this._className)
      return this._module._manager.sharedInstance(constructorFunction);
    return new constructorFunction(this);
  }

  /**
   * @return {string}
   */
  title() {
    // FIXME: should be Common.UIString() but runtime is not l10n aware yet.
    return this._descriptor['title-' + Runtime._platform] || this._descriptor['title'];
  }

  /**
   * @param {function(new:Object)} contextType
   * @return {boolean}
   */
  hasContextType(contextType) {
    const contextTypes = this.descriptor().contextTypes;
    if (!contextTypes)
      return false;
    for (let i = 0; i < contextTypes.length; ++i) {
      if (contextType === this._module._manager._resolve(contextTypes[i]))
        return true;
    }
    return false;
  }
};

/**
 * @unrestricted
 */
Runtime.ExperimentsSupport = class {
  constructor() {
    this._supportEnabled = Runtime.queryParam('experiments') !== null;
    this._experiments = [];
    this._experimentNames = {};
    this._enabledTransiently = {};
  }

  /**
   * @return {!Array.<!Runtime.Experiment>}
   */
  allConfigurableExperiments() {
    const result = [];
    for (let i = 0; i < this._experiments.length; i++) {
      const experiment = this._experiments[i];
      if (!this._enabledTransiently[experiment.name])
        result.push(experiment);
    }
    return result;
  }

  /**
   * @return {boolean}
   */
  supportEnabled() {
    return this._supportEnabled;
  }

  /**
   * @param {!Object} value
   */
  _setExperimentsSetting(value) {
    if (!self.localStorage)
      return;
    self.localStorage['experiments'] = JSON.stringify(value);
  }

  /**
   * @param {string} experimentName
   * @param {string} experimentTitle
   * @param {boolean=} hidden
   */
  register(experimentName, experimentTitle, hidden) {
    Runtime._assert(!this._experimentNames[experimentName], 'Duplicate registration of experiment ' + experimentName);
    this._experimentNames[experimentName] = true;
    this._experiments.push(new Runtime.Experiment(this, experimentName, experimentTitle, !!hidden));
  }

  /**
   * @param {string} experimentName
   * @return {boolean}
   */
  isEnabled(experimentName) {
    this._checkExperiment(experimentName);
    // Check for explicitly disabled experiments first - the code could call setEnable(false) on the experiment enabled
    // by default and we should respect that.
    if (Runtime._experimentsSetting()[experimentName] === false)
      return false;
    if (this._enabledTransiently[experimentName])
      return true;
    if (!this.supportEnabled())
      return false;

    return !!Runtime._experimentsSetting()[experimentName];
  }

  /**
   * @param {string} experimentName
   * @param {boolean} enabled
   */
  setEnabled(experimentName, enabled) {
    this._checkExperiment(experimentName);
    const experimentsSetting = Runtime._experimentsSetting();
    experimentsSetting[experimentName] = enabled;
    this._setExperimentsSetting(experimentsSetting);
  }

  /**
   * @param {!Array.<string>} experimentNames
   */
  setDefaultExperiments(experimentNames) {
    for (let i = 0; i < experimentNames.length; ++i) {
      this._checkExperiment(experimentNames[i]);
      this._enabledTransiently[experimentNames[i]] = true;
    }
  }

  /**
   * @param {string} experimentName
   */
  enableForTest(experimentName) {
    this._checkExperiment(experimentName);
    this._enabledTransiently[experimentName] = true;
  }

  clearForTest() {
    this._experiments = [];
    this._experimentNames = {};
    this._enabledTransiently = {};
  }

  cleanUpStaleExperiments() {
    const experimentsSetting = Runtime._experimentsSetting();
    const cleanedUpExperimentSetting = {};
    for (let i = 0; i < this._experiments.length; ++i) {
      const experimentName = this._experiments[i].name;
      if (experimentsSetting[experimentName])
        cleanedUpExperimentSetting[experimentName] = true;
    }
    this._setExperimentsSetting(cleanedUpExperimentSetting);
  }

  /**
   * @param {string} experimentName
   */
  _checkExperiment(experimentName) {
    Runtime._assert(this._experimentNames[experimentName], 'Unknown experiment ' + experimentName);
  }
};

/**
 * @unrestricted
 */
Runtime.Experiment = class {
  /**
   * @param {!Runtime.ExperimentsSupport} experiments
   * @param {string} name
   * @param {string} title
   * @param {boolean} hidden
   */
  constructor(experiments, name, title, hidden) {
    this.name = name;
    this.title = title;
    this.hidden = hidden;
    this._experiments = experiments;
  }

  /**
   * @return {boolean}
   */
  isEnabled() {
    return this._experiments.isEnabled(this.name);
  }

  /**
   * @param {boolean} enabled
   */
  setEnabled(enabled) {
    this._experiments.setEnabled(this.name, enabled);
  }
};

// This must be constructed after the query parameters have been parsed.
Runtime.experiments = new Runtime.ExperimentsSupport();

/** @type {Function} */
Runtime._appStartedPromiseCallback;
Runtime._appStartedPromise = new Promise(fulfil => Runtime._appStartedPromiseCallback = fulfil);
/**
 * @type {?string}
 */
Runtime._remoteBase;
(function validateRemoteBase() {
  if (location.href.startsWith('chrome-devtools://devtools/bundled/') && Runtime.queryParam('remoteBase')) {
    const versionMatch = /\/serve_file\/(@[0-9a-zA-Z]+)\/?$/.exec(Runtime.queryParam('remoteBase'));
    if (versionMatch)
      Runtime._remoteBase = `${location.origin}/remote/serve_file/${versionMatch[1]}/`;
  }
})();


/**
 * @interface
 */
function ServicePort() {
}

ServicePort.prototype = {
  /**
   * @param {function(string)} messageHandler
   * @param {function(string)} closeHandler
   */
  setHandlers(messageHandler, closeHandler) {},

  /**
   * @param {string} message
   * @return {!Promise<boolean>}
   */
  send(message) {},

  /**
   * @return {!Promise<boolean>}
   */
  close() {}
};

/** @type {!Runtime} */
var runtime;  // eslint-disable-line
