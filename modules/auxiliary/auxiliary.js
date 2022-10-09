const axios = require('axios').default;
var FormData = require('form-data');

var LOG = require('./logger')

module.id = "AUX"

module.exports = {
    Broker: function (host, port, username, password) {
        return {
            host: host,
            port: port,
            username: username,
            password: password
        }
    },

    Worker: function (workerid, capacity, host, port) {
        return {
            id: workerid,
            capacity: capacity,
            host: host,
            port: port,
            engines: [],
            brokerconnections: [],

            addBrokerConnection: function (broker) {
                LOG.logSystem('DEBUG', `Adding broker connection ([${broker.host}]:[${broker.port}]) for Worker ${this.id}`, module.id)
                const config = {
                    method: 'post',
                    url: `http://${this.host}:${this.port}/broker_connection/new`,
                    headers: { "Content-Type": "application/json" },
                    data: {
                        mqtt_broker: broker.host,
                        mqtt_port: broker.port,
                        mqtt_user: broker.username,
                        mqtt_password: broker.password,
                        client_uuid: 'ntstmqtt_' + Math.random().toString(16).substr(2, 8)
                    }
                }
                var that = this
                axios(config).then(function (response) {
                    if (response.status != 200) {
                        LOG.logWorker('WARNING', 'Server response code: ' + response.status, module.id)
                        resolve(false);
                    }
                    else {
                        that.brokerconnections.push(broker)
                    }
                })
                return true
            },

            addEngine: function (engine, informal_model, process_model, eventRouterConfig) {
                //Check if the engine is not assigned to the worker yet (just for safety)
                LOG.logSystem('DEBUG', `Adding engine [${engine.engineid}] to Worker [${this.id}]`, module.id)
                this.engines.forEach(item => {
                    if (item == engine.engineid) {
                        LOG.logSystem('WARNING', `Engine [${engine.engineid}] is already added to Worker [${this.id}]`, module.id)
                        return true
                    }
                })

                //Add broker connections to the worker which are necessary to serve the engine
                var success = true
                engine.brokers.forEach(item => {
                    success = success && this.addBrokerConnection(item)
                })

                //If all broker registration went well then register the engine itself
                if (success) {
                    var formData = new FormData();
                    formData.append("informal_model", informal_model);
                    formData.append("process_model", process_model);
                    formData.append("event_router_config", eventRouterConfig);

                    formData.append("engine_id", engine.engineid);
                    formData.append("mqtt_broker", engine.default_broker.host);
                    formData.append("mqtt_port", engine.default_broker.port);
                    formData.append("mqtt_user", engine.default_broker.username);
                    formData.append("mqtt_password", engine.default_broker.password);

                    const config = {
                        method: 'post',
                        url: `http://${this.host}:${this.port}/engine/new`,
                        headers: { "Content-Type": "multipart/form-data" },
                        data: formData
                    }
                    axios(config).then(function (response) {
                        if (response.status != 200) {
                            LOG.logWorker('WARNING', 'Server response code: ' + response.status, module.id)
                            resolve(false);
                        }
                    })
                    //Finally add the new engine to the local collection
                    this.engines.push(engine)
                }
                else {
                    LOG.logSystem('WARNING', `Error occurred while added brokers to Worker [${this.id}] for Engine [${engine.engineid}]`)
                }
            },

            removeEngine: function (engine) {
                LOG.logSystem('DEBUG', `Removing engine [${engine.engineid}] from Worker [${this.id}]`, module.id)
                var index = -1
                for (var item in this.engines) {
                    if (this.engines[item].engineid == engine.engineid) {
                        index = item
                        break
                    }
                }
                if (item == -1) {
                    LOG.logSystem('WARNING', `Engine [${engine.engineid}] is not registered to Worker [${this.id}], cannot be unregistered`)
                    return false
                }

                const config = {
                    method: 'delete',
                    url: `http://${this.host}:${this.port}/engine/remove`,
                    headers: { "Content-Type": "application/json" },
                    data: {
                        engine_id: engine.engineid
                    }
                }
                axios(config).then(function (response) {
                    if (response.status != 200) {
                        LOG.logWorker('WARNING', 'Server response code: ' + response.status, module.id)
                        resolve(false);
                    }
                })
                this.engines = this.engines.splice(index, 1)
            }
        }
    },

    Engine(engineid, brokers, default_broker) {
        return {
            engineid: engineid,
            brokers: brokers,
            default_broker: default_broker,
        }
    },

    Agent: function (agentid, host, port) {
        return {
            id: agentid,
            host: host,
            port: port,
            processClasses: [],
            processes: []
        }
    },

    ProcessClass: function (name, processes) {
        return {
            name: name,
            processes: processes
        }
    },

    sleep: function (ms) {
        return new Promise((resolve) => {
            setTimeout(resolve, ms);
        });
    }
}
