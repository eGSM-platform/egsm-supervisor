
var fs = require('fs');
const multer = require('multer'); //For receiving files through HTTP POST
var xml2js = require('xml2js');
var Client = require('node-rest-client').Client;
var client = new Client();
var express = require('express');
var app = express();
var bodyParser = require('body-parser')
var jsonParser = bodyParser.json()

//Websocket
var WebSocketServer = require('websocket').server;
var http = require('http');

//Setting up storage for file posting
const storage = multer.memoryStorage({
    destination: function (req, file, callback) {
        callback(null, "");
    },
})

const upload = multer({ storage: storage });


var LOG = require('./modules/logger')
var aux = require('./modules/auxiliary')

module.id = 'MAIN'
var config = undefined
var parseString = xml2js.parseString;

function applyConfig(config) {
    //Add Brokers
    var brokers = config['configuration']['broker']
    for (var i in brokers) {
        registerBroker(brokers[i]['host'][0], brokers[i]['port'][0], brokers[i]['username'][0], brokers[i]['password'][0])
    }

    //Wait for the requested number of Workers and Aggregators to register at Supervisor
    //It is necessary to add the engines
    (async () => {
        while (true) {
            console.log('wait')
            var workers_registered = WORKERS.size >= config['configuration']['engines-to-wait']
            var aggregators_registered = AGENTS.length >= config['configuration']['aggregator-to-wait']
            if (workers_registered && aggregators_registered) {
                console.log('wait')
                break
            }
            await aux.sleep(1000);
        }
    })().then(function () {
        //Add Engines
        var engines = config['configuration']['engine']
        for (var engine in engines) {
            var engineid = engines[engine]['engine_id'][0]
            var brokers = engines[engine]['broker']//['broker']
            var default_broker_host = engines[engine]['default_broker_host'][0]
            var default_broker_port = engines[engine]['default_broker_port'][0]
            var info_model = fs.createReadStream(engines[engine]['info_model'][0], 'utf8')
            var process_model = fs.createReadStream(engines[engine]['process_model'][0], 'utf8')
            var event_router_config = fs.createReadStream(engines[engine]['event_router_config'][0], 'utf8')
            var brokerObjects = []
            var default_broker
            for (var k in BROKERS) {
                if (default_broker_host == BROKERS[k].host && default_broker_port == BROKERS[k].port) {
                    default_broker = BROKERS[k]
                }
            }
            for (var i in brokers) {
                for (var k in BROKERS) {
                    if (brokers[i]['host'][0] == BROKERS[k].host && brokers[i]['port'][0] == BROKERS[k].port) {
                        brokerObjects.push(BROKERS[k])
                    }
                }
            }
            registerEngine(engineid, brokerObjects, default_broker, info_model, process_model, event_router_config)
        }
    })
}

LOG.logSystem('DEBUG', 'Supervisor started', module.id)
if (process.argv.length == 3) {
    LOG.logSystem('DEBUG', 'Supervisor starting with initialization file', module.id)
    try {
        const data = fs.readFileSync(process.argv[2], 'utf8');
        LOG.logSystem('DEBUG', 'Initialization file read', module.id)

        parseString(data, function (err, result) {
            if (err) {
                LOG.logSystem('ERROR', `Error while parsing initialization file: ${err}`, module.id)
                throw 'parsing_error'
            }
            config = result
        })
    } catch (err) {
        LOG.logSystem('DEBUG', `Error while reading initialization file: ${err}`, module.id)
        return
    }
}
else if (process.argv.length <= 3) {
    LOG.logSystem('DEBUG', 'Supervisor starting without initialization file', module.id)
}
else if (process.argv.length > 3) {
    LOG.logSystem('DEBUG', 'Too many arguments! Shutting down...', module.id)
    return
}

//EXECUTION STARTING POINT
//Global Variables
var BROKERS = [] //List of brokers (and their credentials)
var AGENTS = [] //List of aggregators
var WORKERS = new Map() //Worker id -> Worker object
var ENGINES = new Map() //Engine id -> Engine object

//Apply definitions in configuration files (if exists)
//Function will block until the defined number of Workers and Aggregators connect
if (typeof config != 'undefined') {
    LOG.logSystem('DEBUG', 'Applying configurations', module.id)
    applyConfig(config)
}

