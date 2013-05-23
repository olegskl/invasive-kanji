/*jslint browser: true */
/*globals chrome */

(function (document, extension) {
    'use strict';

    var frame = document.createElement('iframe'),
        frameStyleElement = document.createElement('link'),
        frameSrc = extension.getURL('framecontent.html'),
        frameStyleHref = chrome.extension.getURL('contentstyle.css'),
        documentVisibilityChangeEventName = 'visibilitychange',
        documentHiddenProperty = 'hidden',
        activeElement,
        extensionId = chrome.i18n.getMessage('@@extension_id'),
        extensionBaseURL = 'chrome-extension://' + extensionId,
        transitionEventName = 'webkitTransitionEnd';

    /**
     * Noop does nothing.
     * @return {Undefined} Returns nothing.
     */
    function noop() {}

    /**
     * Assigns an event handler that is only executed once.
     * @param {Object}   subject     An observervable subject.
     * @param {String}   eventName    Event name.
     * @param {Function} eventHandler The event handler function.
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
     * Restores the previously-stolen focus.
     * @return {Undefined}
     */
    function restoreFocus() {
        if (activeElement) {
            activeElement.focus();
            activeElement = null;
        }
    }

    /**
     * Removes the frame and its styling from the DOM.
     * @return {Undefined}
     */
    function removeFrame() {
        if (frameStyleElement && frameStyleElement.remove) {
            frameStyleElement.remove();
        }
        if (frame && frame.remove) {
            frame.remove();
        }
        frameStyleElement = null;
        frame = null;
    }

    /**
     * Changes the opacity settings of the frame to make it appear transparent.
     * @param  {Object}   element  A DOM element to make hidden.
     * @param  {callback} callback Called when the transition is finished.
     * @return {Undefined}
     */
    function setOpacity(element, opacity, callback) {
        // Cache current element opacity to avoid round trips to the DOM:
        var currentOpacity = element.style.opacity;

        // Undefined or zero opacity should trigger callback immediately:
        if (currentOpacity === opacity || (opacity === 0 && !currentOpacity)) {
            callback({error: null});
        } else {
            addEventHandlerCalledOnce(element, transitionEventName, callback);
            setTimeout(function () {
                element.style.opacity = opacity;
            }, 1);
        }
    }

    /**
     * Allows the user to proceed to the page by removing the cover frame.
     * @return {Undefined}
     */
    function proceedToPage() {
        restoreFocus();
        setOpacity(frame, 0, removeFrame);
    }

    /**
     * Handles changes of document visibility state.
     * @return {Undefined}
     */
    function documentVisibilityChangeHandler() {
        // Don't do anything if the document is hidden:
        if (document[documentHiddenProperty]) { return; }
        // No need to ask again on the next document visibility change:
        document.removeEventListener(documentVisibilityChangeEventName,
                documentVisibilityChangeHandler);
        // It is now safe to ask the question:
        document.body.appendChild(frame);
    }

    /**
     * Handles messages obtained through Message Passing mechanism.
     * @param  {Object}   request  Request object.
     * @param  {Object}   sender   Sender object.
     * @param  [Function] callback Optional callback.
     * @return {Boolean}           Always returns true to please Chrome.
     */
    function messageHandler(request, sender, callback) {
        // Callback is optional, but it's best to define it as a function once
        // to avoid multiple checks later:
        if (typeof callback !== 'function') {
            callback = noop;
        }

        if (request.makeFrameVisible) {

            setOpacity(frame, 1, callback);

        } else if (request.proceedToPage) {

            proceedToPage();

        } else if (request.storeFocus) {

            activeElement = document.activeElement;

            if (!activeElement) {
                callback({error: null, nothingHasFocus: true});
            } else if (activeElement.nodeName === 'IFRAME' &&
                    activeElement.src.indexOf(extensionBaseURL) === 0) {
                callback({error: null, extensionHasFocus: true});
            } else {
                callback({error: null});
            }

        }

        return true;
    }

    // Avoid troubles with framesets by working with body only:
    if (document.body.nodeName !== 'BODY') { return; }

    // Inject the frame styles programmatically in order to avoid flickering:
    frameStyleElement.href = frameStyleHref;
    frameStyleElement.rel = 'stylesheet';
    document.getElementsByTagName('head')[0].appendChild(frameStyleElement);

    // Set up the listener first to ensure all messages are received:
    extension.onMessage.addListener(messageHandler);

    // Configure the frame:
    frame.id = 'extension-invasive-kanji-coversheet';
    frame.src = extension.getURL('framecontent.html');

    // Vendor prefixes for document visibility api:
    if (document.hidden === undefined) {
        documentVisibilityChangeEventName = 'webkitvisibilitychange';
        documentHiddenProperty = 'webkitHidden';
    }

    // We should wait for the document to become visible before asking the
    // question, otherwise the user won't be able to timely answer it:
    if (document[documentHiddenProperty]) {
        document.addEventListener(documentVisibilityChangeEventName,
                documentVisibilityChangeHandler);
    } else {
        document.body.appendChild(frame);
    }

}(document, chrome.extension));