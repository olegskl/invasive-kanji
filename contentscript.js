/*jslint browser: true */
/*globals kanjilist  */

'use strict';

var redirectionURL = 'http://jisho.org/kanji/details/{q}',
    coverElement = document.createElement('div'),
    answerElement,
    docVisibilityChange = 'visibilitychange',
    docHidden = 'hidden',
    template = '<div id="extension-invasive-kanji-question">{q}</div>' +
        '<input type="text" id="extension-invasive-kanji-answer" placeholder=' +
        '"type the meaning...">';

// Document Hidden API vendor prefixes, urghhh...
if (document.hidden === undefined) {
    docVisibilityChange = 'webkitvisibilitychange';
    docHidden = 'webkitHidden';
}

function parseAnswer(answer) {
    return answer.trim().split(/\s*\,\s*/);
}

function areCorrectAnswers(userAnswers, correctAnswers) {
    return userAnswers.every(function (userAnswer) {
        return correctAnswers.indexOf(userAnswer) !== -1;
    });
}

function removeCover() {
    coverElement.parentNode.removeChild(coverElement);
}

function continueToPage() {
    // Trigger CSS animation by resetting opacity to zero:
    coverElement.style.opacity = '0';
    // Listen to the animation events and when the animation ends, remove the
    // cover element to give access to the underlying content:
    coverElement.addEventListener('webkitTransitionEnd', removeCover);
}

function performRedirect(queryTerm) {
    window.location = redirectionURL.replace('{q}', queryTerm);
}

function askQuestion(question, correctAnswers) {
    var timer;

    // Avoid troubles with framesets by working with body only:
    if (document.body.nodeName !== 'BODY') { return; }

    coverElement.id = 'extension-invasive-kanji-cover';
    coverElement.innerHTML = template.replace('{q}', question);

    document.body.appendChild(coverElement);

    answerElement = document.getElementById('extension-invasive-kanji-answer');
    answerElement.focus();

    answerElement.addEventListener('keypress', function (e) {
        // Only wait for the "enter" key to be pressed:
        if (e.which !== 13) { return; }
        // The timer is no longer required:
        clearTimeout(timer);
        // Take action based on the validity of the answer:
        if (areCorrectAnswers(parseAnswer(this.value), correctAnswers)) {
            continueToPage();
        } else {
            performRedirect(question);
        }
    });

    setTimeout(function () {
        // Trigger CSS animation by changing the opacity setting:
        coverElement.style.opacity = '1';
    }, 0);

    // Motivate user by enforcing a time limit:
    timer = setTimeout(function () {
        performRedirect(question);
    }, 10000);
}

function askRandomQuestion() {
    // Randomize the question:
    var entryIndex = Math.floor(Math.random() * kanjilist.length),
        entry = kanjilist[entryIndex];
    askQuestion(entry.kanji, entry.meanings);
}

function docVisibilityHandle() {
    // Don't do anything until the document is visible:
    if (document[docHidden]) { return; }
    // No need to ask again on the next document visibility change:
    document.removeEventListener(docVisibilityChange, docVisibilityHandle);
    // It is now safe to ask the question:
    askRandomQuestion();
}

if (document[docHidden]) {
    document.addEventListener(docVisibilityChange, docVisibilityHandle);
} else {
    askRandomQuestion();
}