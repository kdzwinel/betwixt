//'use strict';



const static = require('node-static');

const app = require('app');
const path = require('path');
const sslCaDir = path.resolve(app.getPath('userData'), 'ssl/certs');
const fileServer = new static.Server(sslCaDir);

var os = require('os');

var interfaces = os.networkInterfaces();
var addresses = [];
for (var k in interfaces) {
    for (var k2 in interfaces[k]) {
        var address = interfaces[k][k2];
        if (address.family === 'IPv4' && !address.internal) {
            addresses.push(address.address);
        }
    }
}

function RunStaticServer(){

    var port = 9090;
    require('http').createServer(function (request, response) {
        request.addListener('end', function () {
            console.log(request);
            if(request.url == '/' || request.url == ''){
                response.setHeader('Content-Type', 'text/html');
                response.write('click <a href="./ca.pem">THIS</a> to install');
                response.end();
            }else{
                fileServer.serve(request, response, function (err, result) {
                    if (err) { // There was an error serving the file
                        console.error("Error serving " + request.url + " - " + err.message);

                        // Respond to the client
                        response.writeHead(err.status, err.headers);
                        response.end();
                    }
                });
            }
            
        }).resume();
    }).listen(port, function(){
        console.log('If you want to capture HTTPS package, you need download certs files and intall them in mobile, the download urls are below:');
        for(var i =0, ilen = addresses.length; i < ilen; i++){
            console.log('\t http://' + addresses[i] +  ':' + port);
        }
        console.log('\n');
    });



}


module.exports = RunStaticServer;
