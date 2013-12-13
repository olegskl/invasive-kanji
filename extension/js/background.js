/*jslint browser: true */
/*globals chrome */

(function (runtime, storage, tabs) {
    'use strict';

    var dictionarySource = 'dictionary.json',
        dictionary,
        userPreferences = {},
        isArray = Array.isArray;

    /**
     * Obtains a random index of a given array.
     * @param  {Array}  array An array of items.
     * @return {Number}       A randomly picked index of the given array.
     */
    function randomIndexOf(array) {
        return Math.floor(Math.random() * array.length);
    }

    /**
     * Obtains a random entry from a given dictionary.
     * @param [Array]      dictionary A dictionary to pick an entry from.
     * @param [Function]   callback   Called with error or entry property.
     * @return {Undefined}
     */
    function getRandomDictionaryEntry(dictionary, callback) {
        // Validate the dictionary:
        if (!isArray(dictionary)) {
            callback({error: 'Bad dictionary.'});
        } else if (!dictionary.length) {
            callback({error: 'Empty dictionary.'});
        } else {
            callback({entry: dictionary[randomIndexOf(dictionary)]});
        }
    }
    
    /**
     * @param  {Object}    preferences User preferences to save.
     * @param  {Function}  callback    Called on task completion.
     * @return {Undefined}
     */
    function saveUserPreferences(preferences, callback) {
        storage.sync.set({userPreferences: preferences}, function () {
            callback({error: runtime.lastError});
        });
    }

    function getJSON(address, callback) {
        var xhr = new XMLHttpRequest();

        function readyStateChangeHandler() {

            if (xhr.readyState !== 4) { return; }
            if (xhr.status !== 200) {
                callback({error: 'Request failed with status ' + xhr.status});
            }

            try {
                callback({json: JSON.parse(xhr.responseText)});
            } catch (e) {
                callback({error: 'Failed to parse JSON.'});
            }
        }

        xhr.open('GET', address, true);
        xhr.onreadystatechange = readyStateChangeHandler;
        xhr.send();
    }

    /**
     * Loads a dictionary from a specified source with specified preferences.
     * @param  {String}    dictionarySource Dictionary location URL.
     * @param  {Object}    preferences      User preferences.
     * @param  {Function}  callback         Callback called on completion.
     * @return {Undefined}
     */
    function loadDictionary(dictionarySource, preferences, callback) {

        // Callback is optional:
        if (typeof callback !== 'function') {
            callback = function () {};
        }

        function dictionaryFilter(entry) {
            if (entry.dictionary !== undefined &&
                    isArray(preferences.dictionaries) &&
                    preferences.dictionaries.indexOf(entry.dictionary) === -1) {
                return false;
            }
            if (entry.grade !== undefined && isArray(preferences.grades) &&
                    preferences.grades.indexOf(entry.grade) === -1) {
                return false;
            }
            return true;
        }

        getJSON(dictionarySource, function (response) {
            if (response.error) {
                callback(response);
            } else {
                dictionary = response.json.filter(dictionaryFilter);
                callback({error: null});
            }
        });
    }

    /**
     * Handles messages arriving from content scripts and pages.
     * @param  {Object}   request  Request object.
     * @param  {Object}   sender   Sender object.
     * @param  {Function} callback Callback to be executed.
     * @return {Boolean}           Always returns true because Chrome wants so.
     */
    function messageHandler(request, sender, callback) {
        // Only reply to tabs:
        if (!sender.tab) { return; }

        // On question request get random dictionary entry and apply it to
        // the callback provided by the caller:
        if (request === 'randomDictionaryEntryRequest') {

            // Return a random dictionary entry by default:
            getRandomDictionaryEntry(dictionary, callback);

        } else if (request.updateUserPreferences) {

            // Attempt to save the new preferences:
            saveUserPreferences(request.updateUserPreferences, callback);

        } else if (request.userPreferences) {
            // Callback with current user preferences:
            callback({preferences: userPreferences});
        } else {
            // Forward the request to the content script:
            tabs.sendMessage(sender.tab.id, request, callback);
        }

        // Chrome wants us to always return TRUE here so that callbacks can be
        // passed on to another message:
        return true;
    }

    /**
     * Handles chrome runtime onInstalled event by opening the options page.
     * @see http://developer.chrome.com/extensions/runtime.html
     * @param  {Object}    details Container for onInstalled event properties.
     * @return {Undefined}
     */
    function onInstalledEventHandler(details) {
        // Check for event dispatch reason;
        // can be one of "install", "update", or "chrome_update":
        if (details && details.reason === 'install') {
            tabs.create({url: 'options.html#options'});
        }
    }

    /**
     * Handles storage sync event by storing the user preferences locally and
     * loading the dictionary based on those preferences.
     * @param  {Object}    storageContainer Storage container with the
     *                                      userPreferences property.
     * @return {Undefined}
     */
    function userPreferencesLoadEventHandler(storageContainer) {
        // Chrome insists on returning a storage container in storage.sync.get 
        // API, so we need to obtain the desired property from it:
        var preferences = storageContainer.userPreferences;
        // On failure do NOT touch the dictionary or the preferences reference:
        if (preferences && typeof preferences === 'object') {
            // Keep the preferences object locally for faster access:
            userPreferences = preferences;
            // Load the dictionary asynchronously:
            loadDictionary(dictionarySource, preferences);
        }
    }

    /**
     * Handles user preferences change event by updating a local copy.
     * @param  {Object}    changes A key-value map of changed items.
     * @return {Undefined}
     */
    function userPreferencesChangeEventHandler(changes) {
        if (!changes.userPreferences) {
            return;
        }
        // Update the local copy of user preferences:
        userPreferences = changes.userPreferences.newValue;
        // Load the dictionary asynchronously:
        loadDictionary(dictionarySource, userPreferences);
    }

    /* -------------------------------- MAIN -------------------------------- */

    // Check whether new version is installed:
    runtime.onInstalled.addListener(onInstalledEventHandler);

    // Establish the communication interface:
    runtime.onMessage.addListener(messageHandler);

    // Establish a user preferences change event listener:
    storage.onChanged.addListener(userPreferencesChangeEventHandler);

    // Begin by obtaining the previously-saved user preferences:
    storage.sync.get('userPreferences', userPreferencesLoadEventHandler);

}(chrome.runtime, chrome.storage, chrome.tabs));