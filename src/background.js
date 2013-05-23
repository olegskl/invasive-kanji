/*jslint browser: true, devel: true */
/*globals chrome */

(function (window, chrome) {
    'use strict';

    var dictionarySource = 'dictionary.json',
        dictionary,
        userPreferences = {},
        storage = window.localStorage,
        round = Math.round,
        random = Math.random,
        isArray = Array.isArray;

    /**
     * Obtains a random entry from the dictionary.
     * @param [Function]   callback A function called with error and entry object.
     * @return {Undefined}
     */
    function getRandomDictionaryEntry(callback) {
        // Validate the dictionary:
        if (!isArray(dictionary)) {
            callback({error: 'Bad dictionary.'});
        } else if (!dictionary.length) {
            callback({error: 'Empty dictionary.'});
        } else {
            callback({
                entry: dictionary[round(random() * (dictionary.length - 1))]
            });
        }
    }

    /**
     * Loads previously-saved user preferences.
     * @param  {Function}  callback ...
     * @return {Undefined}
     */
    function loadUserPreferences(callback) {
        try {
            callback({
                preferences: JSON.parse(storage.getItem('userPreferences'))
            });
        } catch (error) {
            callback({error: 'Failed to load user preferences. ' + error});
        }
    }

    /**
     * Saves user preferences.
     * @param  {Function}  callback ...
     * @return {Undefined}
     */
    function saveUserPreferences(preferences, callback) {
        try {
            storage.setItem('userPreferences', JSON.stringify(preferences));
            userPreferences = preferences;
            callback({preferences: preferences});
        } catch (error) {
            callback({error: 'Failed to save user preferences. ' + error});
        }
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
                callback({
                    error: null/*,
                    dictionary: dictionary,
                    preferences: preferences*/
                });
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
        if (request.entry) {
            // Return a random dictionary entry by default:
            getRandomDictionaryEntry(callback);
        } else if (request.updateUserPreferences) {

            saveUserPreferences(request.updateUserPreferences, function (res) {
                var preferences = request.updateUserPreferences;
                if (res.error) {
                    callback({
                        error: 'Failed to save user preferences. ' + res.error
                    });
                } else {
                    loadDictionary(dictionarySource, preferences, callback);
                }
            });

        } else if (request.userPreferences) {
            // Call back with current user preferences:
            callback({preferences: userPreferences});
        } else {
            // Forward the request to the content script:
            chrome.tabs.sendMessage(sender.tab.id, request, callback);
        }

        // Chrome wants us to always return TRUE here so that callbacks can be
        // passed on to another message:
        return true;
    }

    /* -------------------------------- MAIN -------------------------------- */

    // Check whether new version is installed
    chrome.runtime.onInstalled.addListener(function (details) {
        if (details.reason === 'install'){
            chrome.tabs.create({url: 'options.html'});
        }
    });

    // Establish the communication interface:
    chrome.extension.onMessage.addListener(messageHandler);

    // Begin by obtaining the previously-saved user preferences:
    loadUserPreferences(function (response) {
        // On failure do NOT touch the dictionary or the preferences reference:
        if (!response.error) {
            // Keep a user preferences reference for faster access:
            userPreferences = response.preferences;
            // Load the dictionary asynchronously:
            loadDictionary(dictionarySource, response.preferences);
        }
    });

}(window, chrome));