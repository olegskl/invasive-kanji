# <img src="/extension/images/icon_48.png" align="absmiddle"> Invasive Kanji

"Invasive Kanji" is a free and open-source Google Chrome extension for people who lack motivation or time to learn Japanese. Once installed and enabled, this extension will *make* you study kanji and/or kana as you browse the Internet.

The extension tries to be as invasive as possible, but without ill side effects. It doesn't track browsing activity, doesn't steal information, doesn't affect functionality of the websites you visit.

There are many features planned ahead. If you have suggestions or problems using the extension, please [submit a bug or a feature request](https://github.com/olegskl/invasive-kanji/issues/). If you are a developer, you are very welcome to [contribute by forking this project here on github](https://github.com/olegskl/invasive-kanji/fork).

### Screenshots

<img src="/screenshots/interface_main.png"><img src="/screenshots/interface_options.png">

### Installation

1. Download the **[latest beta](https://github.com/olegskl/invasive-kanji/blob/master/extension.zip?raw=true)** (recommended) or the **[development version](https://github.com/olegskl/invasive-kanji/blob/develop/extension.zip?raw=true)** of the repository.
2. Unarchive the downloaded file to your preferred location (whichever suits you).
3. Using **Google Chrome** browser, navigate to chrome://extensions/ and enable "Developer mode" in the upper right corner.
4. Click on the <kbd>Load unpacked extension...</kbd> button, browse to the unarchived directory and confirm.

If you have completed the above steps, the "options" page will open indicating successfull installation of the extension. Start browsing the Internet and learning Japanese at the same time.

### Usage

To use the extension simply start browsing the Internet. Once a web page loads, a random question will be presented to you, hiding the contents of the page. To see the page you have to answer correctly within ten seconds!

If you fail to provide a correct answer in time, a valid answer will be displayed on screen. Take your time remembering it, then hit the <kbd>Enter</kbd> key to try another question.

If you feel tired, or need to be really productive in the next couple of hours, you can temporarily disable the application by navigating to chrome://extensions/ and unchecking the "Enabled" checkbox next to "Invasive Kanji".

You can access the extension options by clicking the "options" link on the bottom of the question interface or in your installed extensions list.

### Changelog of v0.6 beta

- Both "options" and "about" page now open in a new tab by default;
- When multiple "options" pages are open at the same time, modifications in one of them are now immediately reflected in others;
- Fixed iframe rectangle flickering just before the main interface is rendered;
- Fixed unexpected section transition on the "about" page;
- Realigned the elements of the main interface;
- Added a progress indicator of the question timer to the main interface.

### License

<a rel="license" href="http://creativecommons.org/licenses/by-sa/3.0/"><img alt="Creative Commons License" src="http://i.creativecommons.org/l/by-sa/3.0/88x31.png" align="absmiddle"></a> This work is licensed under a <a rel="license" href="http://creativecommons.org/licenses/by-sa/3.0/">Creative Commons Attribution-ShareAlike 3.0 Unported License</a>.

This package uses the KANJIDIC dictionary file. This file is the property of the [Electronic Dictionary Research and Development Group](http://www.edrdg.org/), and is used in conformance with the Group's [license](http://www.edrdg.org/edrdg/licence.html).