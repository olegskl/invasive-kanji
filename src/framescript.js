/*jslint browser: true */
/*globals chrome */

(function (document, extension) {
    'use strict';

    var questionElement = document.getElementById('question'),
        answerElement = document.getElementById('answer'),
        readingsElement = document.getElementById('readings'),
        answerSeparator = /\s*\,\s*/,
        isArray = Array.isArray,
        redirectionURL = {
            kanji: 'http://jisho.org/kanji/details/{q}',
            hiragana: 'http://en.wikipedia.org/wiki/{q}',
            katakana: 'http://en.wikipedia.org/wiki/{q}'
        },
        maxTheftCountAllowed = 3,
        focusTheftCount = 0,
        currentQuestion,
        timer,
        timerDuration = 10000;

    /**
     * Noop does nothing.
     * @return {Undefined} Returns nothing.
     */
    function noop() {}

    /**
     * Parses the answer string and converts it into an array.
     * @param  {String}     answer The answer provided by user.
     * @return {Array|Null}        An array of answer parts or null if error.
     */
    function parseAnswer(answer) {
        return (typeof answer === 'string')
            ? answer.trim().toLowerCase().split(answerSeparator)
            : null;
    }

    /**
     * Validates a given answer for correctness.
     * 
     * The provided answer may span multiple categories IN THE FUTURE;
     * e.g. the user has provided a list of readings and meanings in his/her
     * answer to a given question.
     * 
     * @param  {Array}   userAnswers Answers provided by user.
     * @return {Boolean}             TRUE when all answer sets are correct.
     */
    function isCorrectAnswer(userAnswers) {
        var correctAnswers = currentQuestion.meanings ||
                currentQuestion.readings;
        return userAnswers.every(function (userAnswer) {
            return correctAnswers.indexOf(userAnswer) !== -1;
        });
    }

    function proceedToPage() {
        clearTimeout(timer);
        timer = null;
        extension.sendMessage({proceedToPage: true});
    }

    /**
     * Steals focus from another element and assigns it to the answer element.
     * @param {Function} callback Callback executed on successful focus theft.
     * @return {Undefined}
     */
    function stealFocus(callback) {
        // Callback might be an event object:
        if (typeof callback !== 'function') {
            callback = noop;
        }
        // Notify the background script that we would like to have focus back,
        // and when the theft is authorized - perform it:
        extension.sendMessage({storeFocus: true}, function (response) {
            // Ensure the response is an object:
            if (!response) { response = {}; }

            if (response.nothingHasFocus) {
                // There's no other element that wants focus right now, so we
                // can safely assume it's not a theft:
                activeElement.focus();
                callback({error: null});
            } else if (response.extensionHasFocus) {
                // Avoid stealing from ourselves:
                callback({error: null});
            } else {
                // Keep count of how many times the focus has been stolen:
                focusTheftCount += 1;
                if (focusTheftCount > maxTheftCountAllowed) {
                    callback({error: 'Maximum focus theft limit exceeded.'});
                    proceedToPage();
                } else {
                    // Steal focus by setting it to the answer element:
                    answerElement.focus();
                    callback({error: null});
                }
            }
        });
    }

    /**
     * Returns an array of answers provided by the user.
     * @return {Array} An array of answers.
     */
    function getUserAnswer() {
        return parseAnswer(answerElement.value);
    }

    function performRedirect() {
        var url = redirectionURL[currentQuestion.dictionary],
            queryTerm = currentQuestion.term;
        // Redirection URL must be a String:
        if (typeof url !== 'string') {
            throw new TypeError('Unable to redirect. Invalid URL.');
        }
        // The query term is optional:
        if (typeof queryTerm === 'string') {
            url = url.replace('{q}', queryTerm);
        }
        extension.sendMessage({redirectTo: url});
    }

    function setTimer() {
        timer = setTimeout(function () {
            performRedirect();
        }, timerDuration);
    }

    /**
     * Handler for keypress events in any particular answer field.
     * @param  {Object}    event Event object.
     * @return {Undefined}
     */
    function keypressHandler(event) {
        // Only wait for the "enter" key to be pressed:
        if (event.which !== 13) { return; }

        // Clean up event handlers:
        window.removeEventListener('blur', stealFocus);
        answerElement.removeEventListener('keypress', keypressHandler);

        if (isCorrectAnswer(getUserAnswer())) {
            proceedToPage();
        } else {
            performRedirect();
        }
    }

    /**
     * Resets an answer input element.
     * @param  {Object}    element DOM element.
     * @return {Undefined}
     */
    function resetAnswerElement(element) {
        // Reset the value to prevent the browser being too helpful:
        element.value = '';

        window.addEventListener('blur', stealFocus);
        element.addEventListener('keypress', keypressHandler);
    }

    /**
     * Renders the question, assigns keypress handler, notifies the background.
     * @param {String}     question The question term to set.
     * @return {Undefined}
     */
    function setQuestion(question, callback) {
        // The question must be an object:
        if (!question || typeof question !== 'object') {
            callback({error: 'Invalid question object.'});
            return;
        }
        // Only accept non-empty strings for question term:
        if (typeof question.term !== 'string' || !question.term.length) {
            callback({error: 'Invalid question term.'});
            return;
        }

        // Render the question term inside of the question DOM element:
        questionElement.innerHTML = question.term;

        if (question.meanings && question.readings) {
            readingsElement.innerHTML = question.readings.join(', ');
        }

        // Temporary solution to store question in the scope of this script:
        // TODO: reconsider this approach!
        currentQuestion = question;

        // Ensure the answer element doesn't contain weird things and has
        // proper and bound event handlers for user interaction:
        resetAnswerElement(answerElement);

        // Temporary workaround to avoid asking for a hiragana/katakana meaning:
        answerElement.placeholder = (question.meanings)
            ? 'type the meaning...'
            : 'type the reading...';

        // Focus the cursor on the answer field:
        stealFocus(callback);
    }

    function onSetQuestion(response) {
        if (!response || response.error) {
            proceedToPage();
            return;
        }
        // Notify the background script that the question is visible to the
        // user so that the background script is able to set the timer:
        extension.sendMessage({makeFrameVisible: true}, function (response) {
            if (response && response.error) {
                proceedToPage();
            } else {
                setTimer();
            }
        });
    }

    /* -------------------------------- MAIN -------------------------------- */

    // Framescript doesn't accept any messages so we don't need to bind any
    // extension message listeners here.

    // Request a random dictionary entry from the background script:
    extension.sendMessage({entry: true}, function (response) {
        // Abort by requesting to proceed to page if background script fails to
        // deliver a valid dictionary entry:
        if (response && response.error) {
            proceedToPage();
        } else {
            setQuestion(response.entry, onSetQuestion);
        }
    });

}(document, chrome.extension));