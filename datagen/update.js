/*jslint node: true */

'use strict';

// Start a timer to track the duration of the program:
// (using color codes: 32m = green, 0m = reset)
console.time('\x1b[32mFinished successfully.\x1b[0m Time taken');

var kanjidicSettingsFile = './settings-kanjidic.json',
    assemblySettingsFile = './settings-assembly.json',
    fs = require('fs'),
    http = require('http'),
    zlib = require('zlib'),
    util = require('util'),
    spawn = require('child_process').spawn,
    iconv = spawn('iconv', ['-f', 'euc-jp', '-t', 'utf-8']),
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
        // There can be multiple errors:
        if (util.isArray(err)) {
            err.forEach(function (error) {
                console.error(error);
            });
        } else {
            console.error(err);
        }
    } else {
        // Finished successfully; log info and timer to stdout:
        // (using color codes: 32m = green, 0m = reset)
        console.timeEnd('\x1b[32mFinished successfully.\x1b[0m Time taken');
    }
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
                dictionary = JSON.parse(res);
                // Map dictionary name to all entries of the dictionary:
                dictionary = dictionary.map(function (entry) {
                    entry.dictionary = source.dictionaryName;
                    return entry;
                });
                // Append dictionary to the assembly:
                assembly = assembly.concat(dictionary);
            }

            // Check if all sources have been processed:
            if (pending) { return; }

            // At this point all sources have been processed:
            if (errors.length > 0) {
                callback(errors);
            } else {
                // Write the result to the destination file:
                fs.writeFile(settings.destinationFilePath,
                    JSON.stringify(assembly), 'utf8', callback);
            }
        });
    });
}

function performConversion(settings) {
    convert(settings, function (err) {
        // Do not proceed in case of an error:
        if (err) { return done(err); }

        fs.readFile(assemblySettingsFile, function (err, res) {
            // Do not proceed in case of an error:
            if (err) { return done(err); }

            // Attempt to assemble all available dictionaries
            // into a single one:
            assemble(JSON.parse(res), done);
        });
    });
}

// Begin the program by asynchronously reading the entire options file into
// memory and applying it to the convertor:
fs.readFile(kanjidicSettingsFile, 'utf8', function (err, res) {

    var settings;

    // Do not proceed if there's an error reading the file:
    if (err) { return done(err); }

    settings = JSON.parse(res);

    util.print('Requesting kanjidic file from remote server... ');
    http.get(settings.remoteFile, function (res) {
        var statusCode = res.statusCode;
        if (statusCode >= 200 && statusCode < 300) {
            util.print('done.\nPiping... ');
            iconv.stdout.pipe(fs.createWriteStream(settings.sourceFile))
                .on('close', function () {
                    util.print('done.\n');
                    performConversion(settings);
                });
            res.pipe(zlib.createGunzip()).pipe(iconv.stdin);
        } else {
            util.print('failed (' + statusCode + ').\n');
            // console.log('Attempting previously downloaded file instead...');
            performConversion(settings);
        }
    }).on('error', done);

});