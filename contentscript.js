/*jslint browser: true */
/*globals kanjilist */

'use strict';

var redirectionURL = 'http://jisho.org/kanji/details/%s',
    entryIndex = Math.floor(Math.random() * kanjilist.length),
    entry = kanjilist[entryIndex],
    timer,
    coverElement = document.createElement('div'),
    answerElement,
    kanji = entry.kanji,
    html = '<div id="extension-invasive-kanji-question">' + kanji + '</div>' +
        '<input type="text" id="extension-invasive-kanji-answer" placeholder=' +
        '"type the meaning...">';

function isValidAnswer(answer) {
    return entry.meanings.indexOf(answer) !== -1;
}

function continueToPage() {
    // Trigger CSS animation by resetting opacity to zero:
    coverElement.style.opacity = '0';
    // Listen to the animation events and when the animation ends, remove the
    // cover element to give access to the underlying content:
    coverElement.addEventListener('webkitTransitionEnd', function () {
        coverElement.parentNode.removeChild(coverElement);
    }, true);
}

function performRedirect(queryTerm) {
    window.location = redirectionURL.replace('%s', queryTerm);
}

coverElement.id = 'extension-invasive-kanji-cover';
coverElement.innerHTML = html;

document.body.appendChild(coverElement);

answerElement = document.getElementById('extension-invasive-kanji-answer');
answerElement.focus();

answerElement.addEventListener('keypress', function (e) {
    // Waiting for the "enter" key:
    if (e.which === 13) {
        // The timer is no longer required:
        clearTimeout(timer);
        // Take action based on the validity of the answer:
        if (isValidAnswer(this.value)) {
            continueToPage();
        } else {
            performRedirect(entry.kanji);
        }
    }
});

// Trigger CSS animation by changing the opacity setting:
// (note that we should )
setTimeout(function () {
    coverElement.style.opacity = '1';
}, 0);

// Create motivation by enforcing a time limit:
timer = setTimeout(function () {
    performRedirect(entry.kanji);
}, 10000);