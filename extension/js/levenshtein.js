/*jslint browser: true, unused: false */

/**
 * Compute weighted edit distance (Damerau-Levenshtein) between two words.
 * @param  {String} a Compared word.
 * @param  {String} b Reference word.
 * @return {Number}   The computed distance.
 */
function weightedEditDistance(a, b) {
    'use strict';

    var matrix = [], cost, i, j;

    // Initialize the matrix with doubled edit cost:
    for (i = 0; i <= a.length; i += 1) {
        matrix[i] = [i * 2];
    }
    for (i = 0; i <= b.length; i += 1) {
        matrix[0][i] = i * 2;
    }

    for (i = 1; i <= a.length; i += 1) {
        for (j = 1; j <= b.length; j += 1) {
            cost = (a[i - 1] === b[j - 1]) ? 0 : 1;
            matrix[i][j] = (i > 1 && j > 1 &&
                    (a[i - 1] === b[j - 2]) && (a[i - 2] === b[j - 1])) ?
                Math.min(
                    matrix[i - 1][j] + 2, // deletion
                    matrix[i][j - 1] + 2, // insertion
                    matrix[i - 1][j - 1] + cost * 2, // substitution
                    matrix[i - 2][j - 2] + cost // transposition
                ) :
                Math.min(
                    matrix[i - 1][j] + 2, // deletion
                    matrix[i][j - 1] + 2, // insertion
                    matrix[i - 1][j - 1] + cost * 2 // substitution
                );
        }
    }

    return matrix[a.length][b.length];
}