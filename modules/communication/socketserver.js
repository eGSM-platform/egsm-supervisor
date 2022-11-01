var WebSocketServer = require('websocket').server;
var http = require('http');

var LOG = require('../egsm-common/auxiliary/logManager')
var MQTTCOMM = require('./mqttcommunication')

module.id = 'SOCKET'



var server = http.createServer(function (request, response) {
    LOG.logSystem('DEBUG', 'Received request', module.id)
    response.writeHead(404);
    response.end();
});
server.listen(8080, function () {
    console.log(' Server is listening on port 8080');
});

wsServer = new WebSocketServer({
    httpServer: server,
    // You should not use autoAcceptConnections for production
    // applications, as it defeats all standard cross-origin protection
    // facilities built into the protocol and the browser.  You should
    // *always* verify the connection's origin and decide whether or not
    // to accept it.
    autoAcceptConnections: false
});

function originIsAllowed(origin) {
    // put logic here to detect whether the specified origin is allowed.
    return true;
}

wsServer.on('request', function (request) {
    if (!originIsAllowed(request.origin)) {
        // Make sure we only accept requests from an allowed origin
        request.reject();
        console.log((new Date()) + ' Connection from origin ' + request.origin + ' rejected.');
        return;
    }

    var connection = request.accept('data-connection', request.origin);
    console.log((new Date()) + ' Connection accepted.');

    connection.on('message', function (message) {
        //console.log('Received: ' + JSON.parse(message.utf8Data))
        messageHandler(message.utf8Data).then((data) => {
            console.log(JSON.stringify(data))
            connection.sendUTF(JSON.stringify(data))
        })

    });
    connection.on('close', function (reasonCode, description) {
        console.log((new Date()) + ' Peer ' + connection.remoteAddress + ' disconnected.');
    });
});

async function messageHandler(message) {
    var response = undefined
    var msgObj = JSON.parse(JSON.parse(message))

    var promise = new Promise(async function (resolve, reject) {
        if (msgObj['type'] == 'update_request') {
            switch (msgObj['module']) {
                case 'overview':
                //TODO
                case 'system_information':
                    var workers = await MQTTCOMM.getWorkerList()
                    var aggregators = await MQTTCOMM.getAggregatorList()

                    response = {
                        module: 'system_information',
                        payload: {
                            system_up_time: Date.now().toString(),
                            worker_number: workers.length,
                            aggregator_number: aggregators.length,
                        }
                    }
                    console.log('Response:' + response)
                    resolve(response)
            }
        }
    });
    return promise

}