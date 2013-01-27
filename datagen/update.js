/*jslint node: true */

'use strict';

var sourceFile = './kanjidic',
    destFile = './kanjilist.js',
    parse = require('./parser.js');

parse(sourceFile, destFile, function (err, res) {
    console.log('done');
});