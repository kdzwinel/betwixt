'use strict';

/*
Functions below are responsible for creating valid Remote Debugging Protocol messages based on the
CapturedConnection object.
 */

function requestWillBeSent(connection) {
    let request = connection.getRequest();

    return {
        requestId: `${connection.getId()}`,
        frameId: '123.2',
        loaderId: '123.67',
        documentURL: 'http://betwixt',
        request: {
            url: request.url,
            method: request.method,
            headers: request.headers,
            initialPriority: 'High',
            mixedContentType: 'none',
            postData: request.postData
        },
        timestamp: connection.getTiming().start,
        wallTime: connection.getTiming().wallTime,
        initiator: {
            type: 'other'
        },
        type: connection.getResourceType()
    };
}

function responseReceived(connection) {
    let response = connection.getResponse();

    return {
        requestId: `${connection.getId()}`,
        frameId: '123.2',
        loaderId: '123.67',
        timestamp: connection.getTiming().responseReceived,
        type: connection.getResourceType(),
        response: {
            url: response.url,
            status: response.statusCode,
            statusText: response.statusMessage,
            headers: response.headers,
            headersText: response.rawHeaders,
            mimeType: response.headers['content-type'] || '',
            connectionReused: true,
            connectionId: response.connectionId,
            encodedDataLength: connection.getEncodedSize(),
            fromDiskCache: false,
            fromServiceWorker: false,
            timing: {
                requestTime: connection.getTiming().start,
                proxyStart: -1,
                proxyEnd: -1,
                dnsStart: -1,
                dnsEnd: -1,
                connectStart: -1,
                connectEnd: -1,
                sslStart: -1,
                sslEnd: -1,
                workerStart: -1,
                workerReady: -1,
                sendStart: 0,
                sendEnd: 0,
                receiveHeadersEnd: (connection.getTiming().responseReceived - connection.getTiming().start) * 1000
            },
            requestHeaders: connection.getRequest().headers,
            remoteIPAddress: response.remoteAddress,
            remotePort: response.remotePort
        }
    };
}

function dataReceived(connection, chunkInfo) {
    return {
        requestId: `${connection.getId()}`,
        timestamp: chunkInfo.time,
        dataLength: chunkInfo.length,
        encodedDataLength: chunkInfo.encodedLength
    };
}

function loadingFinished(connection) {
    return {
        requestId: `${connection.getId()}`,
        timestamp: connection.getTiming().responseFinished,
        encodedDataLength: connection.getEncodedSize()
    };
}

function getResponseBody(connection) {
    let body = '';
    let base64Encoded = false;

    if (connection && connection.getResponseBody()) {
        body = connection.getResponseBody();
        base64Encoded = connection.isBinary();
    }

    return {
        body,
        base64Encoded
    };
}

function getResourceTree() {
    return {
        frameTree: {
            frame: {
                id: 1,
                url: 'http://betwixt',
                mimeType: 'other'
            },
            childFrames: [],
            resources: []
        }
    };
}

module.exports = {
    requestWillBeSent,
    responseReceived,
    dataReceived,
    loadingFinished,
    getResponseBody,
    getResourceTree
};