function registerBroker(host, port, username, password) {
    LOG.logSystem('DEBUG', 'registerBroker function called', module.id)
    BROKERS.forEach(item => {
        if (item.host == host && item.port == port) {
            LOG.logSystem('DEBUG', `Broker [${host}]:[${port}] is already defined`, module.id)
            return false
        }
    })
    BROKERS.push(aux.Broker(host, port, username, password))
    LOG.logSystem('DEBUG', `Broker [${host}]:[${port}] succesfully registered`, module.id)
    return true
}

function registerWorker(workerid, capacity, host, port) {
    LOG.logSystem('DEBUG', 'registerWorker function called', module.id)
    if (WORKERS.has(workerid)) {
        LOG.logSystem('DEBUG', `Worker [${workerid}] is already defined`, module.id)
        return false
    }
    WORKERS.set(workerid, aux.Worker(workerid, capacity, host, port))
    LOG.logSystem('DEBUG', `Worker [${workerid}] succesfully registered`, module.id)
    return true
}

function deregisterWorker(workerid) {
    LOG.logSystem('DEBUG', 'deregisterWorker function called', module.id)
    if (!WORKERS.has(workerid)) {
        LOG.logSystem('WARNING', `Worker [${workerid}] is not known, could not deregister`, module.id)
        return false
    }
    if (WORKERS.get(workerid).engines.length != 0) {
        LOG.logSystem('WARNING', `Worker [${workerid}] requested its deregistration, but it still has engine(s) assigned`, module.id)
    }
    WORKERS.delete(workerid)
    LOG.logSystem('DEBUG', `Worker [${workerid}] deregistered`, module.id)
    return true
}

function registerEngine(engineid, brokers, default_broker, informal_model, process_model, eventRouterConfig) {
    LOG.logSystem('DEBUG', 'registerEngine function called', module.id)
    if (ENGINES.has(engineid)) {
        LOG.logSystem('WARNING', `Engine [${engineid}] is already registered`, module.id)
        return false
    }

    LOG.logSystem('DEBUG', `Searching for  worker slot for [${engineid}]`, module.id)
    for (let [key, value] of WORKERS) {
        if (value.capacity > value.engines.length) {
            LOG.logSystem('DEBUG', `Engine [${engineid}] is now assigned to Worker [${key}]`, module.id)
            var newEngine = aux.Engine(engineid, brokers, default_broker)
            value.addEngine(newEngine, informal_model, process_model, eventRouterConfig)
            ENGINES.set(engineid, newEngine)
            LOG.logSystem('DEBUG', `Engine [${engineid}] initialized and created on Worker [${key}]`, module.id)
            resourceCheck()
            return true
        }
    }
    LOG.logSystem('ERROR', `Could not find free worker slot for Engine [${engineid}]`, module.id)
    resourceCheck()
    return false
}

function registerAgent(agentid, host, port) {
    LOG.logSystem('DEBUG', 'registerAgent function called', module.id)
    if (AGENTS.indexOf(agentid) != -1) {
        LOG.logSystem('WARNING', `Agent [${agentid}] is already registered`, module.id)
        return false
    }
    AGENTS.push(aux.Agent(agentid, host, port))
    LOG.logSystem('DEBUG', `Agnet [${agentid}] succesfully initialized`, module.id)
    return true
}

function resourceCheck() {
    //TODO: Iterate through all the workers and if ([free slots]/[number of slots] * 100 > new-worker-spawn-load) then
    //call requestNewWorker() to spawn a new Worker instance 
}

function requestNewWorker() {
    //TODO: Orders systen to spawn a new Worker instance
}

//TODO: Proper UUID generation
//TODO
//WEBSOCKET
var server = http.createServer(function (request, response) {
    console.log((new Date()) + ' Received request for ' + request.url);
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

    var connection = request.accept('echo-protocol', request.origin);
    console.log((new Date()) + ' Connection accepted.');
    connection.on('message', function (message) {
        if (message.type === 'utf8') {
            console.log('Received Message: ' + message.utf8Data);
            connection.sendUTF(message.utf8Data);
        }
        else if (message.type === 'binary') {
            console.log('Received Binary Message of ' + message.binaryData.length + ' bytes');
            connection.sendBytes(message.binaryData);
            
        }
    });
    connection.on('close', function (reasonCode, description) {
        console.log((new Date()) + ' Peer ' + connection.remoteAddress + ' disconnected.');
    });
});


