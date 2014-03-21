/*jslint browser: true */
/*globals chrome */

(function (document, runtime) {
    'use strict';

    var frame = document.createElement('iframe'),
        frameStyleElement = document.createElement('link'),
        frameStyleHref = runtime.getURL('css/contentstyle.css'),
        documentVisibilityChangeEventName = 'visibilitychange',
        documentHiddenProperty = 'hidden',
        activeElement,
        extensionBaseURL = 'chrome-extension://' + runtime.id,
        frameTransitionDuration = 500;

    /**
     * The default noop function.
     * @return {Undefined}
     */
    function noop() {}

    /**
     * Attempts to restore the previously-stolen focus and clears reference.
     * @return {Undefined}
     */
    function restoreFocus() {
        if (activeElement) {
            activeElement.focus();
            activeElement = null;
        }
    }

    /**
     * Removes refs, event listeners, the frame and its styling from the DOM.
     * @return {Undefined}
     */
    function removeFrame() {
        // Document visibility change handler is no longer necessary once frame
        // has been removed:
        document.removeEventListener(documentVisibilityChangeEventName,
            documentVisibilityChangeHandler);

        // Remove the elements:
        if (frame && frame.remove) {
            frame.remove();
        }
        if (frameStyleElement && frameStyleElement.remove) {
            frameStyleElement.remove();
        }

        // Clean up references:
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
            setTimeout(function () {
                element.style.opacity = opacity;
            }, 1);
            setTimeout(callback, frameTransitionDuration);
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

        // Document may change visibility multiple times:
        if (!frame.parentNode) {
            // It is now safe to ask the question:
            document.body.appendChild(frame);
        }

        // ------------------------------ <HACK> -------------------------------
        // A hack to keep in touch with the background page and ensure it is not
        // in a disabled state, in which case a cleanup is required. At this
        // moment the Chrome Extension API does not provide a more robust
        // workaround (mind that this hack fails for already open pages...);
        // see: https://code.google.com/p/chromium/issues/detail?id=19383
        try {
            // Background doesn't need to reply here:
            runtime.sendMessage('ping');
        } catch (e) {
            // Cannot use proceedToPage function here because it will try to
            // send the restoreFocus request which will fail with an error:
            removeFrame();
        }
        // ----------------------------- </HACK> -------------------------------
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

        if (request === 'frameVisibilityRequest') {

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

    /* -------------------------------- MAIN -------------------------------- */

    // Avoid troubles with framesets by working with body only:
    if (document.body.nodeName !== 'BODY') { return; }

    // Inject the frame styles programmatically in order to avoid flickering:
    frameStyleElement.href = frameStyleHref;
    frameStyleElement.rel = 'stylesheet';
    document.querySelector('head').appendChild(frameStyleElement);

    // Set up the listener first to ensure all messages are received:
    runtime.onMessage.addListener(messageHandler);

    // Configure the frame:
    frame.id = 'extension-invasive-kanji-coversheet';
    frame.src = runtime.getURL('framecontent.html');
    // Explicitly set border width to avoid flashing of the iframe:
    frame.style.borderWidth = 0;

    // Vendor prefixes for document visibility api:
    if (document.hidden === undefined) {
        documentVisibilityChangeEventName = 'webkitvisibilitychange';
        documentHiddenProperty = 'webkitHidden';
    }

    // We should wait for the document to become visible before asking the
    // question, otherwise the user won't be able to timely answer it:
    document.addEventListener(documentVisibilityChangeEventName,
        documentVisibilityChangeHandler);
    if (!document[documentHiddenProperty]) {
        document.body.appendChild(frame);
    }

}(document, chrome.runtime));