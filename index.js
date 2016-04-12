"use strict";

const rp = require("request-promise");
const cheerio = require("cheerio");
const co = require("co");

const LIRC_URL = "http://lirc.sourceforge.net/remotes/";

function* getOEMLink(oem) {
	// first get the page
	const rawPage = yield rp(LIRC_URL);
	// do some filtering on the OEM
	const lowerCaseOEM = oem.toLowerCase();
	// replace all spaces with underscores, everything else should be good
	const filteredOEM = lowerCaseOEM.replace(/ /g, "_");
	// set the pattern [ "oem/" ]
	const oemPattern = new RegExp(`"${filteredOEM}\\/"`, "g");
	// check if it exists in the page
	console.log(oemPattern);
	if (oemPattern.test(rawPage) === true) {
		console.log(`The OEM ${filteredOEM} is in the page!`);
	} else {
		console.log(`The OEM ${filteredOEM} is not in the page!`);
	}
	return null;
}

co(function* send() {
	const result = yield getOEMLink("sony");
}).catch(onerror);

function onerror(err) {
	// log any uncaught errors
	// co will not throw any errors you do not handle!!!
	// HANDLE ALL YOUR ERRORS!!!
	console.error(err.stack);
}
