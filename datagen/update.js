/*jslint node: true */

'use strict';

// Start a timer to track the duration of the program:
// (using color codes: 32m = green, 0m = reset)
console.time('\x1b[32mFinished successfully.\x1b[0m Time taken');

var sourceFile = './kanjidic',
    destFile = './kanjilist.js',
    optionsFile = './options.json',
    fs = require('fs'), // filesystem
    convert = require('./convertor.js');

/**
 * Final callback called when the program is finished.
 * @param  {Object} err Error object.
 * @return {Undefined}
 */
function done(err) {
    if (err) {
        // Finished with errors; log info to stdout and error to stderr:
        // (using color codes: 31m = red, 0m = reset)
        console.log('\x1b[31mFinished with errors.\x1b[0m');
        console.error(err);
    } else {
        // Finished successfully; log info and timer to stdout:
        // (using color codes: 32m = green, 0m = reset)
        console.timeEnd('\x1b[32mFinished successfully.\x1b[0m Time taken');
    }
}

// Begin the program by asynchronously reading the entire options file into
// memory and applying it to the convertor:
fs.readFile(optionsFile, 'utf8', function (err, res) {
    // Do not proceed if there's an error reading the file:
    if (err) { return done(err); }

    // Attempt to convert the source file contents and write them to the
    // destination file while applying the options:
    try {
        convert(sourceFile, destFile, JSON.parse(res), done);
    } catch (e) {
        done(e.getMessage());
    }
});