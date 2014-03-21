/*jslint browser: true, devel: true */
/*globals chrome, addEventHandlerCalledOnce, weightedEditDistance */

// -------------------------- Step-by-step procedure ---------------------------
// 1. Request a random dictionary entry from the background page;
// 2. Construct the question GUI;
// 3. Steal the focus;
// 4. Issue a request to make the frame visible;
// 5. Wait for the frame to become visible;
// 6. Start the timer;
// 7. Wait for the user to answer the question;
// 8. Stop the timer;
// 9. If user answered correctly proceed to the page and request a cleanup;
// 10. Display the correct answer;
// 11. Request another random dictionary entry from the backround page;
// 12. Construct another question's GUI off screen;
// 13. Wait for the user's request to proceed;
// 14. Transition the GUI to the screen;
// 15. Goto #6.

(function (document, runtime) {
    'use strict';

    var kanjiLookupURL = 'http://jisho.org/kanji/details/%s',
        wrapper = document.body,
        questions = [], // list of questions to be asked
        currentQuestion,
        infoElement = document.getElementById('info'),
        timerElement = document.getElementById('timer'),
        answerSeparator = /\s*\,\s*/,
        maxTheftCountAllowed = 3,
        focusTheftCount = 0,
        timer,
        timerDuration = 10000,
        containerTransitionDuration = 250;

    /**
     * Noop does nothing.
     * @return {Undefined} Returns nothing.
     */
    function noop() {}

    /**
     * Logs to console a message prefixed with the extension name.
     * @return {Undefined}
     */
    function log() {
        var args = Array.prototype.slice.call(arguments);
        args.unshift('Invasive Kanji Extension:');
        console.log.apply(console, args);
    }

    /**
     * Hides a DOM element allowing CSS transitions.
     * @param  {DOMElement} element DOM element to hide.
     * @return {Undefined}
     */
    function hide(element) {
        setTimeout(function () {
            element.style.opacity = 0;
        }, 1);
    }

    /**
     * Clears the ticking timer (if any) and cleans-up references.
     * @return {Undefined}
     */
    function clearTimer() {
        // Stop the ticking:
        clearTimeout(timer);
        // Clear the timer reference:
        timer = null;
        // Reset the timer indicator to its original state (see relevant css):
        timerElement.classList.remove('timedOut');
    }

    /**
     * Terminates this script's lifetime.
     * @return {Undefined}
     */
    function proceedToPage() {
        // No need for timer at this point anymore:
        clearTimer();
        // No need for the blur listener anymore:
        window.removeEventListener('blur', stealFocus);
        // Because this code runs in an iframe that has a different domain than
        // the actual page, we need to delegate the removal of the iframe to
        // the contentscript (via background page):
        runtime.sendMessage({proceedToPage: true});
    }

    /**
     * Asynchronously requests a dictionary entry from the background script.
     * @param  {Function}  callback Callback with a response argument.
     * @return {Undefined}
     */
    function requestRandomDictionaryEntry(callback) {
        runtime.sendMessage('randomDictionaryEntryRequest', callback);
    }

    /**
     * Asynchronously requests frame visibility from contentscript.
     * @param  {Function} callback Callback with a response argument.
     * @return {Undefined}
     */
    function requestFrameVisibility(callback) {
        runtime.sendMessage('frameVisibilityRequest', callback);
    }

    // The stupid stealFocus function should probably be broken down in two,
    // one for the blur event listener, the other - for manual invocation.

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
        runtime.sendMessage({storeFocus: true}, function (response) {
            // Ensure the response is an object:
            if (!response) { response = {}; }

            if (response.nothingHasFocus) {
                // There's no other element that wants focus right now, so we
                // can safely assume it's not a theft:
                currentQuestion.nodes.answerElement.focus();
                callback({error: null});
                return;
            }
            if (response.extensionHasFocus) {
                // Avoid stealing from ourselves:
                callback({error: null});
                return;
            }
            // Keep count of how many times the focus has been stolen:
            focusTheftCount += 1;
            if (focusTheftCount > maxTheftCountAllowed) {
                callback({error: 'Maximum focus theft limit exceeded.'});
                proceedToPage();
            } else {
                // Steal focus by setting it to the answer element,
                // attempt to ensure focus by delaying the :
                currentQuestion.nodes.answerElement.blur();
                setTimeout(function () {
                    currentQuestion.nodes.answerElement.focus();
                    callback({error: null});
                }, 1);
            }
        });
    }

    /**
     * Parses the answer string and converts it into an array.
     * @param  {String}     answer The answer provided by user.
     * @return {Array|Null}        An array of answer parts or null if error.
     */
    function parseAnswer(answer) {
        return (typeof answer === 'string') ?
            answer.trim().toLowerCase().split(answerSeparator) :
            null;
    }

    /**
     * Returns an array of answers provided by the user.
     * @return {Array} An array of answers.
     */
    function getUserAnswers() {
        return parseAnswer(currentQuestion.nodes.answerElement.value);
    }

    /**
     * Returns an array of correct answers for a given question.
     * @return {Array} An array of correct answers.
     */
    function getCorrectAnswers(question) {
        // Correct answers may be meanings or readings depending on the
        // dictionary in use. Instead of hard-coding the dictionary names in
        // this function, use duck-typing and give priority to meanings.
        return question.meanings || question.readings || [];
    }

    /**
     * Simplifies an answer by removing extraneous information in brackets.
     * @example
     *     simplifyCorrectAnswer(" whitespace "); // "whitespace"
     *     simplifyCorrectAnswer("a unit"); // "unit"
     *     simplifyCorrectAnswer("the government"); // "government"
     *     simplifyCorrectAnswer("take a seat"); // "take a seat" - no change
     *     simplifyCorrectAnswer("fetch the ball"); // "fetch the ball"
     *     simplifyCorrectAnswer("second (1/60 minute)"); // "second"
     *     simplifyCorrectAnswer("a second (1/60 minute)"); // "second"
     *     simplifyCorrectAnswer("(used phonetically)"); // ""
     * @param  {String} answer Any singular answer.
     * @return {String}        Simplified answer.
     */
    function simplifyCorrectAnswer(answer) {
        return answer.trim() // trim any extra white space: " abc " -> "abc"
            .replace(/^a |^the /, '') // strip articles in the beginning
            .replace(/ ?\(.*\)/g, '') // strip brackets and their contents
            .trim(); // extra trim to catch edge cases
    }

    /**
     * Answer reducer function for getUserFriendlyCorrectAnswers function.
     * @param  {Array}  result Resulting array.
     * @param  {String} answer An non-user-friendly answer.
     * @return {Array}         Updated resulting array.
     */
    function userFriendlyAnswerReducer(result, answer) {
        var simplifiedAnswer;
        // Ensure all answers are lowercase:
        answer = answer.toLowerCase();
        // Add unmodified answer to the result so that it is still possible to
        // answer in non-user-friendly fashion, e.g. "second (1/60 minute)":
        result.push(answer);
        // Now simplify the answer, e.g. "second (1/60 minute)" => "second":
        simplifiedAnswer = simplifyCorrectAnswer(answer);
        // Add the simplified version to the answer list if it's different from
        // the original answer, so that the user can answer both as "second" and
        // "second (1/60 minute)" to a question with "second (1/60 minute)"
        // answer:
        if (simplifiedAnswer && simplifiedAnswer !== answer) {
            result.push(simplifiedAnswer);
        }
        return result;
    }

    /**
     * Computes user-friendly answers for a given question.
     * @param  {Object} question A question object.
     * @return {Array}           An array of answers.
     */
    function getUserFriendlyCorrectAnswers(question) {
        return getCorrectAnswers(question)
            .reduce(userFriendlyAnswerReducer, []);
    }

    /**
     * Computes a levenshtein distance tolerance for a given word.
     * @param  {String} word Word for which the distance tolerance is computed.
     * @return {Number}      Tolerated distance.
     */
    function distanceTolerance(word) {
        return (word.length > 2) ?
            Math.floor(Math.pow(word.length, 1 / 3)) :
            0;
    }

    /**
     * Validates a given answer for correctness with adjustment for typos.
     * @param  {String}  userAnswer    Answer provided by the user.
     * @param  {String}  correctAnswer Correct answer from the dictionary.
     * @return {Boolean}               TRUE if correct even if typos are present
     */
    function isCorrectAnswer(userAnswer, correctAnswer) {
        return (userAnswer === correctAnswer) ||
            (weightedEditDistance(userAnswer, correctAnswer) <=
                distanceTolerance(correctAnswer));
    }

    /**
     * Validates a given set of answers for correctness.
     * @param  {Array}   userAnswers    Answers provided by user.
     * @param  {Array}   correctAnswers Correct answers from the dictionary.
     * @return {Boolean} TRUE if the entire answer set is correct.
     */
    function areCorrectAnswers(userAnswers, correctAnswers) {
        // Every item in the answer set provided by user must be correct:
        return userAnswers.every(function (userAnswer) {
            return correctAnswers.some(function (correctAnswer) {
                return isCorrectAnswer(userAnswer, correctAnswer);
            });
        });
    }

    /**
     * (Re)sets the question timer.
     * @return {Undefined}
     */
    function setTimer() {
        // Always clear the timer before setting it to avoid multiple timers
        // working in parallel:
        clearTimer();
        // When timer times out it means that the user has run out of time and
        // failed to answer the question; thus we invoke wrong answer handler
        // on timer completion:
        timer = setTimeout(handleIncorrectAnswer, timerDuration);
        // Initialize the timer indicator transition (see relevant css):
        timerElement.classList.add('timedOut');
    }

    /**
     * Removes a question from the question pool.
     * @param  {Number} questionIndex Index of a question to remove.
     * @return {Undefined}
     */
    function removeQuestion(questionIndex) {
        var question = questions[questionIndex],
            nodeKey;

        if (!question || !question.nodes) { return; }

        // 1. Remove event handlers:
        question.nodes.answerElement.removeEventListener(keypressHandler);
        // 2. Remove the elements themselves from the DOM:
        question.nodes.container.remove();
        question.nodes.container.innerHTML = '';
        // 3. Destroy references to DOM elements:
        for (nodeKey in question.nodes) {
            if (question.nodes.hasOwnProperty(nodeKey)) {
                delete question.nodes[nodeKey];
            }
        }
        delete question.nodes;
        // 4. Remove the question:
        questions.splice(questionIndex, 1);
    }

    /**
     * Handles the end of container transition by focusing on the answer field,
     * removing the previous question and setting the timer.
     * @return {Undefined}
     */
    function containerTransitionEndHandler() {
        // Focus the answer element only when the transition has ended,
        // otherwise expect unexpected behavior:
        currentQuestion.nodes.answerElement.focus();
        // Remove the previous question:
        removeQuestion(0);
        // The transition has finished and the previous question has
        // been removed so it is now safe to start the timer:
        setTimer();
    }

    /**
     * Advances exam to the next available question and removes the current one.
     * @return {Undefined}
     */
    function nextQuestion() {
        // Attempt to grab a reference to the next available question which is
        // always at index 1 in the array:
        var question = questions[1],
            container;

        // We should proceed to the page when we run out of questions:
        if (!question) {
            proceedToPage();
            return;
        }

        // Reset the focus theft counter:
        focusTheftCount = 0;

        // Shortcut to the question container:
        container = question.nodes.container;

        setupAnswerElement(question.nodes.answerElement);

        // Hide the current question to avoid overlap:
        hide(currentQuestion.nodes.container);

        // Keep a reference to the question as current:
        // (mind that we need to do it before re)
        currentQuestion = question;

        // Set up a handler for transition end of the container:
        setTimeout(containerTransitionEndHandler, containerTransitionDuration);

        // Clear the timer so that it doesn't kick in during transition:
        clearTimer();

        // We now want the container to become visible, so removing "offscreen"
        // class is necessary:
        container.classList.remove('offscreen');
    }

    /**
     * Constructs question structure.
     * @param  {Boolean} isOffScreen Whether to render on or off screen.
     * @return {Object}              An object containing DOM nodes.
     */
    function buildQuestionStructure(isOffScreen) {
        var nodes = {
                container: document.createElement('div'),
                questionElement: document.createElement('a'),
                answerElement: document.createElement('input'),
                correctAnswerElement: document.createElement('div'),
                readingsElement: document.createElement('div')
            };

        // Set more styles before appending:
        nodes.questionElement.className = 'question';
        nodes.answerElement.className = 'answer';
        nodes.readingsElement.className = 'readings';

        // When adding a first question, it is added directly on page and event
        // handlers are assigned; otherwise, the question is created off screen
        // and doesn't respond to user activity until necessary:
        if (isOffScreen) {
            nodes.container.className = 'container offscreen';
            nodes.correctAnswerElement.className = 'correctAnswer hidden';
        } else {
            nodes.answerElement.addEventListener('keypress', keypressHandler);
            nodes.container.className = 'container';
            nodes.correctAnswerElement.className = 'correctAnswer';
        }

        nodes.container.appendChild(nodes.questionElement);
        nodes.container.appendChild(nodes.answerElement);
        nodes.container.appendChild(nodes.correctAnswerElement);
        nodes.container.appendChild(nodes.readingsElement);

        return nodes;
    }

    /**
     * Configures the given question element according to the given question.
     * @param  {NodeElement} element  The element to setup.
     * @param  {Object}      question A question to use for setup.
     * @return {Undefined}
     */
    function setupQuestionElement(element, question) {
        // Render the question term inside of the question's DOM element:
        element.textContent = question.term;

        if (question.dictionary === 'kanji') {
            // External links must open in a new tab, otherwise they won't be
            // visible because the frame is covering the page:
            element.target = '_blank';

            // Ensure that the href attribute is properly encoded:
            element.href = kanjiLookupURL
                .replace('%s', encodeURIComponent(question.term));

            // Prevent cheating by launching the answer check on link click:
            addEventHandlerCalledOnce(element, 'click', handleAnswer);
        }
    }

    /**
     * Adds an additional question to the current question pool.
     * @param {Object} question The question object.
     * @return {Undefined}
     */
    function addQuestion(question, callback) {
        var isFirstQuestion = !questions.length,
            nodes;

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

        // Create essential elements of the question GUI and keep references
        // to various elements of the question GUI:
        nodes = question.nodes = buildQuestionStructure(!isFirstQuestion);

        // A workaround to avoid asking for hiragana/katakana meanings:
        nodes.answerElement.placeholder = (question.meanings) ?
            'type the meaning...' :
            'type the reading...';

        // When both the readings and the meanings are provided, it is implied
        // that we need to hint readings and not display meanings at all,
        // otherwise it would be answering the question itself:
        if (question.meanings && question.readings) {
            nodes.readingsElement.textContent = question.readings.join(', ');
        }

        // The actual question text, event handlers, etc.:
        setupQuestionElement(nodes.questionElement, question);

        // Add the question structure to the document:
        wrapper.appendChild(question.nodes.container);

        // Add the question to the question pool to keep track of all questions
        // that have been added:
        questions.push(question);

        if (isFirstQuestion) {
            currentQuestion = question;
            // Request focus of the cursor on the answer field:
            stealFocus(callback);
        } else {
            callback({error: null});
        }
    }

    /**
     * A function to call when the user submits a correct answer.
     * @return {Undefined}
     */
    function handleCorrectAnswer() {
        // The exam is finished at this point:
        proceedToPage();
    }

    /**
     * An event handler for advancing to the next question on enter key press.
     * @param  {Object} e Event object.
     * @return {Undefined}
     */
    function nextQuestionOnEnterKey(e) {
        if (e.which !== 13) { return; }
        // No need for event listener anymore:
        wrapper.removeEventListener('keypress', nextQuestionOnEnterKey);
        setTimeout(function () {
            infoElement.style.opacity = 0;
        }, 1);
        nextQuestion();
    }

    /**
     * A function to call when the user submits an incorrect answer.
     * @return {Undefined}
     */
    function handleIncorrectAnswer() {
        var answerElement = currentQuestion.nodes.answerElement,
            correctAnswerElement = currentQuestion.nodes.correctAnswerElement;

        clearTimer();

        // We no longer need the answer element:
        answerElement.remove();

        // Modify styling of the question term to inform the user that (s)he's
        // answered the question incorrectly:
        // questionElement.classList.add('incorrect');

        // Display correct answer:
        correctAnswerElement.textContent = (currentQuestion.meanings) ?
            currentQuestion.meanings.join(', ') :
            currentQuestion.readings.join(', ');

        setTimeout(function () {
            infoElement.style.opacity = 1;
        }, 1);

        // While the user is looking at the correct answer, silently request
        // a new dictionary entry:
        requestRandomDictionaryEntry(function (response) {
            // If we receive a correct response from the dictionary handler
            // represented here by the background page, then we add a new
            // question that the user will have to answer. Otherwise we let him
            // or her proceed to the page.
            if (!response || response.error) {
                // On any key pressed - proceed to the page:
                addEventHandlerCalledOnce(wrapper, 'keypress', proceedToPage);
                return;
            }
            // Add the received dictionary entry as the new question:
            addQuestion(response.entry, function () {
                // On <enter> key pressed - advance to the next question:
                wrapper.addEventListener('keypress', nextQuestionOnEnterKey);
            });
        });
    }

    /**
     * Determines if the user has answered a question correctly.
     * @param  {Object}  question A question to validate.
     * @return {Boolean}          True on correct answer, false otherwise.
     */
    function userAnsweredCorrectly(question) {
        var userAnswers = getUserAnswers(),
            correctAnswers = getUserFriendlyCorrectAnswers(question);
        return areCorrectAnswers(userAnswers, correctAnswers);
    }

    /**
     * Handles user answer for the current question.
     * @return {Undefined}
     */
    function handleAnswer() {
        // Clean up event handlers:
        window.removeEventListener('blur', stealFocus);
        currentQuestion.nodes.answerElement
            .removeEventListener('keypress', keypressHandler);

        // Decide what to do next:
        if (userAnsweredCorrectly(currentQuestion)) {
            handleCorrectAnswer();
        } else {
            handleIncorrectAnswer();
        }
    }

    /**
     * Handler for keypress events in any particular answer field.
     * @param  {Object}    event Event object.
     * @return {Undefined}
     */
    function keypressHandler(event) {
        // Only wait for the "enter" key to be pressed:
        if (event.which === 13) {
            handleAnswer();
        }
    }

    /**
     * Resets an answer input element.
     * @param  {Object}    element DOM element.
     * @return {Undefined}
     */
    function setupAnswerElement(element) {
        // Reset the value to prevent the browser being too helpful:
        element.value = '';
        // Listen to keypress events:
        element.addEventListener('keypress', keypressHandler);
    }

    /* -------------------------------- MAIN -------------------------------- */

    // Framescript doesn't accept any messages so we don't need to bind any
    // extension message listeners here.

    window.addEventListener('blur', stealFocus);

    // === Step 1 ===
    // Request a random dictionary entry from the background script:
    requestRandomDictionaryEntry(function (response) {
        // If background script fails to deliver a valid dictionary entry, then
        // we abort the operation by issuing a request to proceed to page:
        if (!response || response.error) {
            log('Failed to request a dictionary entry.', response.error);
            proceedToPage();
            return;
        }
        // === Steps 2,3 ===
        // Attempt to add the first question:
        addQuestion(response.entry, function (response) {
            if (response && response.error) {
                log('Failed to add a question.', response.error);
                proceedToPage();
                return;
            }
            // === Steps 4,5 ===
            // Notify the background script that the question is visible to the
            // user so that the background script is able to set the timer:
            requestFrameVisibility(function (response) {
                if (response && response.error) {
                    log('Failed to request frame visibility.', response.error);
                    proceedToPage();
                } else {
                    // === Step 6 ===
                    setTimer();
                }
            });
        });

    });

}(document, chrome.runtime));