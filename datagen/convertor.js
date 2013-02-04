/*jslint node: true */

'use strict';

var fs = require('fs'), // filesystem
    utils = require('utils'), // utilities
    eol = /\r?\n/; // end-of-line marker regex

/**
 * Default callback.
 * @param  {Object} err Error object.
 * @return {Undefined}
 */
function defaultCallback(err) {
    console.error(err);
}

/**
 * Obtains a field value from a line of a kanjidic file.
 * @param  {String} identification Field identification character sequence.
 * @param  {String} line           Any line from the kanjidic file.
 * @return {String|Boolean}        Field value or Boolean FALSE on failure.
 */
function getField(identification, line) {
    var index = line.indexOf(identification),
        length = 0;
    if (index === -1) { return false; }
    index += identification.length;
    length = line.indexOf(' ', index);
    return line.substring(index, length);
}

/**
 * Obtains a "grade" field value from a given line of a kanjidic file.
 * @param  {String} line    Any line from the kanjidic file.
 * @return {Number|Boolean} The grade Number or Boolean FALSE on failure.
 */
function getGrade(line) {
    var grade = getField('G', line);
    return (grade)
        ? parseInt(grade, 10)
        : false;
}

/**
 * Transforms a kanjidic line into a JavaScript object.
 * @param  {String} line    Any line from the kanjidic file.
 * @param  [Object] options Options to apply while parsing the line.
 * @return {Object|Boolean} Object or Boolean FALSE on failure.
 */
function parseLine(line, options) {

    var grade, // placeholder for kanji grade
        meanings, // placeholder for a list of meanings for a given term
        index = 0; // search helper

    // Non-string "line" argument is unacceptable:
    if (typeof line !== 'string') {
        throw new TypeError('Expected "line" argument to be a String');
    }

    // The "options" argument that is passed but not as Object is unacceptable:
    if (arguments.length > 1 && typeof options !== 'object') {
        throw new TypeError('Expected "options" argument to be an Object');
    }

    // There's nothing wrong with not passing the "options" argument at all,
    // however "options" should exist at least as an empty placehodler:
    if (arguments.length === 1) {
        options = {};
    }

    // Trim any surrounding whitespace and the final EOL:
    line.trim();

    // Lines starting with "#" are comments, avoid them:
    if (line.substr(0, 1) === '#') {
        return false;
    }

    if (options.grades) {
        if (!utils.isArray(options.grades)) {
            throw new TypeError('Expected "grades" option to be an Array.');
        }
        grade = getGrade(line);
        if (!grade || options.grades.indexOf(grade) === -1) {
            return false;
        }
    }

    // Finally obtain the meanings:
    meanings = line.substring(line.indexOf('{') + 1, line.lastIndexOf('}'))
        .split('} {');

    return {
        kanji: line[0],
        grade: grade,
        meanings: meanings
    };
}

/**
 * Converts a source kanji dictionary file into a JavaScript array.
 * @param  {String}    sourceFile Kanji dictionary source file.
 * @param  {String}    destFile   JavaScript destination file.
 * @param  [Object]    options    Parsing options.
 * @param  [Function]  callback   Callback function.
 * @return {Undefined}
 */
module.exports = function (sourceFile, destFile, options, callback) {
    // An absence of the "options" argument is not critical,
    // however the options should exist as an Object even if it's empty:
    if (typeof options !== 'object') {
        options = {};
    }

    // An absence of the "callback" argument is not critical,
    // however the callback should exist as a Function even if it's a noop:
    if (typeof callback !== 'function') {
        callback = defaultCallback;
    }

    /**
     * Converts and writes a kanjidic bulk text into an JavaScript-ready file.
     * @param  {Object} err Error object.
     * @param  {String} res Kanjidic text contents.
     * @return {Undefined}
     */
    function convert(err, res) {
        // Placeholder Array for assembling the entries; once the assembly is
        // done, the variable type will be cast into String and written to file:
        var entries = [];

        // Do not proceed if there's an error reading the file:
        if (err) {
            return callback(err);
        }

        // Dead simple split of file by end-of-line marker:
        res.split(eol).forEach(function (line) {
            // Every single line represents a single entry in the dictionary:
            var entry = parseLine(line, options);
            // Some lines might be comments or corrupted, so avoid those:
            if (entry) {
                entries.push(entry);
            }
        });

        // To speed things up we create a ready-to-use JavaScript file
        // that will not require parsing JSON structure every time the
        // extension code is triggered:
        entries = 'var kanjilist = ' + JSON.stringify(entries) + ';';

        // Write the result to the destination file:
        fs.writeFile(destFile, entries, 'utf8', callback);
    }

    // Asynchronously read entire file into memory and perform conversion
    // of the contents:
    fs.readFile(sourceFile, 'utf8', convert);
};