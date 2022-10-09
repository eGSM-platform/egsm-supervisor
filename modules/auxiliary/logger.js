var fs = require('fs');
var util = require('util');

const LOG_LEVELS = { 'DEBUG': 1, 'WARNING': 2, 'ERROR': 3, 'FATAL': 4, 'OFF':5 };
var CONSOLE_LOG_LEVEL = LOG_LEVELS.DEBUG; //Console log from a defined level above

var prefix = (new Date().toISOString().replace(/:/g, '')).replace(/\./g, '');
fs.mkdirSync('log/' + prefix);

var system_log = fs.createWriteStream('log/' + prefix + '/worker.log', { flags: 'w' });

function writeConsole(type, value, location) {
  var location = '[' + location +']'+ ' '.repeat(15 - location.length); 
  var typeFinal = type + ' '.repeat(9 - type.length); 
  if (LOG_LEVELS[type] < 2) {
    console.log(util.format(location + typeFinal + ' \t ' + value))
  }
  else if (LOG_LEVELS[type] == 2) {
    console.log("\x1b[33m%s\x1b[0m", util.format(location + typeFinal + ' \t ' + value))
  }
  else {
    console.log('\x1b[31m%s\x1b[0m', util.format(location + typeFinal + ' \t ' + value))
  }
}

var logSystem = function (type, value, location) {
  location = location || ''
  system_log.write(new Date().toISOString() + '; ' + util.format('[' + location + '] ' + type + ' - ' + value) + '\n');
  if (LOG_LEVELS[type] >= CONSOLE_LOG_LEVEL) {
    writeConsole(type, value, location)
  }
  if (LOG_LEVELS[type] == 4) {
    //throw new Error(value);
  }
}

var logWorker = function (type, value, location) {
  logSystem(type, value, location)
}

var setLogLevel = function(newLogLevel){
  CONSOLE_LOG_LEVEL = newLogLevel
}

// exposed functions
module.exports = {
  setLogLevel: setLogLevel,
  logSystem: logSystem,
  logWorker: logWorker
}