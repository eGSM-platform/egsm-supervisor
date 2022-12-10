/**
 * Process Library is intended to serve as a storage space of process definitions
 * After initialization the module provides a fast and easy way to get process definitions
 */
var fs = require('fs')
var xml2js = require('xml2js');
var LOG = require('../egsm-common/auxiliary/logManager')
const { Perspective, ProcessType } = require('../egsm-common/auxiliary/primitives')
var parseString = xml2js.parseString;

module.id = 'PROCESSLIB'

const LIBRARY_FOLDER = './process_library/'

var PROCESS_TYPES = new Map() //Storage space to store all process type definitions


/**
 * Loads all Proccess Types from the LIBRARY_FOLDER
 * File representations are stored in RAM (no adhoc file operations)
 * Should be called right after startup and (currently) not intended to call it in runtime
 */
function loadProcessTypes() {
    LOG.logSystem('DEBUG', 'Loading Process Library', module.id)
    var index = 1
    while (true) {
        var folder = LIBRARY_FOLDER + 'process_' + index.toString()
        if (fs.existsSync(folder)) {
            LOG.logSystem('DEBUG', `Directory exists! - ${folder}`, module.id)

            try {
                const config_file = fs.readFileSync(folder + '/process.xml', 'utf8');
                LOG.logSystem('DEBUG', 'Initialization file read', module.id)

                parseString(config_file, function (err, process_config) {
                    if (err) {
                        LOG.logSystem('FATAL', `Error while parsing initialization file: ${err}`, module.id)
                    }
                    LOG.logSystem('DEBUG', 'Applying configurations', module.id)
                    var process_config = process_config['process-type']

                    //Extracting and storing process details
                    if (PROCESS_TYPES.has(process_config['name'][0])) {
                        LOG.logSystem('FATAL', `Cannot defined 2 process types with the same name [${process_config['name'][0]}]`, module.id)
                    }
                    var name = process_config['name'][0]
                    var description = process_config['description'][0]
                    var bpmn_model = fs.readFileSync(LIBRARY_FOLDER + 'process_' + index.toString() + "/" + process_config['bpmn-model'][0]['model'][0], 'utf8');
                    var perspectives = []
                    var stakeholders = new Set()

                    //Iterating through perspectives
                    process_config['perspective'].forEach(element => {
                        perspectives.push(new Perspective(element['name'][0],
                            fs.readFileSync(LIBRARY_FOLDER + 'process_' + index.toString() + "/" + element['egsm-model'][0], 'utf8'),
                            fs.readFileSync(LIBRARY_FOLDER + 'process_' + index.toString() + "/" + element['info-model'][0], 'utf8'),
                            fs.readFileSync(LIBRARY_FOLDER + 'process_' + index.toString() + "/" + element['bindings'][0], 'utf8')))
                    });

                    //Getting all Stakeholders from binding files
                    perspectives.forEach(element => {
                        parseString(element.bindings, function (err, bindingObj) {
                            for (var key in bindingObj['martifact:definitions']['martifact:stakeholder']) {
                                stakeholders.add(bindingObj['martifact:definitions']['martifact:stakeholder'][key]['$'].name)
                            }
                        })
                    });
                    var currentProcess = new ProcessType(name, stakeholders, description, bpmn_model, perspectives)
                    PROCESS_TYPES.set(name, currentProcess)
                })
            } catch (err) {
                LOG.logSystem('FATAL', `Error while reading initialization file: ${err}`, module.id)
            }
            index += 1
            continue
        }
        break
    }
    LOG.logSystem('DEBUG', 'Process Library loaded', module.id)
}

/**
 * Get all available process types
 * The returning object contains only basic informations about the process type
 * Use getProcessType() instead if you need the process definition files
 * @returns {ProcessType[]} A list of available Process types, containing their names and description
 */
function getProcessTypeList() {
    var result = []
    for (let [key, value] of PROCESS_TYPES) {
        result.push({
            process_type_name: key,
            description: PROCESS_TYPES.get(key)['description']
        })
    }
    return result
}

/**
 * Gets a Process Type definition from the module specified by process_type_name
 * @param {*} process_type_name ID of the Process Type
 * @returns {ProcessType || string} Returns a ProcessType object or 'not_found'
 */
function getProcessType(process_type_name) {
    if (PROCESS_TYPES.has(process_type_name)) {
        return PROCESS_TYPES.get(process_type_name)
    }
    return 'not_found'
}

loadProcessTypes()

module.exports = {
    getProcessTypeList: getProcessTypeList,
    getProcessType: getProcessType,
}