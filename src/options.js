/*jslint browser: true, devel: true */
/*globals chrome */

(function (window, document, extension) {
    'use strict';

    var slice = Array.prototype.slice,
        isArray = Array.isArray,
        selector = 'input',
        inputElements = slice.call(document.querySelectorAll(selector));

    function displayError(error) {
        console.log(error);
    }

    function displaySuccess(message) {
        var options = document.getElementById('options');
        if (!options) {
            console.log(message);
            return;
        }
        options.style.removeProperty('-webkit-animation-name');
        setTimeout(function () {
            options.style.setProperty('-webkit-animation-name', 'confirmsave');
        }, 1);
    }

    /**
     * Obtains current user preferences from the background page.
     * @param  {Function} callback Callback with user preferences object.
     * @return {Undefined}
     */
    function loadUserPreferences(callback) {
        extension.sendMessage({userPreferences: true}, callback);
    }

    /**
     * Callback confirming user preferences saved.
     * @param  {Object|String} error       Error message.
     * @param  {[type]} preferences [description]
     * @return {[type]}             [description]
     */
    function confirmUserPreferencesSave(response) {
        if (response.error) {
            displayError(response.error);
        } else {
            displaySuccess('Preferences saved.');
        }
    }

    function assembleUserPreferences() {
        var preferences = {};

        inputElements.forEach(function (input) {

            var prefKey = input.name;

            if (prefKey.substr(-2, 2) === '[]') {
                prefKey = prefKey.substr(0, prefKey.length - 2);
                if (!isArray(preferences[prefKey])) {
                    preferences[prefKey] = [];
                }
                // Only keep set values of checkboxes:
                if (typeof input.value !== 'undefined' &&
                        !(input.type === 'checkbox' && !input.checked)) {
                    preferences[prefKey].push(input.value);
                }
            } else {
                if (!(input.type === 'checkbox' && !input.checked)) {
                    preferences[prefKey] = input.value;
                }
            }

        });

        return preferences;
    }

    function saveUserPreferences() {
        extension.sendMessage({
            updateUserPreferences: assembleUserPreferences()
        }, confirmUserPreferencesSave);
    }

    function hookInputElement(input, optionValue) {

        if (isArray(optionValue)) {
            if (input.type === 'checkbox') {
                input.checked = (optionValue.indexOf(input.value) !== -1);
            }/* else {
                // todo...
            }*/
        } else if (typeof optionValue !== 'undefined') {
            if (input.type === 'checkbox') {
                input.checked = true;
            } else {
                input.value = optionValue;
            }
        } else {
            if (input.type !== 'checkbox') {
                input.value = optionValue || input.value || '';
            }
        }

        // Avoid duplicate event listeners:
        input.removeEventListener('change', saveUserPreferences);
        input.addEventListener('change', saveUserPreferences);
    }

    /**
     * Updates the HTML form representing user preferences:
     * @param  {Object}    preferences User preferences object.
     * @return {Undefined}
     */
    function updateUserPreferencesForm(preferences) {
        inputElements.forEach(function (inputElement) {
            var optionKey = (inputElement.name.substr(-2, 2) === '[]')
                    ? inputElement.name.substr(0, inputElement.name.length - 2)
                    : inputElement.name,
                optionValue = (preferences) ? preferences[optionKey] : undefined;
            hookInputElement(inputElement, optionValue);
        });
    }

    /**
     * Handles messages arriving from background page.
     * @param  {Object}   request  Request object.
     * @param  {Object}   sender   Sender object.
     * @param  {Function} callback Callback to be executed.
     * @return {Boolean}           Always returns true because Chrome wants so.
     */
    // function messageHandler(request, sender, callback) {

    //     // If for some reason the background page decides to update the user
    //     // preferences it will trigger a "userPreferencesUpdated" event. By
    //     // listening to this event we ensure synchronization between the user
    //     // preferences data and its representation on the options page:
    //     if (request.userPreferencesUpdated) {
    //         updateUserPreferencesForm(request.userPreferencesUpdated);
    //     }

    //     return true;
    // }

    /* -------------------------------- MAIN -------------------------------- */

    // Establish the communication interface:
    // extension.onMessage.addListener(messageHandler);

    function route(hash) {
        if (typeof hash !== 'string') {
            hash = location.hash;
        } else {
            location.hash = hash;
        }
        if (hash === '#about') {
            document.getElementById('section-about').classList.remove('offscreen');
            document.getElementById('section-options').classList.add('offscreen');
        } else {
            document.getElementById('section-about').classList.add('offscreen');
            document.getElementById('section-options').classList.remove('offscreen');
        }
    }

    window.addEventListener('hashchange', route);
    route(location.hash || '#options');

    // Begin by loading previously-saved user preferences:
    loadUserPreferences(function (response) {
        if (response.error) {
            displayError(response.error);
        } else {
            updateUserPreferencesForm(response.preferences);
        }
    });

}(window, document, chrome.extension));