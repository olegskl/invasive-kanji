/*jslint node: true */

'use strict';

var kanjidicSettingsFile = './settings-kanjidic.json',
    assemblySettingsFile = './settings-assembly.json',
    fs = require('fs'),
    http = require('http'),
    zlib = require('zlib'),
    util = require('util'),
    spawn = require('child_process').spawn,
    iconv = spawn('iconv', ['-f', 'euc-jp', '-t', 'utf-8']),
    convert = require('./convertor.js'),
    // (using color codes: 32m = green, 31m = red, 0m = reset)
    successMessage = '\x1b[32mFinished successfully.\x1b[0m',
    errorMessage = '\x1b[31mFinished with errors.\x1b[0m',
    timeMessage = 'Time taken';

// Start a timer to track the duration of the program:
console.time(timeMessage);

/**
 * Outputs an error to the console.
 * @param  {*} error Error message.
 * @return {Undefined}
 */
function consoleError(error) {
    console.error(error);
}

/**
 * Final callback called when the program is finished.
 * @param  {Object} err Error object.
 * @return {Undefined}
 */
function done(err) {
    if (err) {
        // Finished with errors; log info to stdout and error to stderr:
        util.print('failed.\n');
        console.log(errorMessage);
        // There can be multiple errors:
        if (util.isArray(err)) {
            err.forEach(consoleError);
        } else {
            console.error(err);
        }
        process.exit(1);
    } else {
        // Finished successfully; log info and timer to stdout:
        util.print('done.\n');
        console.log(successMessage);
        console.timeEnd(timeMessage);
        process.exit(0);
    }
}

function dictionaryAccessor(source) {
    return source.dictionary;
}

/**
 * Assembles multiple dictionaries into a single one.
 * @param  {Object}    settings Assembly settings.
 * @param  {Function}  callback Called on error or when assembly is finished.
 * @return {Undefined}
 */
function assemble(settings, callback) {
    var pending = 0, // keeps track of how many sources are being worked on
        errors = [], // container for errors
        assembly = []; // final assembly of dictionaries

    // Do not proceed no settings are provided or if the sources are unreadable:
    if (!settings || !util.isArray(settings.sources)) {
        return callback('Unable to assemble. Invalid assembly settings.');
    }

    settings.sources.forEach(function (source) {

        // The sources will be processed asynchronously,
        // so we need keep track of them:
        pending += 1;

        fs.readFile(source.filePath, 'utf8', function (err, res) {
            var dictionary;

            // We're done doing asynchronous work with this source:
            pending -= 1;

            if (err) {
                errors.push(err);
            } else {
                // Parse JSON string to array of entries:
                try {
                    dictionary = JSON.parse(res);
                    // Map dictionary name to all entries of the dictionary:
                    source.dictionary = dictionary.map(function (entry) {
                        entry.dictionary = source.dictionaryName;
                        return entry;
                    });
                } catch (parseError) {
                    errors.push(parseError);
                }
            }

            // Check if all sources have been processed:
            if (pending) { return; }

            // At this point all sources have been processed:
            if (errors.length > 0) {
                callback(errors);
            } else {
                // Combine dictionaries into a single array:
                assembly = Array.prototype.concat.apply([],
                    settings.sources.map(dictionaryAccessor));
                // Write the result to the destination file:
                fs.writeFile(settings.destinationFilePath,
                    JSON.stringify(assembly), 'utf8', callback);
            }
        });
    });
}

function performConversion(settings) {
    util.print('Converting and assembling... ');
    convert(settings, function (err) {
        // Do not proceed in case of an error:
        if (err) { return done(err); }

        fs.readFile(assemblySettingsFile, function (err, res) {
            var assemblySettings;

            // Do not proceed in case of an error:
            if (err) { return done(err); }

            try {
                assemblySettings = JSON.parse(res);
            } catch (parseError) {
                return done('Failed to parse assembly settings. ' + parseError);
            }

            // Attempt to assemble all available dictionaries into a single one:
            assemble(assemblySettings, done);
        });
    });
}

// Begin the program by asynchronously reading the entire options file into
// memory and applying it to the convertor:
fs.readFile(kanjidicSettingsFile, 'utf8', function (err, res) {
    var settings;

    util.print('Reading settings... ');

    // Do not proceed if there's an error reading the file:
    if (err) { return done(err); }

    try {
        settings = JSON.parse(res);
        util.print('done.\n');
    } catch (parseError) {
        return done('Failed to parse settings. ' + parseError);
    }

    util.print('Requesting kanjidic file from remote server... ');
    http.get(settings.remoteFile, function (res) {
        var statusCode = res.statusCode;
        if (statusCode >= 200 && statusCode < 300) {
            util.print('done.\n');
            // The remote kanjidic file is compressed and encoded in EUC-JP,
            // so we need to pipe it to iconv and zlib:
            util.print('Downloading, unzipping and converting to UTF8... ');
            iconv.stdout.pipe(fs.createWriteStream(settings.sourceFile))
                .on('close', function () {
                    util.print('done.\n');
                    performConversion(settings);
                });
            res.pipe(zlib.createGunzip()).pipe(iconv.stdin);
        } else {
            util.print('failed (' + statusCode + ').\n');
            console.log('Attempting previously downloaded file instead.');
            performConversion(settings);
        }
    }).on('error', done);

});