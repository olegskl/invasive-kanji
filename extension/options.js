/*jslint browser: true */
/*globals chrome */

(function (window, document, storage) {
    'use strict';

    var isArray = Array.isArray,
        slice = Array.prototype.slice,
        inputElements = slice.call(document.querySelectorAll('input')),
        sectionsElement = document.getElementById('sections'),
        optionsNavElement = document.getElementById('options');

    /**
     * Confirms user preferences save by triggering a fancy animation.
     * @return {Undefined}
     */
    function confirmUserPreferencesSave() {
        if (!optionsNavElement) { return; }
        // Reset the animation name to be able to run it again:
        optionsNavElement.style.removeProperty('-webkit-animation-name');
        // Trigger reflow for animation to take effect:
        if (optionsNavElement.offsetWidth) {
            // Reassign the animation name so that it runs:
            optionsNavElement.style
                .setProperty('-webkit-animation-name', 'confirmsave');
        }
    }

    /**
     * Derives a part of user preferences from the state of an input element.
     * Used in the reducer function of the user preferences assembly method.
     * @param  {Object} preferences The user preferences object.
     * @param  {Object} input       A node element.
     * @return {Object} The user preferences object for a given input element.
     */
    function inputElementValueReducer(preferences, input) {
        var prefKey = input.name;

        if (prefKey.substr(-2, 2) === '[]') {
            prefKey = prefKey.substr(0, prefKey.length - 2);
            if (!isArray(preferences[prefKey])) {
                preferences[prefKey] = [];
            }
            // Only keep set values of checkboxes:
            if (input.value !== undefined &&
                    !(input.type === 'checkbox' && !input.checked)) {
                preferences[prefKey].push(input.value);
            }
        } else {
            if (!(input.type === 'checkbox' && !input.checked)) {
                preferences[prefKey] = input.value;
            }
        }

        return preferences;
    }

    /**
     * Derives an assembly of user preferences from the state of input elements.
     * @return {Object} The user preferences object.
     */
    function assembleUserPreferences() {
        return inputElements.reduce(inputElementValueReducer, {});
    }

    /**
     * Persists user preferences with the available storage mechanism.
     * @return {Undefined}
     */
    function saveUserPreferences() {
        storage.sync.set({
            userPreferences: assembleUserPreferences()
        }, confirmUserPreferencesSave);
    }

    /**
     * Sets an input element's state according to the relevant value in user
     * preferences and keeps track of user interactions with the element.
     * @param  {NodeElement} input       An input element.
     * @param  {*}           optionValue User preference value.
     * @return {Undefined}
     */
    function hookInputElement(input, optionValue) {
        // Set the element's value:
        if (isArray(optionValue)) {
            if (input.type === 'checkbox') {
                input.checked = (optionValue.indexOf(input.value) !== -1);
            }/* else {
                // todo...
            }*/
        } else if (optionValue !== undefined) {
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
        // Keep track of any modifications:
        input.addEventListener('change', saveUserPreferences);
    }

    /**
     * Updates the HTML form representing user preferences:
     * @param  {Object}    preferences User preferences object.
     * @return {Undefined}
     */
    function updateUserPreferencesForm(preferences) {
        inputElements.forEach(function (inputElement) {
            var optionKey = (inputElement.name.substr(-2, 2) === '[]') ?
                    inputElement.name.substr(0, inputElement.name.length - 2) :
                    inputElement.name,
                optionValue = preferences ?
                    preferences[optionKey] :
                    undefined;
            hookInputElement(inputElement, optionValue);
        });
    }

    /**
     * Performs the routing operation to the section represented by URL hash.
     * @param  {String}    hash A URL hash representing routing destination.
     * @return {Undefined}
     */
    function routeTo(hash) {
        // Obtain a reference to the section where we want to route,
        // mind that the hash contains a leading # character which
        // is not present in the section id:
        var targetSectionId = 'section-' + hash.substr(1),
            targetSection = document.getElementById(targetSectionId);
        if (targetSection) {
            location.hash = hash;
            sectionsElement.style.webkitTransform = 'translateX(-' +
                targetSection.offsetLeft + 'px)';
        }
    }

    /**
     * Performs the routing operation without any transition.
     * @param  {String}    hash A URL hash representing routing destination.
     * @return {Undefined}
     */
    function routeWithoutTransitionTo(hash) {
        // We need to keep the duration property as it is defined in the CSS:
        var duration = window.getComputedStyle(sectionsElement)
                .webkitTransitionDuration;
        // Temporarily set the transition duration to zero to avoid transition:
        sectionsElement.style.webkitTransitionDuration = '0s';
        // Perform the actual routing:
        routeTo(hash);
        // Trigger reflow:
        if (sectionsElement.offsetWidth) {
            // Restore the original transition duration:
            sectionsElement.style.webkitTransitionDuration = duration;
        }
    }

    /**
     * Handles location hash change event by performing a route operation.
     * @return {Undefined}
     */
    function locationHashChangeHandler() {
        // In case when route is called on hashChange event, the hash argument
        // will not be available, so we refer to the current one in the URL:
        routeTo(location.hash);
    }

    /**
     * Handles user preferences change event by updating the HTML form.
     * @param  {Object}    changes A key-value map of changed items.
     * @return {Undefined}
     */
    function userPreferencesChangeEventHandler(changes) {
        if (changes.userPreferences) {
            updateUserPreferencesForm(changes.userPreferences.newValue);
        }
    }

    /**
     * Handles storage sync event by updating the HTML form.
     * @param  {Object}    storageContainer Storage container with the
     *                                      userPreferences property.
     * @return {Undefined}
     */
    function userPreferencesLoadEventHandler(storageContainer) {
        // Chrome insists on returning a storage container in storage.sync.get 
        // API, so we need to obtain the desired property from it:
        var preferences = storageContainer.userPreferences || {};
        // On failure avoid touching the form:
        if (typeof preferences === 'object') {
            updateUserPreferencesForm(preferences);
        }
    }

    /* -------------------------------- MAIN -------------------------------- */

    // The first routing must be performed without CSS transition:
    routeWithoutTransitionTo(location.hash || '#options');

    // Establish a URL hash change event listener:
    window.addEventListener('hashchange', locationHashChangeHandler);

    // Establish a user preferences change event listener:
    storage.onChanged.addListener(userPreferencesChangeEventHandler);

    // Begin by loading previously-saved user preferences:
    storage.sync.get('userPreferences', userPreferencesLoadEventHandler);

}(window, document, chrome.storage));