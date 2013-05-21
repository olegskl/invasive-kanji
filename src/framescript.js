/*jslint browser: true, devel: true */
/*globals chrome */

// -------------------------- Step-by-step procedure ---------------------------
// 1. Request a random dictionary entry from the background page;
// 2. Construct the question GUI;
// 3. Steal the focus;
// 4. Issue a request to make the frame visible;
// 5. Wait for the frame to become visible;
// 6. Start the timer;
// 7. Wait for the user to answer the question;
// 8. Stop the timer;
// 9. If user's answer is correct – proceed to the page and request a cleanup;
// 10. Display the correct answer;
// 11. Request another random dictionary entry from the backround page;
// 12. Construct another question's GUI off screen;
// 13. Wait for the user's request to proceed;
// 14. Transition the GUI to the screen;
// 15. Goto #6.

(function (document, extension) {
    'use strict';

    var wrapper = document.body,
        questions = [], // list of questions to be asked
        currentQuestion,
        infoElement = document.getElementById('informational'),
        answerSeparator = /\s*\,\s*/,
        isArray = Array.isArray,
        maxTheftCountAllowed = 3,
        focusTheftCount = 0,
        timer,
        timerDuration = 10000,
        transitionEventName = 'webkitTransitionEnd'; // vendor prefixes...

    /**
     * Noop does nothing.
     * @return {Undefined} Returns nothing.
     */
    function noop() {}

    /**
     * Assigns an event handler that is only executed once, then removed.
     * @param {Object}   subject      Observable subject.
     * @param {String}   eventName    Event name.
     * @param {Function} eventHandler Event handler.
     */
    function addEventHandlerCalledOnce(subject, eventName, eventHandler) {

        function eventHandlerCalledOnce() {
            // Unsubscribe self:
            subject.removeEventListener(eventName, eventHandlerCalledOnce);
            // This is going to happen only once:
            eventHandler();
        }

        // Validate subject for correctness to avoid cryptic error later:
        if (!subject || typeof subject !== 'object' ||
                typeof subject.addEventListener !== 'function') {
            throw new TypeError('Unable to assign a eventHandler called once.' +
                    ' Invalid subject object.');
        }
        // Event handler must be a function:
        if (typeof eventHandler !== 'function') {
            throw new TypeError('Unable to assign a eventHandler called once.' +
                    ' Callback must be a function.');
        }

        // It is now safe to add event eventHandler to the subject object:
        subject.addEventListener(eventName, eventHandlerCalledOnce);
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
        extension.sendMessage({proceedToPage: true});
    }

    /**
     * Asynchronously requests a dictionary entry and invokes a callback.
     * @param  {Function} callback Callback with a response argument.
     * @return {Undefined}
     */
    function requestRandomDictionaryEntry(callback) {
        // Request a random dictionary entry from the background script:
        extension.sendMessage({entry: true}, callback);
    }

    /**
     * Asynchronously requests frame visibility and invokes a callback.
     * @param  {Function} callback Callback with a response argument.
     * @return {Undefined}
     */
    function requestFrameVisibility(callback) {
        extension.sendMessage({makeFrameVisible: true}, callback);
    }

    // The stupid stealFocus function should be broken down in two...
    // One for blur event listener, the other - for manual invocation.

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
                currentQuestion.nodes.answerElement.focus();
                callback({error: null});
            } else if (response.extensionHasFocus) {
                // Avoid stealing from ourselves:
                callback({error: null});
            } else {
                // Keep count of how many times the focus has been stolen:
                focusTheftCount += 1;
                if (focusTheftCount > maxTheftCountAllowed) {
                    callback({error: 'Maximum focus theft limit exceeded.'});
                    // proceedToPage();
                } else {
                    // Steal focus by setting it to the answer element:
                    currentQuestion.nodes.answerElement.focus();
                    callback({error: null});
                }
            }
        });
    }

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
     * Returns an array of answers provided by the user.
     * @return {Array} An array of answers.
     */
    function getUserAnswer() {
        return parseAnswer(currentQuestion.nodes.answerElement.value);
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
            return (correctAnswers.indexOf(userAnswer) !== -1);
        });
    }

    function setTimer() {
        // Always clear the timer before setting it to avoid multiple timers
        // working in parallel:
        clearTimer();
        // When timer times out it means that the user has run out of time and
        // failed to answer the question; thus we invoke wrong answer handler
        // on timer completion:
        timer = setTimeout(handleIncorrectAnswer, timerDuration);
    }

    /**
     * Removes a question from the question pool.
     * @param  {Number} questionIndex Index of a question to remove.
     * @return {Undefined}
     */
    function removeQuestion(questionIndex) {
        var question = questions[questionIndex],
            nodeKey,
            nodes;

        if (!question || !question.nodes) { return; }

        // Just a shortcut:
        nodes = question.nodes;

        // 1. Remove event handlers:
        nodes.answerElement.removeEventListener(keypressHandler);
        // 2. Remove the elements themselves from the DOM:
        nodes.container.remove();
        nodes.container.innerHTML = '';
        // 3. Destroy references to DOM elements:
        for (nodeKey in nodes) {
            if (nodes.hasOwnProperty(nodeKey)) {
                delete nodes[nodeKey];
            }
        }
        nodes = null;
        delete question.nodes;
        // 4. Remove the question:
        questions.splice(questionIndex, 1);
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

        // ...
        currentQuestion = question;

        // Reset the focus theft counter:
        focusTheftCount = 0;

        // Shortcut to the question container:
        container = question.nodes.container;

        resetAnswerElement(question.nodes.answerElement);

        container.addEventListener(transitionEventName, function () {
            // Focus the answer element only when the transition has ended,
            // otherwise expect unexpected behavior:
            question.nodes.answerElement.focus();
            // Remove the previous question:
            removeQuestion(0);
            // The transition has finished and the previous question has
            // been removed so it is now safe to start the timer:
            setTimer();
        });

        // Clear the timer so that it doesn't kick in during transition:
        clearTimer();

        setTimeout(function () {
            container.classList.remove('offscreen');
        }, 1);
    }

    /**
     * Adds an additional question to the current question pool.
     * @param {Object} question The question object.
     * @return {Undefined}
     */
    function addQuestion(question, callback) {
        // Create essential elements of the question GUI:
        var container = document.createElement('div'),
            questionElement = document.createElement('div'),
            answerElement = document.createElement('input'),
            correctAnswerElement = document.createElement('div'),
            readingsElement = document.createElement('div'),
            isFirstQuestion = !questions.length;

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

        // When adding a first question, it is added directly on page and event
        // handlers are assigned; otherwise, the question is created off screen
        // and doesn't respond to user activity until necessary:
        if (isFirstQuestion) {
            currentQuestion = question;
            answerElement.addEventListener('keypress', keypressHandler);
            container.className = 'container';
            correctAnswerElement.className = 'correctAnswer';
        } else {
            container.className = 'container offscreen';
            correctAnswerElement.className = 'correctAnswer hidden';
        }

        // Temporary workaround to avoid asking for a hiragana/katakana meaning:
        answerElement.placeholder = (question.meanings)
            ? 'type the meaning...'
            : 'type the reading...';

        // Render the question term inside of the question's DOM element:
        questionElement.innerHTML = question.term;

        if (question.meanings && question.readings) {
            readingsElement.innerHTML = question.readings.join(', ');
        }

        // Set more styles before appending:
        questionElement.className = 'question';
        answerElement.className = 'answer';
        readingsElement.className = 'readings';

        container.appendChild(questionElement);
        container.appendChild(answerElement);
        container.appendChild(correctAnswerElement);
        container.appendChild(readingsElement);

        // Keep references to various elements of the question GUI:
        question.nodes = {
            container: container,
            questionElement: questionElement,
            answerElement: answerElement,
            correctAnswerElement: correctAnswerElement,
            readingsElement: readingsElement
        };

        wrapper.appendChild(container);

        // Finally add the question to the question pool to keep track of all
        // questions that have been added:
        questions.push(question);

        // Focus the cursor on the answer field:
        if (isFirstQuestion) {
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
        var questionElement = currentQuestion.nodes.questionElement,
            answerElement = currentQuestion.nodes.answerElement,
            correctAnswerElement = currentQuestion.nodes.correctAnswerElement;

        clearTimer();

        // We no longer need the answer element:
        answerElement.remove();

        // Modify styling of the question term to inform the user that (s)he's
        // answered the question incorrectly:
        // questionElement.classList.add('incorrect');

        // Display correct answer:
        correctAnswerElement.innerHTML = (currentQuestion.meanings)
            ? currentQuestion.meanings.join(', ')
            : currentQuestion.readings.join(', ');

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
            addQuestion(response.entry, function (response) {
                // On <enter> key pressed - advance to the next question:
                wrapper.addEventListener('keypress', nextQuestionOnEnterKey);
            });
        });
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
        // currentQuestion.nodes.answerElement
        event.target.removeEventListener('keypress', keypressHandler);

        if (isCorrectAnswer(getUserAnswer())) {
            handleCorrectAnswer();
        } else {
            handleIncorrectAnswer();
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
            console.log('Failed to request a dictionary entry. ' +
                response.error);
            proceedToPage();
            return;
        }
        // === Steps 2,3 ===
        // Attempt to add the first question:
        addQuestion(response.entry, function (response) {
            if (response && response.error) {
                console.log('Failed to add a question.');
                proceedToPage();
                return;
            }
            // === Steps 4,5 ===
            // Notify the background script that the question is visible to the
            // user so that the background script is able to set the timer:
            requestFrameVisibility(function (response) {
                if (response && response.error) {
                    console.log('Failed to request frame visibility.');
                    proceedToPage();
                } else {
                    // === Step 6 ===
                    setTimer();
                }
            });
        });

    });

}(document, chrome.extension));