//ROUTES
app.post("/worker/register", jsonParser, function (req, res) {
    LOG.logSystem('DEBUG', 'Worker registering request received', module.id)
    if (typeof req.body == 'undefined') {
        LOG.logSystem('DEBUG', 'Request body is missing', module.id)
        return res.status(500).send({ error: "Body missing" })
    }

    //Check if necessary data fields are available
    var max_engines = req.body.max_engines
    var rest_api_port = req.body.rest_api_port
    var host = req.socket.remoteAddress.split(':')[3]
    if (typeof max_engines == "undefined" || host == "undefined" || typeof rest_api_port == "undefined") {
        LOG.logSystem('DEBUG', 'Request cancelled. Argument(s) are missing', module.id)
        return res.status(500).send({ "error": "Argument(s) are missing" })
    }

    var workerid = 'worker-' + Math.random().toString(16).substr(2, 8)

    if (registerWorker(workerid, max_engines, host, rest_api_port)) {
        LOG.logSystem('DEBUG', `New worker registered with: ${workerid}`, module.id)
        res.status(200).send({
            'worker_id': workerid
        })
    }
    else {
        LOG.logSystem('DEBUG', `Could not register worker with: ${workerid}`, module.id)
        res.status(500).send({})
    }
})

app.post("/worker/deregister", jsonParser, function (req, res) {
    LOG.logSystem('DEBUG', 'Worker deregistering request received', module.id)
    var worker_id = req.body.worker_id
    if (typeof worker_id == 'undefined') {
        LOG.logSystem('DEBUG', 'Request cancelled. Argument(s) are missing', module.id)
        return res.status(500).send({ "error": "Argument(s) are missing" })
    }
    if (deregisterWorker(worker_id)) {
        LOG.logSystem(`DEBUG`, `Worker [${worker_id}] removed from supervisor`, module.id)
        return res.status(200)
            .send({
                "message": "deregistered"
            })
    }
    else {
        LOG.logSystem(`DEBUG`, `Error while deregistering [${worker_id}]`, module.id)
        return res.status(500)
            .send({
                "message": "error while deregistering"
            })
    }
})

app.post("/agent/register", jsonParser, upload.any(), function (req, res) {
    LOG.logSystem('DEBUG', 'Agent registering request received', module.id)
    if (typeof req.body == 'undefined') {
        LOG.logSystem('DEBUG', 'Request body is missing', module.id)
        return res.status(500).send({ error: "Body missing" })
    }

    //Check if necessary data fields are available
    var rest_api_port = req.body.rest_api_port
    var host = req.socket.remoteAddress.split(':')[3]
    if (host == "undefined" || typeof rest_api_port == "undefined") {
        LOG.logSystem('DEBUG', 'Request cancelled. Argument(s) are missing', module.id)
        return res.status(500).send({ "error": "Argument(s) are missing" })
    }

    var agentid = 'agent-' + Math.random().toString(16).substr(2, 8)

    if (registerAgent(agentid, host, rest_api_port)) {
        LOG.logSystem('DEBUG', `New agent registered with: ${agentid}`, module.id)
        res.status(200).send({
            'agent_id': agentid
        })
    }
    else {
        LOG.logSystem('DEBUG', `Internal server error`, module.id)
        res.status(500).send({})
    }
})

app.post("/agent/deregister", jsonParser, function (req, res) {
    LOG.logSystem('DEBUG', 'Agent deregistering request received', module.id)
    var agent_id = req.body.agent_id
    if (typeof agent_id == 'undefined') {
        LOG.logSystem('DEBUG', 'Request cancelled. Argument(s) are missing', module.id)
        return res.status(500).send({ "error": "Argument(s) are missing" })
    }
    if (deregisterAgent(agent_id)) {
        LOG.logSystem(`DEBUG`, `Agent [${agent_id}] removed from supervisor`, module.id)
        return res.status(200)
            .send({
                "message": "deregistered"
            })
    }
    else {
        LOG.logSystem(`DEBUG`, `Error while deregistering Agent [${agent_id}]`, module.id)
        return res.status(500)
            .send({
                "message": "error while deregistering"
            })
    }
})

var server = app.listen(8085, function () {
    var port = server.address().port;
    console.log("Broker listening on port " + port);
})

