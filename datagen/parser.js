/*jslint node: true */

'use strict';

var fs = require('fs');

function getField(identification, line) {
    var index = line.indexOf(identification),
        length = 0;
    if (index === -1) { return false; }
    index += identification.length;
    length = line.indexOf(' ', index);
    return line.substring(index, length);
}

/**
 * Transforms a kanjidic line into a JavaScript object.
 */

function parseLine(line) {

    var grade,
        rank,
        meanings,
        index = 0; // search helper

    if (typeof line !== 'string') {
        return false;
    }

    // Trim any surrounding whitespace and the final EOL:
    line.trim();

    // Do not parse comments:
    if (line.substr(0, 1) === '#') {
        return false;
    }

    // Split the line into segments:
    // line = line.split(/\s/);

    // First obtain the grade:
    grade = getField('G', line);

    if (!grade) { return false; }
    grade = parseInt(grade, 10);
    if (grade > 3) { return false; }

    // Obtain the frequency rank:
    rank = getField('F', line);

    if (!rank) { return false; }
    rank = parseInt(rank, 10);

    // Finally obtain the meanings:
    meanings = line.substring(line.indexOf('{') + 1, line.lastIndexOf('}'))
        .split('} {');

    return {
        kanji: line[0],
        grade: grade,
        rank: rank,
        meanings: meanings
    };
}

/**
 * 
 */

function errorHandler(err) {
    console.error(err);
}

/**
 * 
 */

module.exports = function (sourceFile, destFile, callback) {

    if (typeof callback !== 'function') {
        callback = function () {};
    }

    fs.readFile(sourceFile, 'utf8', function (err, res) {

        var entries = [];

        if (err) {
            callback(err);
            return;
        }

        res.split(/\r?\n/).forEach(function (line) {
            var entry = parseLine(line);
            if (entry) {
                entries.push(entry);
            }
        });

        entries = 'var kanjilist = ' + JSON.stringify(entries) + ';';

        // Write the result to the file:
        fs.writeFile(destFile, entries, 'utf8', callback);

    });
};