'use strict';

const url = require('url');
const zlib = require('zlib');
const isTextOrBinary = require('istextorbinary');
const getTime = require('./init-time');

const generateConnectionId = (() => {
    let id = 1;
    return () => id++;
})();

/**
 * All information regarding request and corresponding response - includes timing information.
 */
class CapturedConnection {
    constructor() {
        this._id = generateConnectionId();
        this._timing = {
            wallTime: Date.now() / 1000,
            start: getTime()
        };
        this._chunks = [];
        this._request = null;
        this._response = null;
        this._binary = null;
        this._resourceType = 'Other';
        this._encodedSize = null;
        this._responseBody = null;
    }

    setRequest(req, isSSL, body) {
        this._request = {
            url: fullUrl(req, isSSL),
            method: req.method,
            headers: req.headers,
            postData: body
        };
    }

    setResponse(res) {
        this._response = {
            url: res.url,
            statusCode: res.statusCode,
            statusMessage: res.statusMessage,
            headers: flattenHeaders(res.headers),
            rawHeaders: recreateRawResponseHeaders(res),
            connectionId: res.connection.localPort,
            remoteAddress: res.connection.remoteAddress,
            remotePort: res.connection.remotePort
        };

        this._resourceType = getResourceType(res.headers['content-type']);
    }

    getId() {
        return this._id;
    }

    getTiming() {
        return this._timing;
    }

    registerResponseReceived() {
        this._timing.responseReceived = getTime();
    }

    registerDataReceived(data) {
        if (!this._chunks) {
            this._timing.dataReceived = getTime();
        }

        this._chunks.push(data);
    }

    registerResponseFinished() {
        this._timing.responseFinished = getTime();

        if (this._chunks.length) {
            let buffer = Buffer.concat(this._chunks);
            this._encodedSize = buffer.length;

            if (this.isEncoded()) {
                buffer = unpackBody(buffer, this._response.headers['content-encoding']);
            }

            this._binary = isBinary(this._response.headers['content-type'], buffer);
            this._responseBody = this.isBinary() ? buffer.toString('base64') : buffer.toString('utf8');

            this._chunks = [];
        }
    }

    getResourceType() {
        return this._resourceType;
    }

    getEncodedSize() {
        let encodedBodySize = this._encodedSize;

        if (encodedBodySize !== null) {
            let headerSize = this._response && this._response.rawHeaders.length;

            return (headerSize + encodedBodySize);
        }

        return Number.parseInt(this._response.headers['content-length'], 10);
    }

    getSize() {
        return this._responseBody && this._responseBody.length;
    }

    getRequest() {
        return this._request;
    }

    getResponse() {
        return this._response;
    }

    isBinary() {
        return this._binary;
    }

    isEncoded() {
        let contentEncoding = this._response && this._response.headers['content-encoding'];

        return (contentEncoding === 'gzip' || contentEncoding === 'deflate');
    }

    getResponseBody() {
        return this._responseBody;
    }
}

function fullUrl(req, isSSL) {
    let parsedUrl = url.parse(req.url);
    parsedUrl.protocol = isSSL ? 'https' : 'http';
    parsedUrl.host = req.headers.host;

    return url.format(parsedUrl);
}

//TODO should be async
function unpackBody(buffer, encoding) {
    if (encoding === 'gzip') {
        try {
            return zlib.unzipSync(buffer);
        } catch (e) {
            return buffer;
        }
    } else if (encoding === 'deflate') {
        try {
            return zlib.inflateSync(buffer);
        } catch (e) {
            return buffer;
        }
    } else {
        throw Error('unknown encoding');
    }
}

function isBinary(contentType, buffer) {
    let type = getResourceType(contentType);

    //TODO Image is not always binary (SVG)
    if (type === 'Image' || type === 'Media' || type === 'Font') {
        return true;
    }

    if (type === 'Other' && isTextOrBinary.isBinarySync(buffer)) {
        return true;
    }

    return false;
}

// See https://chromedevtools.github.io/debugger-protocol-viewer/Page/#type-ResourceType
// TODO steal more comprehensive solution from other library or... find a library for that
function getResourceType(contentType) {
    if (contentType && contentType.match) {
        if (contentType.match('text/css')) {
            return 'Stylesheet';
        }
        if (contentType.match('text/html')) {
            return 'Document';
        }
        if (contentType.match('/(x-)?javascript')) {
            return 'Script';
        }
        if (contentType.match('image/')) {
            return 'Image';
        }
        if (contentType.match('video/')) {
            return 'Media';
        }
        if (contentType.match('font/') || contentType.match('/(x-font-)?woff')) {
            return 'Font';
        }
        if (contentType.match('/(json|xml)')) {
            return 'XHR';
        }
    }

    return 'Other';
}

//TODO try getting real raw response headers instead of this thing
function recreateRawResponseHeaders(res) {
    let headerString = '';

    for (let i = 0, l = res.rawHeaders.length; i < l; i += 2) {
        headerString += res.rawHeaders[i] + ': ' + res.rawHeaders[i + 1] + '\n';
    }

    return `HTTP/${res.httpVersion} ${res.statusCode} ${res.statusMessage}
${headerString}`;
}

// response object keeps some params (like cookies) in an array, devtools don't like that, they want a string
function flattenHeaders(headers) {
    let flatHeaders = {};

    for (let name in headers) {
        let value = headers[name];

        if (Array.isArray(value)) {
            value = value.join('\n');
        }

        flatHeaders[name] = value;
    }

    return flatHeaders;
}

module.exports = CapturedConnection;
