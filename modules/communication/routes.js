const multer = require('multer'); //For receiving files through HTTP POST
var express = require('express');
var app = express();
var bodyParser = require('body-parser')
var jsonParser = bodyParser.json()


var LOG = require('../auxiliary/logger')
var RESOURCEMAN = require('../resourcemanager/resourcemanager')

module.id = 'ROUTES'

var LOCAL_HTTP_PORT = 8085

//Setting up storage for file posting
const storage = multer.memoryStorage({
    destination: function (req, file, callback) {
        callback(null, "");
    },
})
const upload = multer({ storage: storage });

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

    while (true) {
        var workerid = 'worker-' + Math.random().toString(16).substr(2, 8)
        if (!RESOURCEMAN.isWorkerExists(workerid)) {
            break
        }
    }

    if (RESOURCEMAN.registerWorker(workerid, max_engines, host, rest_api_port)) {
        LOG.logSystem('DEBUG', `New worker registered with: ${workerid}`, module.id)
        res.status(200).send({
            'worker_id': workerid
        })
    }
    else {
        LOG.logSystem('DEBUG', `Could not register worker with: ${workerid}`, module.id)
        res.status(500).send({ error: 'internal error' })
    }
})

app.post("/worker/deregister", jsonParser, function (req, res) {
    LOG.logSystem('DEBUG', 'Worker deregistering request received', module.id)
    var worker_id = req.body.worker_id
    if (typeof worker_id == 'undefined') {
        LOG.logSystem('DEBUG', 'Request cancelled. Argument(s) are missing', module.id)
        return res.status(500).send({ error: "Argument(s) are missing" })
    }
    if (RESOURCEMAN.deregisterWorker(worker_id)) {
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
                error: "error while deregistering"
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

    while (true) {
        var agentid = 'agent-' + Math.random().toString(16).substr(2, 8)
        if (!RESOURCEMAN.isAgentExists(agentid)) {
            break
        }
    }

    if (RESOURCEMAN.registerAgent(agentid, host, rest_api_port)) {
        LOG.logSystem('DEBUG', `New agent registered with: ${agentid}`, module.id)
        res.status(200).send({
            'agent_id': agentid
        })
    }
    else {
        LOG.logSystem('DEBUG', `Internal server error`, module.id)
        res.status(500).send({ error: "internal error" })
    }
})

app.post("/agent/deregister", jsonParser, function (req, res) {
    LOG.logSystem('DEBUG', 'Agent deregistering request received', module.id)
    var agent_id = req.body.agent_id
    if (typeof agent_id == 'undefined') {
        LOG.logSystem('DEBUG', 'Request cancelled. Argument(s) are missing', module.id)
        return res.status(500).send({ "error": "Argument(s) are missing" })
    }
    if (RESOURCEMAN.deregisterAgent(agent_id)) {
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
                error: "error while deregistering"
            })
    }
})

app.get("/test", jsonParser, function (req, res) {
    RESOURCEMAN.deregisterEngine('DummyProcess/instance1');
})

var server = app.listen(LOCAL_HTTP_PORT, function () {
    LOG.logSystem(`DEBUG`, `Supervisor listening on port ${LOCAL_HTTP_PORT}`, module.id)
})

process.on('SIGINT', () => {
    server.close(() => {
        LOG.logWorker(`DEBUG`, `Terminating REST API`, module.id)
        process.exit()
    });
});